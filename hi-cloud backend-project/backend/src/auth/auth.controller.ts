import {
  Controller, Post, Get, Patch, Body, Param,
  HttpCode, HttpStatus, UseGuards, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches, IsInt, IsPositive } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshTokenService } from './refresh-token.service';

class CambiarEmpresaDto {
  @IsInt() @IsPositive()
  empresaId: number;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, {
    message: 'Debe tener mayúscula, minúscula y número',
  })
  password: string;
}

class ChangePasswordDto {
  @IsString({ message: 'La contraseña actual debe ser texto' })
  currentPassword: string;

  @IsString({ message: 'La nueva contraseña debe ser texto' })
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100, { message: 'La nueva contraseña no puede superar 100 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La nueva contraseña debe tener al menos una mayúscula, una minúscula y un número',
  })
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService:       AuthService,
    private blacklistSvc:      TokenBlacklistService,
    private refreshTokenSvc:   RefreshTokenService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) // 5 registros por hora por IP
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 intentos por minuto por IP
  @ApiOperation({ summary: 'Iniciar sesión — setea cookies httpOnly access_token + refresh_token' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.login(dto);
    this.setAuthCookie(res, data.accessToken);

    // S-28: refresh token de 30 días en cookie httpOnly restringida a /auth/refresh
    const refreshValue = await this.refreshTokenSvc.crear(
      data.user.id,
      req.headers['user-agent'],
      req.ip,
    );
    this.setRefreshCookie(res, refreshValue);

    const { accessToken: _tok, ...safe } = data;
    return safe;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 refresh por minuto por IP
  @ApiOperation({ summary: 'S-28: Renovar access token usando refresh token (cookie httpOnly)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshValue = (req.cookies as Record<string, string>)?.refresh_token;
    if (!refreshValue) {
      throw new (require('@nestjs/common').UnauthorizedException)('Sin refresh token');
    }

    const { userId, newRefreshValue } = await this.refreshTokenSvc.rotar(
      refreshValue,
      req.headers['user-agent'],
      req.ip,
    );

    // Generar nuevo access token
    const newAccess = await this.authService.buildAccessTokenForUser(userId);
    this.setAuthCookie(res, newAccess);
    this.setRefreshCookie(res, newRefreshValue);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesión — revoca access+refresh tokens y limpia cookies' })
  async logout(@GetUser() user: User, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // S-27: revocar access token en blacklist
    const jti = (user as any).jti;
    const exp = (user as any).exp;
    if (jti && exp) await this.blacklistSvc.blacklist(jti, exp);

    // S-28: revocar refresh token
    const refreshValue = (req.cookies as Record<string, string>)?.refresh_token;
    if (refreshValue) await this.refreshTokenSvc.revocarUno(refreshValue);

    res.clearCookie('access_token', this.cookieOptions());
    res.clearCookie('refresh_token', { ...this.cookieOptions(), path: '/api/v1/auth/refresh' });
    return { message: 'Sesión cerrada correctamente' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesión en todos los dispositivos' })
  async logoutAll(@GetUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.refreshTokenSvc.revocarTodos(user.id);
    res.clearCookie('access_token', this.cookieOptions());
    res.clearCookie('refresh_token', { ...this.cookieOptions(), path: '/api/v1/auth/refresh' });
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verificar sesión activa y obtener datos del usuario' })
  async getMe(@GetUser() user: User) {
    // Usado por el frontend al recargar la página para hidratar el store
    const { password: _pw, ...profile } = user as User & { password?: string };
    return { user: profile };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  getProfile(@GetUser() user: User) {
    const { password: _pw, ...profile } = user as User & { password?: string };
    return { user: profile };
  }

  // ── Password Reset ─────────────────────────────────────────────────────────

  @Post('cambiar-empresa')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cambiar empresa activa — setea nueva cookie con empresaId actualizado' })
  async cambiarEmpresa(
    @GetUser() user: User,
    @Body() dto: CambiarEmpresaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.cambiarEmpresa(user.id, user.role, dto.empresaId);
    this.setAuthCookie(res, data.accessToken);
    const { accessToken: _tok, ...safe } = data;
    return safe;
  }

  @Get('mis-empresas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar todas las empresas del usuario autenticado' })
  misEmpresas(@GetUser() user: User) {
    return this.authService.misEmpresas(user.id, user.role === 'admin');
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 por hora
  @ApiOperation({ summary: 'Solicitar reset de contraseña — envía email con enlace' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 en 15 min
  @ApiOperation({ summary: 'Restablecer contraseña con el token del email' })
  resetPassword(
    @Param('token') token: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(token, dto.password);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 cambios por hora
  @ApiOperation({ summary: 'Cambiar contraseña desde sesión activa (requiere contraseña actual)' })
  changePassword(
    @GetUser() user: User,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  // ── Email verification ────────────────────────────────────────────────────

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 intentos por hora por IP
  @ApiOperation({ summary: 'Verificar correo con token (desde el enlace del email)' })
  verifyEmail(@Body('token') token: string) {
    if (!token) throw new (require('@nestjs/common').BadRequestException)('Token requerido');
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 reenvíos por hora
  @ApiOperation({ summary: 'Reenviar correo de verificación' })
  resendVerification(@Body('email') email: string) {
    if (!email) throw new (require('@nestjs/common').BadRequestException)('Email requerido');
    return this.authService.resendVerificationEmail(email);
  }

  // ── Tour onboarding ───────────────────────────────────────────────────────

  @Patch('tour-completado')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Marcar el tour de bienvenida como completado' })
  async marcarTourCompletado(@GetUser() user: User) {
    await this.authService.marcarTourCompletado(user.id);
    return { ok: true };
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Iniciar flujo OAuth con Google' })
  async googleAuth() {
    // Passport redirige automáticamente a Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback de Google OAuth — setea cookie httpOnly y redirige' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://hicloudrd.com';
    try {
      const loginData = await this.authService.buildLoginResponse(req.user as User);
      // S-41: token en cookie httpOnly, NO en la URL
      this.setAuthCookie(res as any, loginData.accessToken);
      const params = new URLSearchParams({
        empresaId: String(loginData.empresaActual ?? ''),
        nombre:    loginData.user.nombre,
        email:     loginData.user.email,
        role:      loginData.user.role,
      });
      return (res as any).redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch {
      return (res as any).redirect(`${frontendUrl}/login?error=google_failed`);
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private cookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly:  true,
      secure:    isProd,           // HTTPS solo en producción
      sameSite:  'strict' as const,
      maxAge:    24 * 60 * 60 * 1000,  // 24h (igual que la expiración del JWT)
      path:      '/',
    };
  }

  private setAuthCookie(res: Response, token: string): void {
    (res as any).cookie('access_token', token, this.cookieOptions());
  }

  private setRefreshCookie(res: Response, value: string): void {
    (res as any).cookie('refresh_token', value, {
      ...this.cookieOptions(),
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      path:   '/api/v1/auth/refresh',    // Solo se envía al endpoint de refresh
    });
  }
}
