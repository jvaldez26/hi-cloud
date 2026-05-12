import {
  IsDateString, IsInt, IsPositive, Min,
} from 'class-validator';

/** DTO para que el Super Admin cargue rangos autorizados por DGII. */
export class CreateSecuenciaAdminDto {
  @IsInt() @IsPositive()
  empresaId!: number;

  /** ID del tipo de ECF (fila en tipos_ecf) */
  @IsInt() @IsPositive()
  tipoECFId!: number;

  @IsInt() @IsPositive()
  secuenciaInicial!: number;

  @IsInt() @Min(1)
  secuenciaFinal!: number;

  @IsDateString()
  fechaVencimiento!: string;
}
