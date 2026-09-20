import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { AjusteInflacionService } from './ajuste-inflacion.service';
import { CalcularAjusteInflacionDto } from './dto/calcular-ajuste-inflacion.dto';

@Controller('herramientas-fiscales/ajuste-inflacion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class AjusteInflacionController {
  constructor(private svc: AjusteInflacionService) {}

  @Post('calcular')
  calcular(@Body() dto: CalcularAjusteInflacionDto) {
    return this.svc.calcular(dto);
  }
}
