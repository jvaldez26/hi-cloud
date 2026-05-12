import { PartialType } from '@nestjs/mapped-types';
import { CreateProveedorECFDto } from './create-proveedor-ecf.dto';

export class UpdateProveedorECFDto extends PartialType(CreateProveedorECFDto) {}
