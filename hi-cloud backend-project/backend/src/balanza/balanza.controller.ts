import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsPositive, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { BalanzaService } from './balanza.service';
import { CreatePatronDto } from './dto/create-patron.dto';
import { CreateFormatoDto } from './dto/create-formato.dto';

class ProbarCodigoDto {
  @IsString()
  @IsNotEmpty()
  codigo!: string;
}

class CalibracionFiltrarDto extends ProbarCodigoDto {
  @IsInt() @IsPositive() @Type(() => Number)   plu!: number;
  @IsNumber()            @Type(() => Number)   valor!: number;
  @IsIn(['peso', 'precio'])                    tipoDato!: 'peso' | 'precio';
}

@ApiTags('Balanzas')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('balanza')
export class BalanzaController {
  constructor(private readonly svc: BalanzaService) {}

  // ── Patrones (ADMIN / CONTADOR) ──────────────────────────────────────────

  @Get('patrones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar patrones de decodificación activos' })
  listarPatrones() { return this.svc.listarPatrones(); }

  @Post('patrones')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear patrón de decodificación de balanza' })
  crearPatron(@Body() dto: CreatePatronDto) { return this.svc.crearPatron(dto); }

  @Patch('patrones/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Actualizar patrón de decodificación' })
  actualizarPatron(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePatronDto>,
  ) { return this.svc.actualizarPatron(id, dto); }

  @Delete('patrones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar (lógicamente) patrón de decodificación' })
  eliminarPatron(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarPatron(id);
  }

  // ── Formatos de exportación (ADMIN / CONTADOR) ────────────────────────────

  @Get('formatos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar formatos de exportación de catálogo' })
  listarFormatos() { return this.svc.listarFormatos(); }

  @Post('formatos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear formato de exportación' })
  crearFormato(@Body() dto: CreateFormatoDto) { return this.svc.crearFormato(dto); }

  @Delete('formatos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar (lógicamente) formato de exportación' })
  eliminarFormato(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarFormato(id);
  }

  // ── Probador y calibración (VENDEDOR incluido) ────────────────────────────

  @Post('probar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({
    summary: 'Probar código de barras: valida EAN y lo interpreta con los patrones activos',
  })
  probarCodigo(@Body() dto: ProbarCodigoDto) {
    return this.svc.probarCodigo(dto.codigo.trim());
  }

  @Post('calibrar/filtrar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary:
      'Asistente de calibración paso 3-4: filtra candidatos con los valores reales confirmados',
  })
  calibrarFiltrar(@Body() dto: CalibracionFiltrarDto) {
    return this.svc.calibrarFiltrar(
      dto.codigo.trim(),
      dto.plu,
      dto.valor,
      dto.tipoDato,
    );
  }
}
