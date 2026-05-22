import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { LibroVentasService } from './libro-ventas.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

const HOY    = () => fechaHoyRD();
const INICIO = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

@ApiTags('Libro de Ventas & Compras')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
@Controller('libro-ventas')
export class LibroVentasController {
  constructor(private readonly svc: LibroVentasService) {}

  @Get('ventas')
  @ApiOperation({ summary: 'Libro de Ventas — registro de ingresos con NCF para DGII' })
  libroVentas(
    @Query('desde')   desde?: string,
    @Query('hasta')   hasta?: string,
    @Query('tipoNcf') tipoNcf?: string,
  ) {
    return this.svc.getLibroVentas({
      desde:   desde  ?? INICIO(),
      hasta:   hasta  ?? HOY(),
      tipoNcf,
    });
  }

  @Get('compras')
  @ApiOperation({ summary: 'Libro de Compras — registro de egresos con proveedores' })
  libroCompras(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.getLibroCompras({
      desde: desde ?? INICIO(),
      hasta: hasta ?? HOY(),
    });
  }
}
