import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FiltroMesAnioDto {
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  mes: number;

  @IsInt()
  @Min(2020)
  @Max(2035)
  @Type(() => Number)
  anio: number;
}
