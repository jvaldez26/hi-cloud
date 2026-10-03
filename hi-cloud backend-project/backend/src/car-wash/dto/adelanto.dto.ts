import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CrearAdelantoDto {
  @IsInt()
  lavadorId!: number;

  @IsNumber() @Min(0.01)
  monto!: number;

  @IsOptional() @IsIn(['efectivo', 'transferencia'])
  metodoPago?: 'efectivo' | 'transferencia';

  /** Solo para efectivo — si no se manda, se resuelve la caja abierta del usuario. */
  @IsOptional() @IsInt()
  cajaId?: number;

  /** Solo para transferencia. */
  @IsOptional() @IsString()
  referencia?: string;

  @IsOptional() @IsInt()
  cuentaBancariaId?: number;

  @IsOptional() @IsString()
  motivo?: string;

  @IsOptional() @IsDateString()
  fecha?: string;
}
