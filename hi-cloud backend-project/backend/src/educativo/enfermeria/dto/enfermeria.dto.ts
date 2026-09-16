import { IsDefined, IsOptional, IsString, IsInt, IsBoolean, IsDateString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateVisitaEnfermeriaDto {
  @IsDefined({ message: 'El estudiante es requerido' })
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  estudianteId: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha debe ser válida' })
  fecha?: string;

  @IsDefined({ message: 'El motivo de la visita es requerido' })
  @IsString({ message: 'El motivo debe ser texto' })
  motivo: string;

  @IsOptional()
  @IsString({ message: 'Los síntomas deben ser texto' })
  sintomas?: string;

  @IsOptional()
  @IsString({ message: 'La atención brindada debe ser texto' })
  atencionBrindada?: string;

  @IsOptional()
  @IsString({ message: 'El medicamento dado debe ser texto' })
  @MaxLength(200, { message: 'El medicamento no puede superar 200 caracteres' })
  medicamentoDado?: string;

  @IsOptional()
  @IsBoolean({ message: 'Padres notificados debe ser verdadero o falso' })
  padresNotificados?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Enviado a casa debe ser verdadero o falso' })
  enviadoCasa?: boolean;

  @IsOptional()
  @IsString({ message: 'Quién atendió debe ser texto' })
  @MaxLength(200, { message: 'Este campo no puede superar 200 caracteres' })
  atendidoPor?: string;
}

export class UpdateVisitaEnfermeriaDto {
  @IsOptional()
  @IsString({ message: 'El motivo debe ser texto' })
  motivo?: string;

  @IsOptional()
  @IsString({ message: 'Los síntomas deben ser texto' })
  sintomas?: string;

  @IsOptional()
  @IsString({ message: 'La atención brindada debe ser texto' })
  atencionBrindada?: string;

  @IsOptional()
  @IsString({ message: 'El medicamento dado debe ser texto' })
  @MaxLength(200, { message: 'El medicamento no puede superar 200 caracteres' })
  medicamentoDado?: string;

  @IsOptional()
  @IsBoolean({ message: 'Padres notificados debe ser verdadero o falso' })
  padresNotificados?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Enviado a casa debe ser verdadero o falso' })
  enviadoCasa?: boolean;

  @IsOptional()
  @IsString({ message: 'Quién atendió debe ser texto' })
  @MaxLength(200, { message: 'Este campo no puede superar 200 caracteres' })
  atendidoPor?: string;
}

export class FiltrosEnfermeriaDto {
  @IsOptional()
  @IsInt({ message: 'El estudiante debe ser un identificador numérico' })
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  estudianteId?: number;
}
