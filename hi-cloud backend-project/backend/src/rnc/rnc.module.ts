import { Module } from '@nestjs/common';
import { RncController } from './rnc.controller';
import { RncService } from './rnc.service';
// CacheModule ya está configurado globalmente en AppModule (Redis/in-memory)

@Module({
  controllers: [RncController],
  providers:   [RncService],
  exports:     [RncService],
})
export class RncModule {}
