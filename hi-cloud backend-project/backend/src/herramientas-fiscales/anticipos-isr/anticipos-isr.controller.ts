import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { AnticiposISRService } from './anticipos-isr.service';
import { CalcularAnticiposISRDto } from './dto/calcular-anticipos-isr.dto';

@Controller('herramientas-fiscales/anticipos-isr')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class AnticiposISRController {
  constructor(private svc: AnticiposISRService) {}

  @Post('calcular')
  calcular(@Body() dto: CalcularAnticiposISRDto) {
    return this.svc.calcular(dto);
  }
}
