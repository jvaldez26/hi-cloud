import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RncService } from './rnc.service';

@ApiTags('RNC / Cédula DGII')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('rnc')
export class RncController {
  constructor(private readonly rncService: RncService) {}

  @Get('consultar')
  @ApiOperation({ summary: 'Consultar RNC o Cédula en DGII (megaplus)' })
  @ApiQuery({ name: 'rnc', description: '9 dígitos (RNC) u 11 (Cédula)' })
  consultar(@Query('rnc') rnc: string) {
    return this.rncService.consultarRNC(rnc);
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Buscar contribuyentes por nombre en DGII' })
  @ApiQuery({ name: 'nombre', description: 'Nombre parcial o razón social' })
  buscar(@Query('nombre') nombre: string) {
    return this.rncService.buscarPorNombre(nombre);
  }
}
