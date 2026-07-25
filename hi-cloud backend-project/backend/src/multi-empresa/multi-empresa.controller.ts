import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { MultiEmpresaService } from './multi-empresa.service';
import {
  AsignarUsuarioEmpresaDto,
  CambiarEmpresaDto,
  CreateEmpresaTenantDto,
} from './dto/multi-empresa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole, ROLES_ASIGNABLES_EMPRESA } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CambiarRolDto {
  // S-60: lista blanca — NUNCA @IsEnum(UserRole), que aceptaría 'super_admin'
  // y permitiría escalar a administrador de plataforma desde @Roles(ADMIN).
  @IsIn(ROLES_ASIGNABLES_EMPRESA as UserRole[], {
    message: `Rol inválido. Permitidos: ${ROLES_ASIGNABLES_EMPRESA.join(', ')}`,
  })
  rol!: UserRole;
}

class AsignarSucursalDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  sucursalId?: number | null;
}

@ApiTags('Multi-empresa')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('multi-empresa')
export class MultiEmpresaController {
  constructor(private multiEmpresaService: MultiEmpresaService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resumen: total empresas, asignaciones, usuarios por empresa' })
  getResumen() {
    return this.multiEmpresaService.getResumen();
  }

  // ── Empresas ───────────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todas las empresas del sistema (solo ADMIN global)' })
  getTodasEmpresas() {
    return this.multiEmpresaService.getTodasEmpresas();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Sin restricción de rol: cualquier usuario autenticado puede crear su primera empresa.
  // Un usuario VIEWER sin empresa debe poder solicitarla (queda en PENDIENTE_APROBACION).
  // Si ya tiene empresas y quiere más, el servicio puede restringirlo.
  @ApiOperation({ summary: 'Crear nueva empresa (tenant) — permitido para usuarios sin empresa' })
  createEmpresa(@Body() dto: CreateEmpresaTenantDto, @GetUser() admin: User) {
    return this.multiEmpresaService.createEmpresaConAdmin(dto, admin.id);
  }

  @Get('mis-empresas')
  @ApiOperation({ summary: 'Empresas a las que tiene acceso el usuario autenticado' })
  getMisEmpresas(@GetUser() usuario: User) {
    return this.multiEmpresaService.getEmpresasDeUsuario(usuario.id, usuario.role === UserRole.ADMIN);
  }

  @Get('empresa-principal')
  @ApiOperation({ summary: 'Empresa principal del usuario (contexto al hacer login)' })
  getEmpresaPrincipal(@GetUser() usuario: User) {
    return this.multiEmpresaService.getEmpresaPrincipal(usuario.id);
  }

  @Post('cambiar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar empresa activa — valida acceso y retorna contexto',
    description:
      'Usa el `empresaId` retornado en el header `X-Empresa-ID` de todas las solicitudes posteriores.',
  })
  cambiarEmpresa(@Body() dto: CambiarEmpresaDto, @GetUser() usuario: User) {
    return this.multiEmpresaService.validarAccesoEmpresa(usuario.id, dto.empresaId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Detalle de una empresa' })
  getEmpresa(@Param('id', ParseIntPipe) id: number) {
    return this.multiEmpresaService.getEmpresaById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos de una empresa' })
  updateEmpresa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateEmpresaTenantDto>,
  ) {
    return this.multiEmpresaService.updateEmpresa(id, dto);
  }

  // ── Usuarios por empresa ───────────────────────────────────────────────────

  @Get(':empresaId/usuarios')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios asignados a una empresa' })
  getUsuarios(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.multiEmpresaService.getUsuariosDeEmpresa(empresaId);
  }

  @Post(':empresaId/usuarios')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Asignar usuario a empresa con un rol específico' })
  asignarUsuario(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() dto: AsignarUsuarioEmpresaDto,
    @GetUser() admin: User,
  ) {
    return this.multiEmpresaService.asignarUsuario(empresaId, dto, admin.id);
  }

  @Patch(':empresaId/usuarios/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cambiar rol de un usuario en una empresa' })
  cambiarRol(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Param('userId',    ParseIntPipe) userId:    number,
    @Body() dto: CambiarRolDto,
    @GetUser() solicitante: User,
  ) {
    return this.multiEmpresaService.cambiarRolUsuario(
      empresaId, userId, dto.rol, solicitante.id, solicitante.role,
    );
  }

  @Patch(':empresaId/usuarios/:userId/sucursal')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Asignar sucursal a un usuario en una empresa' })
  asignarSucursal(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Param('userId',    ParseIntPipe) userId:    number,
    @Body() dto: AsignarSucursalDto,
  ) {
    return this.multiEmpresaService.asignarSucursalUsuario(empresaId, userId, dto.sucursalId ?? null);
  }

  @Delete(':empresaId/usuarios/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remover acceso de usuario a una empresa' })
  removerUsuario(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Param('userId',    ParseIntPipe) userId:    number,
  ) {
    return this.multiEmpresaService.removerUsuario(empresaId, userId);
  }
}
