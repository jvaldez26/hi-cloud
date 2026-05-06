import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TSSService } from './tss.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('TSS — Seguridad Social')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('tss')
export class TSSController {
  constructor(private svc: TSSService) {}

  @Get('mensual')
  @ApiOperation({ summary: 'Reporte TSS mensual por empleado (Ley 87-01)' })
  getMensual(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getReporteMensual(Number(mes), Number(anio));
  }

  @Get('anual')
  @ApiOperation({ summary: 'Resumen anual de aportes TSS' })
  getAnual(@Query('anio') anio: string) {
    return this.svc.getResumenAnual(Number(anio));
  }
}
