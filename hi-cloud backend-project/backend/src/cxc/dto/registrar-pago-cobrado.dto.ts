import {
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { MetodoPago } from '../../common/enums/metodo-pago.enum';

export class RegistrarPagoCobradoDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;

  @IsOptional()
  @IsString() @MaxLength(2000)
  notas?: string;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  tipoCambio?: number;

  /** Selector de cuenta contable — la contrapartida del cobro. Sin default: el motor usa Bancos. Solo aplica a cobros en DOP (ver asientoCobroME). */
  @IsOptional()
  @IsString()
  cuentaContrapartida?: string;
}
