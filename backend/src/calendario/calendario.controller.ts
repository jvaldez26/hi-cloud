import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CalendarioService } from './calendario.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Calendario de Obligaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('calendario')
export class CalendarioController {
  constructor(private svc: CalendarioService) {}

  @Get()
  @ApiOperation({ summary: 'Eventos del período (DGII, TSS, CxC, CxP, Nómina, Contratos)' })
  getEventos(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const hoy   = new Date();
    const d     = desde ? new Date(desde) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const h     = hasta ? new Date(hasta) : new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0);
    return this.svc.getEventos(d, h);
  }

  @Get('alertas')
  @ApiOperation({ summary: 'Resumen de alertas: vencidos, próximos, pendientes' })
  getAlertas() { return this.svc.getAlertas(); }
}
