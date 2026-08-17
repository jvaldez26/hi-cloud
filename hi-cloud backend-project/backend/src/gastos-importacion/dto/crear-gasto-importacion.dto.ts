import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { TipoGastoImportacion } from '../entities/gasto-importacion.entity';

export class CrearGastoImportacionDto {
  @IsInt()
  compraId: number;

  @IsString()
  @Length(1, 200)
  concepto: string;

  @IsEnum(TipoGastoImportacion)
  tipo: TipoGastoImportacion;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  moneda?: string;

  /** Tasa de cambio al DOP. Default 1 si moneda = DOP */
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  tipoCambio?: number;
}
