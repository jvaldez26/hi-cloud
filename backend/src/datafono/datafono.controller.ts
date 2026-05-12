import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsInt, IsPositive, Min, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { DatafonoService } from './datafono.service';

class CreateTerminalDto {
  @IsString()                    numeroTerminal!: string;
  @IsString()                    banco!:          string;
  @IsOptional() @IsString()      tipoTarjeta?:    string;
  @IsOptional() @IsString()      sucursal?:       string;
  @IsOptional() @IsNumber()      comisionPct?:    number;
}

class CreateTransaccionDto {
  @IsInt() @IsPositive()         terminalId!:       number;
  @IsString()                    fecha!:            string;
  @IsString()                    referencia!:       string;
  @IsOptional() @IsString()      tipo?:             string;
  @IsNumber() @Min(0)            monto!:            number;
  @IsOptional() @IsString()      tarjetaUltimos4?:  string;
  @IsOptional() @IsString()      notas?:            string;
}

class CreateConciliacionDto {
  @IsInt() @IsPositive()   terminalId!:  number;
  @IsString()              fechaDesde!:  string;
  @IsString()              fechaHasta!:  string;
  @IsOptional() @IsString() notas?:      string;
}

@ApiTags('datafono')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('datafono')
export class DatafonoController {
  constructor(private readonly svc: DatafonoService) {}

  @Get('resumen')
  resumen() { return this.svc.resumen(); }

  // ─── Terminales ─────────────────────────────────────────────────────────────

  @Get('terminales')
  listarTerminales() { return this.svc.listarTerminales(); }

  @Post('terminales')
  crearTerminal(@Body() dto: CreateTerminalDto) {
    return this.svc.crearTerminal(dto);
  }

  @Patch('terminales/:id')
  actualizarTerminal(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateTerminalDto>) {
    return this.svc.actualizarTerminal(id, dto);
  }

  @Delete('terminales/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminarTerminal(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarTerminal(id);
  }

  // ─── Transacciones ───────────────────────────────────────────────────────────

  @Get('transacciones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  listarTransacciones(
    @Query('terminalId') terminalId?: string,
    @Query('desde')      desde?: string,
    @Query('hasta')      hasta?: string,
  ) {
    return this.svc.listarTransacciones(
      terminalId ? Number(terminalId) : undefined,
      desde,
      hasta,
    );
  }

  @Post('transacciones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  crearTransaccion(@Body() dto: CreateTransaccionDto) {
    return this.svc.crearTransaccion(dto);
  }

  // ─── Conciliaciones ──────────────────────────────────────────────────────────

  @Get('conciliaciones')
  listarConciliaciones() { return this.svc.listarConciliaciones(); }

  @Post('conciliaciones')
  crearConciliacion(@Body() dto: CreateConciliacionDto) {
    return this.svc.crearConciliacion(dto);
  }

  @Patch('conciliaciones/:id/confirmar')
  confirmarConciliacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.confirmarConciliacion(id);
  }
}
