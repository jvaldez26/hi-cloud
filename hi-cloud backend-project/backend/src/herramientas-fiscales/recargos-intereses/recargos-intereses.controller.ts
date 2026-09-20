import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { RecargosInteresesService } from './recargos-intereses.service';
import { CalcularRecargosInteresesDto } from './dto/calcular-recargos-intereses.dto';

@Controller('herramientas-fiscales/recargos-intereses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class RecargosInteresesController {
  constructor(private svc: RecargosInteresesService) {}

  @Post('calcular')
  calcular(@Body() dto: CalcularRecargosInteresesDto) {
    return this.svc.calcular(dto);
  }
}
