import { Module, Global } from '@nestjs/common';
import { SchemaValidatorService } from './schema-validator.service';

@Global()
@Module({
  providers: [SchemaValidatorService],
  exports:   [SchemaValidatorService],
})
export class DatabaseModule {}
