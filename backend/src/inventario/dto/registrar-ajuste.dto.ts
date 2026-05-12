import {
  IsInt,
  IsPositive,
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';

export class RegistrarAjusteDto {
  @IsInt()
  @IsPositive()
  productoId: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidadNueva: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;
}
