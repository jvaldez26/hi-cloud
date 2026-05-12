import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { BusquedaService } from './busqueda.service';

@ApiTags('Búsqueda Global')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('busqueda')
export class BusquedaController {
  constructor(private readonly svc: BusquedaService) {}

  @Get()
  @ApiOperation({ summary: 'Búsqueda global en facturas, clientes, productos, proveedores y más' })
  buscar(@Query('q') q: string) {
    return this.svc.buscar(q ?? '');
  }
}
