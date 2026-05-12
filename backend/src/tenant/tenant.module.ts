import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantGuard } from './tenant.guard';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global:     true,
      middleware: { mount: true, generateId: true },
    }),
    TypeOrmModule.forFeature([UsuarioEmpresa]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [TenantService, TenantMiddleware, TenantGuard],
  exports:   [TenantService, TenantGuard, ClsModule, TypeOrmModule],
})
export class TenantModule {}
