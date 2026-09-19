import {
  IsString, IsNotEmpty, IsEnum, IsInt, IsBoolean,
  IsOptional, IsIn, MaxLength, Min, Max,
} from 'class-validator';
import { TipoCuenta, NaturalezaCuenta, AnexoIR2 } from '../entities/cuenta-contable.entity';
import { TIPOS_BIENES_606 } from '../../declaraciones/dgii.constants';

export class CreateCuentaContableDto {
  @IsString() @IsNotEmpty() @MaxLength(20)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  nombre: string;

  @IsEnum(TipoCuenta)
  tipo: TipoCuenta;

  @IsEnum(NaturalezaCuenta)
  naturaleza: NaturalezaCuenta;

  @IsInt() @Min(1) @Max(5)
  nivel: number;

  @IsBoolean()
  permiteMovimientos: boolean;

  @IsOptional() @IsInt()
  cuentaPadreId?: number;

  @IsOptional() @IsString()
  descripcion?: string;

  // ── Etiquetas fiscales (Fase 1) — solo cuentas de movimiento gasto/costo,
  // validado con el resto del catálogo en ContabilidadService, no aquí. ──

  /** Código del Formato 606 ('01' a '11' — ver TIPOS_BIENES_606). */
  @IsOptional() @IsIn(Object.keys(TIPOS_BIENES_606))
  tipoGasto606?: string;

  @IsOptional() @IsEnum(AnexoIR2)
  anexoIR2?: AnexoIR2;

  @IsOptional() @IsString() @MaxLength(20)
  casillaIR2?: string;

  @IsOptional() @IsBoolean()
  requiereNCF?: boolean;
}
