import { IsNumber, IsPositive, IsDateString, Min } from 'class-validator';

export class CalcularProporcionalidadItbisDto {
  @IsDateString()
  fecha!: string;

  @IsNumber() @Min(0)
  ventasGravadas!: number;

  @IsNumber() @Min(0)
  ventasExportaciones!: number;

  @IsNumber() @Min(0)
  ventasExentas!: number;

  @IsNumber() @IsPositive()
  itbisComun!: number;
}
