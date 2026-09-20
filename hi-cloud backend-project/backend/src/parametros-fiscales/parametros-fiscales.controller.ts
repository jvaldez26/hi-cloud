import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { ParametrosFiscalesService } from './parametros-fiscales.service';
import { CrearParametroFiscalDto } from './dto/crear-parametro-fiscal.dto';

/**
 * CRUD de parámetros fiscales — solo Super Admin. Una tasa o un tramo de la
 * DGII no es una configuración de empresa: cambiarla afecta a todos los
 * tenants por igual, así que no hay `@Roles(ADMIN, CONTADOR)` de tenant
 * aquí, solo SuperAdminGuard. Las calculadoras (Herramientas Fiscales,
 * dentro de cada empresa) SOLO leen — ver ParametrosFiscalesService.resolver().
 */
@Controller('admin/parametros-fiscales')
@UseGuards(SuperAdminGuard)
export class ParametrosFiscalesController {
  constructor(private svc: ParametrosFiscalesService) {}

  @Get()
  listar(@Query('clave') clave?: string) {
    return this.svc.listar(clave);
  }

  @Get('pendientes')
  pendientes() {
    return this.svc.listarPendientes();
  }

  @Post()
  crearVersion(@Body() dto: CrearParametroFiscalDto, @GetUser() admin: User) {
    return this.svc.crearVersion(dto, admin.id, admin.nombre);
  }

  @Patch(':id/validar')
  validar(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.validar(id, admin.id, admin.nombre);
  }
}
