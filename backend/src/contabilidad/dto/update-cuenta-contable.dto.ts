import { PartialType } from '@nestjs/mapped-types';
import { CreateCuentaContableDto } from './create-cuenta-contable.dto';

export class UpdateCuentaContableDto extends PartialType(CreateCuentaContableDto) {}
