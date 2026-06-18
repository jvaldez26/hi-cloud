import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantGuard } from './tenant.guard';
import { TenantSubscriber } from './tenant.subscriber';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global:     true,
      middleware: { mount: true, generateId: true },
    }),
    TypeOrmModule.forFeature([UsuarioEmpresa, Empresa]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET requerido (tenant.module)');
        return { secret };
      },
    }),
  ],
  providers: [TenantService, TenantMiddleware, TenantGuard, TenantSubscriber],
  exports:   [TenantService, TenantGuard, TenantSubscriber, ClsModule, TypeOrmModule],
})
export class TenantModule {}
