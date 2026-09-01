import { PartialType } from '@nestjs/mapped-types';
import { CreatePatronDto } from './create-patron.dto';

/**
 * DTO de actualización parcial de un patrón de balanza.
 *
 * IMPORTANTE — no sustituir por `Partial<CreatePatronDto>` en el controlador:
 * `Partial<T>` es puramente de TypeScript y se borra en runtime (el metatipo
 * que ve Nest pasa a ser `Object`), así que el ValidationPipe global lo omite
 * por completo y NINGUNA regla de class-validator se aplica al PATCH.
 * `PartialType()` genera una clase real que conserva los decoradores — incluido
 * el @IsIn(PREFIJOS_BALANZA) del prefijo — haciéndolos opcionales.
 */
export class UpdatePatronDto extends PartialType(CreatePatronDto) {}
