import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Global()   // exportado globalmente — cualquier módulo puede inyectar RealtimeService
@Module({
  imports: [
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET no configurado — define esta variable de entorno');
        return { secret, verifyOptions: { algorithms: ['HS256'] } };
      },
    }),
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports:   [RealtimeService],
})
export class RealtimeModule {}
