import { IsDateString } from 'class-validator';

export class FiltroFechaDto {
  @IsDateString()
  fechaDesde: string;

  @IsDateString()
  fechaHasta: string;
}
