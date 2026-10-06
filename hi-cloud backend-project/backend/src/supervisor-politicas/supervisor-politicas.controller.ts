import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';
import { SupervisorPoliticaService } from './supervisor-politica.service';
import type { ModoSupervisor } from './entities/supervisor-politica.entity';

class ItemPoliticaDto {
  @IsString()
  clave!: string;

  @IsBoolean()
  requerido!: boolean;

  @IsIn(['sesion', 'cada_vez'])
  modo!: ModoSupervisor;
}

class GuardarPoliticasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPoliticaDto)
  items!: ItemPoliticaDto[];
}

@ApiTags('Modo Supervisor')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracion/supervisor-politicas')
export class SupervisorPoliticasController {
  constructor(
    private readonly svc: SupervisorPoliticaService,
    private readonly tenantService: TenantService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Catálogo completo de pestañas/acciones protegibles, con el valor actual de la empresa' })
  listar() {
    return this.svc.listarPoliticas(this.tenantService.getEmpresaId());
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Guarda requerido/modo para una o varias claves — solo ADMIN, queda auditado' })
  guardar(@Body() dto: GuardarPoliticasDto, @GetUser() user: User) {
    return this.svc
      .guardarPoliticas(this.tenantService.getEmpresaId(), dto.items, { id: user.id, nombre: (user as any).nombre ?? '' })
      .then(() => ({ ok: true }));
  }
}
