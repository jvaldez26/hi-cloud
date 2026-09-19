import { PlanGuard } from '../suscripciones/guards/plan.guard';
import { Controller, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfiguracionContableService } from './services/configuracion-contable.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

/**
 * Configuración Contable por Módulo (2026-09-19) — cada empresa define qué
 * cuenta usa cada concepto (Clientes, Bancos, cobro por tarjeta, etc.) en vez
 * de depender de los códigos hardcodeados del motor. Sin fila configurada,
 * el concepto sigue usando exactamente el mismo código que usa hoy.
 */
@ApiTags('Configuración Contable')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('contabilidad')
@Controller('contabilidad/configuracion')
export class ConfiguracionContableController {
  constructor(private svc: ConfiguracionContableService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Lista el catálogo de conceptos contables con su valor vigente (configurado o default) y advertencias' })
  listar() {
    return this.svc.listar();
  }

  @Patch(':concepto')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Configura qué cuenta usa un concepto contable para esta empresa' })
  actualizar(@Param('concepto') concepto: string, @Body('cuentaCodigo') cuentaCodigo: string) {
    return this.svc.actualizar(concepto, cuentaCodigo);
  }

  @Delete(':concepto')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Restaura un concepto a su valor por defecto' })
  restaurar(@Param('concepto') concepto: string) {
    return this.svc.restaurarDefault(concepto);
  }
}
