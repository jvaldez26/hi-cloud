import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsNumber,
  MaxLength,
} from 'class-validator';

export class RegistrarSalidaDto {
  @IsInt()
  @IsPositive()
  productoId: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;
}
