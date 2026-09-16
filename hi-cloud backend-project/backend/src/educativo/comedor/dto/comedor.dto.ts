import { IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsIn, IsNumber, Min } from 'class-validator';

export const TIPOS_PLAN_COMEDOR = ['diario', 'semanal', 'mensual'] as const;

export class CreatePlanComedorDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsDefined({ message: 'El tipo de plan es requerido' })
  @IsIn(TIPOS_PLAN_COMEDOR, { message: 'El tipo debe ser "diario", "semanal" o "mensual"' })
  tipo: string;

  @IsDefined({ message: 'El costo mensual es requerido' })
  @IsNumber({}, { message: 'El costo mensual debe ser un número' })
  @Min(0, { message: 'El costo mensual no puede ser negativo' })
  costoMensual: number;

  @IsOptional()
  @IsString({ message: 'Las restricciones alimenticias deben ser texto' })
  restriccionesAlimenticias?: string;
}

export class UpdatePlanComedorDto {
  @IsOptional()
  @IsIn(TIPOS_PLAN_COMEDOR, { message: 'El tipo debe ser "diario", "semanal" o "mensual"' })
  tipo?: string;

  @IsOptional()
  @IsNumber({}, { message: 'El costo mensual debe ser un número' })
  @Min(0, { message: 'El costo mensual no puede ser negativo' })
  costoMensual?: number;

  @IsOptional()
  @IsString({ message: 'Las restricciones alimenticias deben ser texto' })
  restriccionesAlimenticias?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}
