import { IsDefined, IsInt } from 'class-validator';

export class CalcularNotasPeriodoDto {
  @IsDefined({ message: 'La sección es requerida' })
  @IsInt({ message: 'La sección debe ser un identificador numérico' })
  seccionId: number;

  @IsDefined({ message: 'El período es requerido' })
  @IsInt({ message: 'El período debe ser un identificador numérico' })
  periodoId: number;
}
