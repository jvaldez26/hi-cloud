import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class RegistrarPagoLavadorDto {
  @IsInt()
  lavadorId!: number;

  @IsDateString()
  desde!: string;

  @IsDateString()
  hasta!: string;

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
}
