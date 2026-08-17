import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VideoTutorial } from './videos-tutoriales.entity';
import { VideosTutorialesService } from './videos-tutoriales.service';
import { VideosTutorialesController } from './videos-tutoriales.controller';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoTutorial]),
    ConfigModule,
    // SuperAdminModule exporta SuperAdminGuard y JwtModule — necesarios para el controller
    SuperAdminModule,
  ],
  controllers: [VideosTutorialesController],
  providers:   [VideosTutorialesService],
})
export class VideosTutorialesModule {}
