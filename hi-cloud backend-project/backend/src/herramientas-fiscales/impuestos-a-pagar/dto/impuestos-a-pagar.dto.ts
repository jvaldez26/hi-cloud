import { IsNumber, IsPositive, Min, IsDateString, IsInt, IsIn, IsString, IsNotEmpty } from 'class-validator';

export class CalcularItbisDto {
  @IsDateString() fecha!: string;
  @IsNumber() @Min(0) debitoFiscal!: number;
  @IsNumber() @Min(0) creditoFiscal!: number;
  @IsNumber() @Min(0) retencionesSufridas!: number;
  @IsNumber() @Min(0) saldoAFavorAnterior!: number;
}

export class CalcularIsrPjDto {
  @IsInt() anio!: number;
  @IsNumber() rentaNetaImponible!: number;
  @IsNumber() @Min(0) ingresosTotales!: number;
  @IsNumber() @Min(0) anticipos!: number;
  @IsNumber() @Min(0) retenciones!: number;
  @IsNumber() @Min(0) saldoAFavorAnterior!: number;
}

export class CalcularIsrAsalariadosDto {
  @IsInt() anio!: number;
  @IsIn(['mensual', 'anual']) periodo!: 'mensual' | 'anual';
  @IsNumber() @IsPositive() rentaNetaGravable!: number;
}

export class CalcularIsrPfDto {
  @IsInt() anio!: number;
  @IsNumber() @Min(0) rentaNetaImponibleAnual!: number;
  @IsNumber() @Min(0) retenciones!: number;
  @IsNumber() @Min(0) anticipos!: number;
}

export class CalcularRetencionIR17Dto {
  @IsDateString() fecha!: string;
  @IsString() @IsNotEmpty() concepto!: string;
  @IsNumber() @IsPositive() montoBruto!: number;
}

export class CalcularDividendosDto {
  @IsDateString() fecha!: string;
  @IsNumber() @IsPositive() montoDistribuido!: number;
}
