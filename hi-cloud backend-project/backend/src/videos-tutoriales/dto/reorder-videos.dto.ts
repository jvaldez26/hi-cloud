import { IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ReorderItemDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsInt()
  @Min(0)
  orden: number;
}

export class ReorderVideosDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}
