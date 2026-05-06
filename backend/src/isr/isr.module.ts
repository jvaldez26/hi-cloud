import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsrController } from './isr.controller';
import { IsrService } from './isr.service';
import { Empleado } from '../nomina/entities/empleado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Empleado])],
  controllers: [IsrController],
  providers: [IsrService],
  exports: [IsrService],
})
export class IsrModule {}
