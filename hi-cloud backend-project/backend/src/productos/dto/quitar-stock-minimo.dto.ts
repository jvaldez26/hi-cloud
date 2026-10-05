import { IsArray, ArrayNotEmpty, IsInt, Min } from 'class-validator';

export class QuitarStockMinimoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
