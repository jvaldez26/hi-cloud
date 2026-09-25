import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAlertaDispositivoDto {
  @ApiProperty({
    example: true,
    description: 'true para recibir un correo cuando se inicie sesión desde un dispositivo o país nuevo.',
  })
  @IsBoolean()
  activo!: boolean;
}
