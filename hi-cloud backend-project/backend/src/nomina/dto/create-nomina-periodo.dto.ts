import {
  IsString, IsDateString, IsOptional, IsInt, Min, Max, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNominaPeriodoDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Período debe tener formato YYYY-MM' })
  periodo: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsDateString()
  fechaPago: string;

  @IsOptional()
  @IsInt()
  @Min(28)
  @Max(31)
  @Type(() => Number)
  diasPeriodo?: number;
}
