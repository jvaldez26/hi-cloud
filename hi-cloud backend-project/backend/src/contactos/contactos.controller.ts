import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ContactosService } from './contactos.service';

@ApiTags('Contactos Unificados')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('contactos')
export class ContactosController {
  constructor(private readonly svc: ContactosService) {}

  @Get('resumen')
  resumen() { return this.svc.resumen(); }

  @Get()
  @ApiOperation({ summary: 'Lista unificada de clientes, proveedores y empleados' })
  listar(@Query('tipo') tipo?: string, @Query('q') q?: string) {
    return this.svc.listar(tipo, q);
  }
}
