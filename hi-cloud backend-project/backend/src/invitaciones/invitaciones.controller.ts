import {
  Controller, Get, Post, Delete, Body, Param, UseGuards,
  ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { InvitacionesService } from './invitaciones.service';
import { UserRole, ROLES_ASIGNABLES_EMPRESA } from '../users/enums/user-role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { TenantService } from '../tenant/tenant.service';
import { User } from '../users/users.entity';

class CreateInvitacionDto {
  @IsEmail()    email!: string;

  // S-60: lista blanca — con @IsEnum(UserRole) un admin de empresa podía invitar
  // con rol 'super_admin' y el endpoint PÚBLICO de aceptación escribía
  // users.role = 'super_admin', escalando a administrador de plataforma.
  @IsIn(ROLES_ASIGNABLES_EMPRESA as UserRole[], {
    message: `Rol inválido. Permitidos: ${ROLES_ASIGNABLES_EMPRESA.join(', ')}`,
  })
  rol!: UserRole;
}

class AceptarInvitacionDto {
  @IsOptional() @IsString() @MinLength(2)  nombre?:   string;
  @IsOptional() @IsString() @MinLength(6)  password?: string;
}

@ApiTags('Invitaciones de Equipo')
@Controller('invitaciones')
export class InvitacionesController {
  constructor(
    private svc:         InvitacionesService,
    private tenantSvc:   TenantService,
  ) {}

  // ── Rutas protegidas (solo admin de la empresa) ──────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invitar usuario a la empresa por email' })
  crear(
    @Body() dto: CreateInvitacionDto,
    @GetUser() user: User,
  ) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.svc.crear(empresaId, dto.email, dto.rol, user.id);
  }

  @Get('empresa/:empresaId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar invitaciones de la empresa' })
  listar(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.listarPorEmpresa(empresaId);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancelar invitación' })
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelar(id);
  }

  // ── Rutas públicas (sin auth) ────────────────────────────────────────────

  @Get('aceptar/:token')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 consultas/min por IP
  @ApiOperation({ summary: 'Consultar datos de una invitación (sin auth)' })
  getByToken(@Param('token') token: string) {
    return this.svc.getByToken(token);
  }

  @Post('aceptar/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 intentos en 5 min por IP
  @ApiOperation({ summary: 'Aceptar invitación y crear/unir cuenta' })
  aceptar(
    @Param('token') token: string,
    @Body() dto: AceptarInvitacionDto,
  ) {
    return this.svc.aceptar(token, dto.nombre, dto.password);
  }
}
