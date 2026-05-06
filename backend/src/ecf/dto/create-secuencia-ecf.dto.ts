import {
  IsInt,
  IsPositive,
  IsDateString,
  IsNotEmpty,
  Min,
} from 'class-validator';

export class CreateSecuenciaECFDto {
  @IsInt()
  @IsPositive()
  tipoECFId: number;

  @IsInt()
  @IsPositive()
  secuenciaInicial: number;

  @IsInt()
  @IsPositive()
  @Min(1)
  secuenciaFinal: number;

  @IsDateString()
  fechaVencimiento: string;
}
