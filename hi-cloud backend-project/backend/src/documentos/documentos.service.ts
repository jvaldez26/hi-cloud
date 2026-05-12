import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Documento, TipoEntidadDoc } from './entities/documento.entity';
import { TenantService } from '../tenant/tenant.service';

interface SubirDocumentoDto {
  tipoEntidad:      TipoEntidadDoc;
  entidadId?:       number;
  nombre:           string;
  tipoMime?:        string;
  extension?:       string;
  tamanioKb?:       number;
  url:              string;
  descripcion?:     string;
  subidoPorId:      number;
  nombreSubidoPor?: string;
}

@Injectable()
export class DocumentosService {
  constructor(
    @InjectRepository(Documento)
    private docRepo: Repository<Documento>,
    private tenantService: TenantService,
  ) {}

  listarPorEntidad(tipoEntidad: TipoEntidadDoc, entidadId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.docRepo.find({
      where: { empresaId, tipoEntidad, entidadId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  listarGeneral(tipoEntidad?: TipoEntidadDoc) {
    const empresaId = this.tenantService.getEmpresaId();
    const where: any = { empresaId, isActive: true };
    if (tipoEntidad) where.tipoEntidad = tipoEntidad;
    return this.docRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async subir(dto: SubirDocumentoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const doc = this.docRepo.create({ ...dto, empresaId });
    return this.docRepo.save(doc);
  }

  async eliminar(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const doc = await this.docRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    await this.docRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async contarPorEntidad(tipoEntidad: TipoEntidadDoc, entidadId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.docRepo.count({ where: { empresaId, tipoEntidad, entidadId, isActive: true } });
  }

  async resumen() {
    const empresaId = this.tenantService.getEmpresaId();

    const raw = await this.docRepo
      .createQueryBuilder('d')
      .select('d.tipoEntidad', 'tipo')
      .addSelect('COUNT(d.id)', 'cantidad')
      .addSelect('COALESCE(SUM(d.tamanioKb), 0)', 'totalKb')
      .where('d.empresaId = :empresaId', { empresaId })
      .andWhere('d.isActive = :a', { a: true })
      .groupBy('d.tipoEntidad')
      .getRawMany<{ tipo: string; cantidad: string; totalKb: string }>();

    const total = await this.docRepo.count({ where: { empresaId, isActive: true } });

    return {
      total,
      porTipo: raw.map(r => ({
        tipo:     r.tipo,
        cantidad: Number(r.cantidad),
        totalKb:  Number(r.totalKb),
      })),
    };
  }
}
