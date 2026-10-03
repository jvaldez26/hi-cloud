import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';

export class AsignacionLavadorDto {
  @IsInt()
  lavadorId!: number;

  @IsNumber() @Min(0.01)
  porcentaje!: number;
}

export class AsignarLavadoresDto {
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AsignacionLavadorDto)
  lavadores!: AsignacionLavadorDto[];
}
