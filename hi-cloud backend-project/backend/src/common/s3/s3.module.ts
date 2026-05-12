import { Module, Global } from '@nestjs/common';
import { S3Service } from './s3.service';

/** Global para que cualquier módulo pueda inyectar S3Service sin importarlo */
@Global()
@Module({
  providers: [S3Service],
  exports:   [S3Service],
})
export class S3Module {}
