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
  constructor(private authService: AuthService) {}

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
  @ApiOperation({ summary: 'Iniciar sesión y obtener JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  @ApiOperation({ summary: 'Cambiar empresa activa — retorna nuevo JWT con empresaId actualizado' })
  cambiarEmpresa(@GetUser() user: User, @Body() dto: CambiarEmpresaDto) {
    return this.authService.cambiarEmpresa(user.id, user.role, dto.empresaId);
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
  @ApiOperation({ summary: 'Callback de Google OAuth — genera JWT y redirige al frontend' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://hicloudrd.com';
    try {
      const loginData = await this.authService.buildLoginResponse(req.user as User);
      const params = new URLSearchParams({
        token:        loginData.accessToken,
        empresaId:    String(loginData.empresaActual ?? ''),
        nombre:       loginData.user.nombre,
        email:        loginData.user.email,
        role:         loginData.user.role,
      });
      return (res as any).redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch {
      return (res as any).redirect(`${frontendUrl}/login?error=google_failed`);
    }
  }
}
