import { IsInt, IsPositive, IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSecuenciaECFDto {
  @ApiPropertyOptional({ description: 'Nuevo número de secuencia inicial (solo si no se ha emitido ningún e-CF)' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  secuenciaInicial?: number;

  @ApiPropertyOptional({ description: 'Nuevo número de secuencia final' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  secuenciaFinal?: number;

  @ApiPropertyOptional({ description: 'Nueva fecha de vencimiento (YYYY-MM-DD)', example: '2027-12-31' })
  @IsDateString()
  @IsOptional()
  fechaVencimiento?: string;
}
