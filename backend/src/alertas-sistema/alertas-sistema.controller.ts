import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AlertasSistemaService } from './alertas-sistema.service';

@ApiTags('Alertas del Sistema')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('alertas-sistema')
export class AlertasSistemaController {
  constructor(private readonly svc: AlertasSistemaService) {}

  @Get()
  @ApiOperation({ summary: 'Todas las alertas inteligentes del sistema en tiempo real' })
  getAlertas() { return this.svc.getAlertas(); }
}
