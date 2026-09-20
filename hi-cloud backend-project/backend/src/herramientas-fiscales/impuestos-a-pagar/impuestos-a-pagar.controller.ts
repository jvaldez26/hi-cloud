import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ImpuestosAPagarService } from './impuestos-a-pagar.service';
import {
  CalcularItbisDto, CalcularIsrPjDto, CalcularIsrAsalariadosDto,
  CalcularIsrPfDto, CalcularRetencionIR17Dto, CalcularDividendosDto,
} from './dto/impuestos-a-pagar.dto';

@Controller('herramientas-fiscales/impuestos-a-pagar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
export class ImpuestosAPagarController {
  constructor(private svc: ImpuestosAPagarService) {}

  @Post('itbis')
  itbis(@Body() dto: CalcularItbisDto) {
    return this.svc.itbis(dto);
  }

  @Post('isr-pj')
  isrPj(@Body() dto: CalcularIsrPjDto) {
    return this.svc.isrPj(dto);
  }

  @Post('isr-asalariados')
  isrAsalariados(@Body() dto: CalcularIsrAsalariadosDto) {
    return this.svc.isrAsalariados(dto);
  }

  @Post('isr-pf')
  isrPf(@Body() dto: CalcularIsrPfDto) {
    return this.svc.isrPf(dto);
  }

  @Post('retencion-ir17')
  retencionIR17(@Body() dto: CalcularRetencionIR17Dto) {
    return this.svc.retencionIR17(dto);
  }

  @Post('dividendos')
  dividendos(@Body() dto: CalcularDividendosDto) {
    return this.svc.dividendos(dto);
  }
}
