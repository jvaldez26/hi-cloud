import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XlinkDocumento } from './entities/xlink-documento.entity';
import { XlinkMapeo } from './entities/xlink-mapeo.entity';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';

@Module({
  imports: [TypeOrmModule.forFeature([XlinkDocumento, XlinkMapeo])],
  providers: [XlinkDocumentosRepository],
  exports: [XlinkDocumentosRepository],
})
export class XlinkModule {}
