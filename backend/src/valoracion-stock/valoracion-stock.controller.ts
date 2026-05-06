import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ValoracionStockService } from './valoracion-stock.service';

@ApiTags('Valoración de Stock (AVCO)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
@Controller('valoracion-stock')
export class ValoracionStockController {
  constructor(private readonly svc: ValoracionStockService) {}

  @Get()
  @ApiOperation({ summary: 'Valoración completa del inventario usando método AVCO' })
  getValoracion(@Query('categoria') categoria?: string) {
    return this.svc.getValoracion(categoria);
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Categorías de productos disponibles para filtrar' })
  getCategorias() {
    return this.svc.getCategorias();
  }

  @Get('historial/:productoId')
  @ApiOperation({ summary: 'Historial de movimientos de costo de un producto' })
  historial(@Param('productoId', ParseIntPipe) id: number) {
    return this.svc.historialCostos(id);
  }
}
