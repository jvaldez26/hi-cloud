import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ProporcionalidadItbisService } from './proporcionalidad-itbis.service';
import { CalcularProporcionalidadItbisDto } from './dto/calcular-proporcionalidad-itbis.dto';

@Controller('herramientas-fiscales/proporcionalidad-itbis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class ProporcionalidadItbisController {
  constructor(private svc: ProporcionalidadItbisService) {}

  @Post('calcular')
  calcular(@Body() dto: CalcularProporcionalidadItbisDto) {
    return this.svc.calcular(dto);
  }
}
