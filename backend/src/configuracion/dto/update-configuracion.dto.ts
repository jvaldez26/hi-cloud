import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateConfiguracionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  valor: string;
}
