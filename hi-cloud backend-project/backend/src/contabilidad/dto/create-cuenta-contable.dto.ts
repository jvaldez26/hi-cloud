import {
  IsString, IsNotEmpty, IsEnum, IsInt, IsBoolean,
  IsOptional, IsIn, MaxLength, Min, Max, ValidateNested, IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoCuenta, NaturalezaCuenta, AnexoIR2, ClasificacionResultado } from '../entities/cuenta-contable.entity';
import { TIPOS_BIENES_606 } from '../../declaraciones/dgii.constants';

/**
 * FASE 4 Bloque A — un elemento de la lista de anexos IR-2 de una cuenta.
 * anexoIR2/casillaIR2 dejaron de ser un par de campos sueltos en la cuenta
 * porque una cuenta puede aportar a más de un anexo a la vez (ver
 * cuenta-anexo-ir2.entity.ts) — ahora son una lista de estos pares.
 */
export class EtiquetaAnexoIR2Dto {
  @IsEnum(AnexoIR2)
  anexoIR2: AnexoIR2;

  @IsOptional() @IsString() @MaxLength(30)
  casillaIR2?: string;
}

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

  /**
   * Estado de Resultados — operacional/no operacional, con herencia (null =
   * hereda de la cuenta padre). Solo tiene sentido en ingreso/costo/gasto —
   * en activo/pasivo/patrimonio se ignora, no se valida aquí (el DTO no
   * conoce el tipo de OTRA cuenta para cruzarlo).
   */
  @IsOptional() @IsEnum(ClasificacionResultado)
  clasificacionResultado?: ClasificacionResultado;

  // ── Etiquetas fiscales (Fase 1) — solo cuentas de movimiento gasto/costo,
  // validado con el resto del catálogo en ContabilidadService, no aquí. ──

  /** Código del Formato 606 ('01' a '11' — ver TIPOS_BIENES_606). */
  @IsOptional() @IsIn(Object.keys(TIPOS_BIENES_606))
  tipoGasto606?: string;

  /**
   * Lista completa de anexos IR-2 de esta cuenta (Fase 4 Bloque A) — cada
   * PATCH/POST la reemplaza entera, no la fusiona: mandar [] borra todos
   * los anexos existentes de la cuenta, y omitir el campo entero (undefined)
   * deja los que ya tenía sin tocar. Validado contra TIPOS_POR_ANEXO_IR2 y
   * sin anexos repetidos en ContabilidadService, no aquí.
   */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EtiquetaAnexoIR2Dto)
  etiquetasAnexoIR2?: EtiquetaAnexoIR2Dto[];

  @IsOptional() @IsBoolean()
  requiereNCF?: boolean;
}
