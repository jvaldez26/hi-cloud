import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DescartarXlinkDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MaxLength(300)
  motivo!: string;
}
