import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetSidebarColapsadoDto {
  @ApiProperty({
    example: true,
    description: 'true si el sidebar debe mostrarse colapsado (solo íconos) para este usuario en esta empresa.',
  })
  @IsBoolean()
  colapsado!: boolean;
}
