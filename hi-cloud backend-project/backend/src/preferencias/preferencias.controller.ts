import { Controller, Get, Put, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PreferenciasService } from './preferencias.service';
import { SetWidgetsDto } from './dto/set-widgets.dto';

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
}
