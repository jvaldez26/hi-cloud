import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class SetWidgetsDto {
  /**
   * Sin @IsString({each:true}) a proposito: el detalle de que falla —slug
   * inexistente, no permitido para el rol, tipo raro— lo da
   * PreferenciasService.validarWidgets con un mensaje que dice cual y por que.
   * Aqui solo se comprueba la forma exterior.
   */
  @ApiProperty({
    type: [String],
    example: ['ecf-estado-mes', 'ventas-por-vendedor'],
    description: 'Identificadores de las gráficas activas, en el orden en que se muestran. Un array vacío es válido.',
  })
  @IsArray()
  widgets!: unknown[];
}
