import { Controller, Get, Put, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PreferenciasService } from './preferencias.service';
import { SetWidgetsDto } from './dto/set-widgets.dto';
import { SetSidebarColapsadoDto } from './dto/set-sidebar-colapsado.dto';
import { SetColumnasDto } from './dto/set-columnas.dto';
import { SetAlertaDispositivoDto } from './dto/set-alerta-dispositivo.dto';

@ApiTags('Preferencias de usuario')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('preferencias')
export class PreferenciasController {
  constructor(private readonly svc: PreferenciasService) {}

  @Get('dashboard-widgets')
  @ApiOperation({
    summary: 'Gráficas activas del dashboard para el usuario y la empresa actuales',
    description:
      'Devuelve { widgets, porDefecto, catalogo }. `porDefecto: true` significa que ' +
      'el usuario nunca ha elegido y se le están dando las de fábrica. `catalogo` ya ' +
      'viene filtrado por el rol que tiene en esta empresa.',
  })
  getDashboardWidgets() {
    return this.svc.getWidgetsDashboard();
  }

  @Put('dashboard-widgets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Guardar las gráficas activas del dashboard',
    description: 'Un array vacío es válido: es "las quité todas", distinto de no haber elegido nunca.',
  })
  setDashboardWidgets(@Body() dto: SetWidgetsDto) {
    return this.svc.setWidgetsDashboard(dto.widgets);
  }

  @Get('sidebar-colapsado')
  @ApiOperation({
    summary: 'Preferencia de sidebar colapsado/expandido para el usuario y la empresa actuales',
    description:
      'Sincroniza entre dispositivos: sin esto, colapsar el menú en un equipo no se ' +
      'reflejaba al entrar desde otro. `porDefecto: true` si nunca lo ha tocado.',
  })
  getSidebarColapsado() {
    return this.svc.getSidebarColapsado();
  }

  @Put('sidebar-colapsado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar la preferencia de sidebar colapsado/expandido' })
  setSidebarColapsado(@Body() dto: SetSidebarColapsadoDto) {
    return this.svc.setSidebarColapsado(dto.colapsado);
  }

  @Get('columnas/:modulo')
  @ApiOperation({
    summary: 'Columnas ocultas/mostradas de una tabla, para el usuario y la empresa actuales',
    description:
      'Sincroniza entre dispositivos el selector de columnas (ColumnToggle) de una tabla. ' +
      '`porDefecto: true` si el usuario nunca lo ha tocado.',
  })
  getColumnas(@Param('modulo') modulo: string) {
    return this.svc.getColumnasOcultas(modulo);
  }

  @Put('columnas/:modulo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar las columnas ocultas/mostradas de una tabla' })
  setColumnas(@Param('modulo') modulo: string, @Body() dto: SetColumnasDto) {
    return this.svc.setColumnasOcultas(modulo, dto.ocultas, dto.mostradas);
  }

  @Get('alerta-dispositivo')
  @ApiOperation({
    summary: 'Preferencia de alerta de nuevo dispositivo/ubicación al iniciar sesión',
    description: '`porDefecto: true` si el usuario nunca la ha tocado — está activa de fábrica.',
  })
  getAlertaDispositivo() {
    return this.svc.getAlertaDispositivo();
  }

  @Put('alerta-dispositivo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar/desactivar la alerta de nuevo dispositivo/ubicación al iniciar sesión' })
  setAlertaDispositivo(@Body() dto: SetAlertaDispositivoDto) {
    return this.svc.setAlertaDispositivo(dto.activo);
  }
}
