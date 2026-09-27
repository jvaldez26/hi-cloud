import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResponderTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  respuestaAdmin!: string;
}
