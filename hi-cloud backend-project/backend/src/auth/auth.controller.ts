import {
  Controller, Post, Get, Patch, Delete, Body, Param, ParseIntPipe,
  HttpCode, HttpStatus, UseGuards, Req, Res, BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches, IsInt, IsPositive, IsIn } from 'class-validator';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshTokenService } from './refresh-token.service';

class CambiarEmpresaDto {
  @IsInt() @IsPositive()
  empresaId: number;
}

class CambiarSucursalDto {
  @IsInt() @IsPositive()
  sucursalId: number;
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

class UpdateProfileDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  nombre: string;
}

class ContactoSoporteDto {
  @IsString() @MinLength(2) @MaxLength(100)
  nombre: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(10) @MaxLength(1000)
  mensaje: string;
}

class UpdateTemaSidebarDto {
  @IsString()
  @IsIn(['nube', 'marea', 'indigo', 'bosque', 'cemento', 'ciruela', 'bronce', 'cobalto', 'azul', 'verde', 'petroleo', 'violeta'])
  temaSidebar: string;
}

class SetupPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'Debe tener al menos una mayúscula y un número',
  })
  password: string;

  @IsString()
  confirmPassword: string;
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
  @SkipThrottle() // bloqueo progresivo propio por email+IP vía LoginAttemptsService
  @ApiOperation({ summary: 'Iniciar sesión — setea cookies httpOnly access_token + refresh_token' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Leer IP real del cliente (Nginx propaga X-Real-IP configurado como $remote_addr)
    const ip = (
      (req.headers['x-real-ip'] as string | undefined)?.trim()
      ?? (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.ip
      ?? 'unknown'
    );
    const data = await this.authService.login(dto, ip);

    // Si 2FA está activo → guardar token temporal y pedir código TOTP
    if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
      const isProd = process.env.NODE_ENV === 'production';
      (res as any).cookie('2fa_pending', data.pending2FAToken, {
        httpOnly: true, secure: isProd, sameSite: 'strict',
        maxAge: 5 * 60 * 1000,
      });
      return { requiresTwoFactor: true };
    }

    // Sesión activa detectada → pedir confirmación (sin cookie, sin refresh token)
    // El frontend muestra el modal; si el usuario confirma, reenvía con forceLogin:true
    if ('requiresSessionConfirmation' in data && data.requiresSessionConfirmation) {
      return data;  // { requiresSessionConfirmation: true, activeSession: {...} }
    }

    this.setAuthCookie(res, (data as any).accessToken);

    // refresh token con lifetime configurado por empresa (sesionHoras)
    const refreshValue = await this.refreshTokenSvc.crear(
      (data as any).user.id,
      req.headers['user-agent'],
      req.ip,
      (data as any).sessionLifetimeMs,
    );
    this.setRefreshCookie(res, refreshValue);

    const { accessToken: _tok, sessionLifetimeMs: _ms, ...safe } = data as any;
    return safe;
  }

  @Post('2fa/complete-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 intentos por minuto
  @ApiOperation({ summary: 'Segundo paso del login cuando 2FA está activo' })
  async complete2FALogin(
    @Body() body: { codigo: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pendingToken = (req.cookies as Record<string, string>)?.['2fa_pending'];
    if (!pendingToken) {
      throw new (require('@nestjs/common').UnauthorizedException)('Sesión 2FA expirada. Inicia sesión de nuevo.');
    }

    let data: any;
    try {
      data = await this.authService.completarLogin2FA(pendingToken, body.codigo);
    } catch (err) {
      // M-07: limpiar cookie temporal en cualquier fallo para forzar re-autenticación
      res.clearCookie('2fa_pending');
      throw err;
    }

    // Limpiar cookie temporal y emitir JWT completo
    res.clearCookie('2fa_pending');
    this.setAuthCookie(res, data.accessToken);
    const refreshValue = await this.refreshTokenSvc.crear(data.user.id, req.headers['user-agent'], req.ip);
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

  @Post('verificar-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } }) // 10 intentos por 5 min por IP
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verificar contraseña del usuario autenticado (POS screen lock)' })
  async verificarPassword(
    @Body() body: { password: string },
    @GetUser() usuario: User,
  ) {
    return this.authService.verificarPassword(usuario.email, body.password);
  }

  @Get('supervisores')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar supervisores disponibles del tenant (ADMIN/CONTADOR)' })
  async listarSupervisores(@GetUser() cajero: User) {
    return this.authService.listarSupervisores((cajero as any).empresaId);
  }

  @Post('verificar-supervisor')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 300_000 } }) // 5 intentos por 5 min por IP — brute-force guard
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verificar credenciales de supervisor (admin/contador del mismo tenant)' })
  async verificarSupervisor(
    @Body() body: { supervisorId?: number; email?: string; password: string; action?: string; detail?: string },
    @GetUser() cajero: User,
    @Req() req: Request,
  ) {
    const identifier = body.supervisorId ?? body.email;
    if (!identifier) throw new BadRequestException('Se requiere supervisorId o email');
    return this.authService.verificarSupervisor(
      identifier, body.password,
      cajero.id, (cajero as any).empresaId,
      body.action, body.detail,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesión — revoca access+refresh tokens y limpia cookies' })
  async logout(@GetUser() user: User, @Res({ passthrough: true }) res: Response) {
    // S-27: revocar access token en blacklist
    const jti = (user as any).jti;
    const exp = (user as any).exp;
    if (jti && exp) await this.blacklistSvc.blacklist(jti, exp);

    // Limpiar sessionToken + revocar refresh tokens.
    // NOTA: el refresh_token cookie tiene path:'/api/v1/auth/refresh' y no llega aquí —
    // authService.cerrarSesion() usa revocarTodos() y pone sessionToken=NULL (correcto en sesión única).
    await this.authService.cerrarSesion(user.id);

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
    // B-02: revocar también el access token actual para que no siga siendo válido
    const jti = (user as any).jti;
    const exp = (user as any).exp;
    if (jti && exp) await this.blacklistSvc.blacklist(jti, exp);

    await this.authService.cerrarSesion(user.id);
    res.clearCookie('access_token', this.cookieOptions());
    res.clearCookie('refresh_token', { ...this.cookieOptions(), path: '/api/v1/auth/refresh' });
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verificar sesión activa y obtener datos del usuario' })
  async getMe(@GetUser() user: User) {
    // Usado por el frontend al recargar la página para hidratar el store.
    //
    // El frontend guarda esta respuesta ENTERA en localStorage ('auth_user'),
    // así que aquí no puede salir nada sensible: lo que se devuelva queda
    // legible para cualquier XSS. Se excluyen explícitamente:
    //   - sessionToken: secreto de la sesión única (ya lo borra JwtStrategy,
    //     esto es la segunda capa por si alguien cambia aquel comportamiento)
    //   - jti / exp: metadatos del JWT que el cliente no necesita y que solo
    //     dan pistas sobre el token de la cookie httpOnly
    const {
      password:     _pw,
      sessionToken: _st,
      jti:          _jti,
      exp:          _exp,
      ...profile
    } = user as User & { password?: string; jti?: string; exp?: number };
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

  @Post('cambiar-sucursal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cambiar sucursal activa — genera nuevo token con sucursalId y almacenId actualizados' })
  async cambiarSucursal(
    @GetUser() user: User,
    @Body() dto: CambiarSucursalDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.cambiarSucursal(
      user.id, user.role, (user as any).empresaId, dto.sucursalId,
    );
    this.setAuthCookie(res, data.accessToken);
    const { accessToken: _tok, ...safe } = data;
    return safe;
  }

  @Get('mis-sucursales')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Sucursales accesibles para el usuario autenticado' })
  misSucursales(@GetUser() user: User) {
    return this.authService.misSucursales(user.id, user.role, (user as any).empresaId);
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

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar nombre del usuario autenticado' })
  updateProfile(
    @GetUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto.nombre);
  }

  @Patch('tema-sidebar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar tema de color del sidebar (preferencia por usuario)' })
  async updateTemaSidebar(
    @GetUser() user: User,
    @Body() dto: UpdateTemaSidebarDto,
  ) {
    await this.authService.updateTemaSidebar(user.id, dto.temaSidebar);
    return { temaSidebar: dto.temaSidebar };
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
      const googleUser = req.user as any;

      // Error semántico desde la estrategia (NO_ACCOUNT / NO_COMPANY)
      if (googleUser?._googleError) {
        const code = googleUser._googleError;
        return (res as any).redirect(`${frontendUrl}/login?error=${code}`);
      }

      // Aprobado pero sin contraseña configurada → generar token de setup y redirigir
      if (googleUser?.passwordConfigured === false) {
        const rawToken = await this.authService.generarSetupToken(googleUser.id);
        return (res as any).redirect(`${frontendUrl}/setup-password?token=${rawToken}`);
      }

      const loginData = await this.authService.buildLoginResponse(req.user as User);
      this.setAuthCookie(res as any, loginData.accessToken);
      const params = new URLSearchParams({
        empresaId: String(loginData.empresaActual ?? ''),
        nombre:    loginData.user.nombre,
        email:     loginData.user.email,
        role:      loginData.user.role,
      });
      return (res as any).redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
    } catch (err: any) {
      // Errores semánticos de Google OAuth → redirigir con código específico
      const code = err?.message;
      if (code === 'NO_ACCOUNT') {
        return (res as any).redirect(`${frontendUrl}/login?error=google_no_account`);
      }
      if (code === 'NO_COMPANY') {
        return (res as any).redirect(`${frontendUrl}/login?error=google_no_company`);
      }
      return (res as any).redirect(`${frontendUrl}/login?error=google_failed`);
    }
  }

  // ── Setup Password (Google users post-aprobación) ─────────────────────────

  @Post('setup-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 intentos por hora
  @ApiOperation({ summary: 'Configurar contraseña inicial para usuario aprobado (Google OAuth)' })
  async setupPassword(
    @Body() dto: SetupPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.authService.setupPassword(dto.token, dto.password, dto.confirmPassword);
    this.setAuthCookie(res, data.accessToken);
    const refreshValue = await this.refreshTokenSvc.crear(
      data.user.id,
      req.headers['user-agent'],
      req.ip,
    );
    this.setRefreshCookie(res, refreshValue);
    const { accessToken: _tok, ...safe } = data;
    return safe;
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private cookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    // La cookie debe durar ligeramente más que el JWT para que el navegador la
    // envíe al endpoint cuando el token expire y se dispare el refresh.
    // JWT_EXPIRES_IN default = '15m'; agregamos 5 min de margen.
    const jwtMs = this.parseJwtExpiry(process.env.JWT_EXPIRES_IN ?? '15m');
    return {
      httpOnly:  true,
      secure:    isProd,
      sameSite:  'strict' as const,
      maxAge:    jwtMs + 5 * 60_000, // expiry JWT + 5 min buffer
      path:      '/',
    };
  }

  private parseJwtExpiry(exp: string): number {
    const m = exp.match(/^(\d+)(s|m|h|d)$/);
    if (!m) return 15 * 60_000;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
      case 's': return n * 1_000;
      case 'm': return n * 60_000;
      case 'h': return n * 3_600_000;
      case 'd': return n * 86_400_000;
      default:  return 15 * 60_000;
    }
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

  // ── Stats de plataforma públicas (sin autenticación, caché 24h) ─────────
  @Get('stats-plataforma')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } }) // 60 req/min por IP
  @ApiOperation({ summary: 'Stats públicas de plataforma para el panel de login' })
  statsPlataforma() {
    return this.authService.statsPlataforma();
  }

  // ── Formulario de soporte público (sin autenticación) ────────────────────
  @Post('contacto-soporte')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 mensajes por hora por IP
  @ApiOperation({ summary: 'Formulario de soporte — envía mensaje al equipo HiCloud' })
  contactoSoporte(@Body() dto: ContactoSoporteDto) {
    return this.authService.enviarMensajeSoporte(dto);
  }

  // ── Sesiones activas (dispositivos conectados) ────────────────────────────

  @Get('mis-sesiones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lista las sesiones activas del usuario (dispositivos conectados)' })
  misSesiones(@GetUser() user: User) {
    return this.refreshTokenSvc.sesionesActivas(user.id);
  }

  @Delete('sesiones/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cerrar una sesión específica por ID (no permite cerrarse a sí mismo)' })
  async revocarSesion(
    @Param('id') id: string,
    @GetUser() user: User,
    @Req() req: Request,
  ) {
    // Protección extra: el cliente debe enviar el ID de la sesión actual para que el backend
    // pueda verificar que no está intentando cerrarse a sí mismo con el mismo refresh token.
    // La UI marcará la sesión actual y deshabilitará su botón de cerrar.
    await this.refreshTokenSvc.revocarPorId(id, user.id);
    return { message: 'Sesión cerrada correctamente' };
  }

  // ── Super admin: forzar cierre de sesión de un usuario ────────────────────
  @Post('usuarios/:id/cerrar-sesion')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Super admin: cerrar sesión activa de un usuario (S-32: DB lookup vía RolesGuard)' })
  forzarLogout(@Param('id', ParseIntPipe) id: number) {
    return this.authService.forzarLogout(id);
  }
}
