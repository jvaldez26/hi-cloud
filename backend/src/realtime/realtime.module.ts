import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Global()   // exportado globalmente — cualquier módulo puede inyectar RealtimeService
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'hicloud-secret',
    }),
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports:   [RealtimeService],
})
export class RealtimeModule {}
