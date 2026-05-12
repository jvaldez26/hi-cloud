import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrupoProducto } from './entities/grupo-producto.entity';
import { SegmentoCliente } from './entities/segmento-cliente.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class GruposService {
  constructor(
    @InjectRepository(GrupoProducto) private gpRepo: Repository<GrupoProducto>,
    @InjectRepository(SegmentoCliente) private scRepo: Repository<SegmentoCliente>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Grupos de Producto ───────────────────────────────────────────────────────

  async listarGrupos() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const grupos = await this.gpRepo.find({
      where: { empresaId, isActive: true },
      relations: ['parent'],
      order: { codigo: 'ASC' },
    });

    // Construir árbol jerárquico
    const roots   = grupos.filter(g => !g.parentId);
    const buildTree = (nodes: GrupoProducto[]): any[] =>
      nodes.map(n => ({
        ...n,
        children: buildTree(grupos.filter(g => g.parentId === n.id)),
      }));

    return buildTree(roots);
  }

  async listarGruposFlat() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.gpRepo.find({
      where: { empresaId, isActive: true, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  async crearGrupo(dto: Partial<GrupoProducto>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const existe    = await this.gpRepo.findOne({ where: { codigo: dto.codigo!, empresaId } });
    if (existe) throw new ConflictException(`Código ${dto.codigo} ya existe`);
    return this.gpRepo.save(this.gpRepo.create({ ...dto, empresaId }));
  }

  async actualizarGrupo(id: number, dto: Partial<GrupoProducto>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.gpRepo.update({ id, empresaId }, dto);
    return this.gpRepo.findOneByOrFail({ id, empresaId });
  }

  async eliminarGrupo(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.gpRepo.update({ id, empresaId }, { activo: false, isActive: false });
  }

  // ─── Segmentos de Cliente ─────────────────────────────────────────────────────

  listarSegmentos() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.scRepo.find({
      where: { empresaId, isActive: true },
      order: { codigo: 'ASC' },
    });
  }

  async crearSegmento(dto: Partial<SegmentoCliente>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.scRepo.save(this.scRepo.create({ ...dto, empresaId }));
  }

  async actualizarSegmento(id: number, dto: Partial<SegmentoCliente>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.scRepo.update({ id, empresaId }, dto);
    return this.scRepo.findOneByOrFail({ id, empresaId });
  }

  async eliminarSegmento(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.scRepo.update({ id, empresaId }, { activo: false, isActive: false });
  }
}
