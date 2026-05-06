import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FlujoCajaService } from './flujo-caja.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Flujo de Caja')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('flujo-caja')
export class FlujoCajaController {
  constructor(private svc: FlujoCajaService) {}

  @Get('proyeccion')
  @ApiOperation({ summary: 'Proyección de flujo de caja para los próximos N meses' })
  getProyeccion(
    @Query('meses') meses?: string,
    @Query('saldoInicial') saldoInicial?: string,
  ) {
    return this.svc.getProyeccion(
      meses        ? Number(meses)        : 6,
      saldoInicial ? Number(saldoInicial) : 0,
    );
  }

  @Get('real')
  @ApiOperation({ summary: 'Flujo de caja real del mes (cobros vs pagos)' })
  getFlujoReal(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getFlujoReal(Number(mes), Number(anio));
  }
}
