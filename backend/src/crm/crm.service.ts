import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, EstadoLead, FuenteLead } from './entities/lead.entity';
import { Oportunidad, EtapaOportunidad } from './entities/oportunidad.entity';
import { ActividadCRM, TipoActividad } from './entities/actividad-crm.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateLeadDto {
  nombre: string; empresa?: string; cargo?: string;
  email?: string; telefono?: string;
  fuente?: FuenteLead; valorEstimado?: number;
  notas?: string; responsableId?: number;
}

interface UpdateLeadDto extends Partial<CreateLeadDto> {
  estado?: EstadoLead;
}

interface CreateOportunidadDto {
  titulo: string; empresa?: string; clienteId?: number; leadId?: number;
  etapa?: EtapaOportunidad; valor?: number; probabilidad?: number;
  fechaCierreEsperada?: string; descripcion?: string;
  motivoPerdida?: string; responsableId?: number;
}

interface CreateActividadDto {
  tipo: TipoActividad; descripcion: string; fecha: string;
  leadId?: number; oportunidadId?: number; usuarioId?: number;
}

@Injectable()
export class CRMService {
  constructor(
    @InjectRepository(Lead)           private leadRepo: Repository<Lead>,
    @InjectRepository(Oportunidad)    private oportRepo: Repository<Oportunidad>,
    @InjectRepository(ActividadCRM)   private actRepo:   Repository<ActividadCRM>,
    private tenantService: TenantService,
  ) {}

  // ── Leads ────────────────────────────────────────────────────────────────────

  async crearLead(dto: CreateLeadDto): Promise<Lead> {
    return this.leadRepo.save(this.leadRepo.create(dto));
  }

  async listarLeads(pagination: PaginationDto, estado?: EstadoLead, fuente?: FuenteLead) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.leadRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.responsable', 'r')
      .where('l.isActive = :a', { a: true });

    if (estado)  qb.andWhere('l.estado = :e', { e: estado });
    if (fuente)  qb.andWhere('l.fuente = :f', { f: fuente });
    if (search)  qb.andWhere('(l.nombre ILIKE :s OR l.empresa ILIKE :s OR l.email ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async findLead(id: number): Promise<Lead> {
    const l = await this.leadRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!l) throw new NotFoundException(`Lead #${id} no encontrado`);
    return l;
  }

  async actualizarLead(id: number, dto: UpdateLeadDto): Promise<Lead> {
    await this.findLead(id);
    await this.leadRepo.update(id, dto as any);
    return this.findLead(id);
  }

  async eliminarLead(id: number) {
    await this.findLead(id);
    await this.leadRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async convertirLead(id: number, clienteId: number): Promise<Lead> {
    await this.findLead(id);
    await this.leadRepo.update(id, {
      estado: EstadoLead.CONVERTIDO,
      clienteConvertidoId: clienteId,
    });
    return this.findLead(id);
  }

  // ── Oportunidades ────────────────────────────────────────────────────────────

  async crearOportunidad(dto: CreateOportunidadDto): Promise<Oportunidad> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.oportRepo.save(this.oportRepo.create({
      empresaId,
      ...dto,
      fechaCierreEsperada: dto.fechaCierreEsperada ? new Date(dto.fechaCierreEsperada) : undefined,
    }));
  }

  async listarOportunidades(pagination: PaginationDto, etapa?: EtapaOportunidad) {
    const { limit = 50, page = 1, search } = pagination;
    const qb = this.oportRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.responsable', 'r')
      .where('o.empresaId = :eid', { eid: this.tenantService.getEmpresaId() })
      .andWhere('o.isActive = :a', { a: true });

    if (etapa)  qb.andWhere('o.etapa = :e', { e: etapa });
    if (search) qb.andWhere('(o.titulo ILIKE :s OR o.empresa ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('o.valor', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async actualizarEtapa(id: number, etapa: EtapaOportunidad, motivo?: string): Promise<Oportunidad> {
    const o = await this.oportRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException(`Oportunidad #${id} no encontrada`);
    await this.oportRepo.update(id, { etapa, motivoPerdida: motivo });
    return this.oportRepo.findOne({ where: { id } }) as Promise<Oportunidad>;
  }

  async actualizarOportunidad(id: number, dto: Partial<CreateOportunidadDto>): Promise<Oportunidad> {
    const o = await this.oportRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException(`Oportunidad #${id} no encontrada`);
    await this.oportRepo.update(id, {
      ...dto,
      fechaCierreEsperada: dto.fechaCierreEsperada ? new Date(dto.fechaCierreEsperada) : undefined,
    } as any);
    return this.oportRepo.findOne({ where: { id }, relations: ['responsable'] }) as Promise<Oportunidad>;
  }

  async eliminarOportunidad(id: number) {
    const o = await this.oportRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException(`Oportunidad #${id} no encontrada`);
    await this.oportRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Actividades ──────────────────────────────────────────────────────────────

  async crearActividad(dto: CreateActividadDto): Promise<ActividadCRM> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.actRepo.save(this.actRepo.create({
      empresaId,
      ...dto,
      fecha: new Date(dto.fecha),
    }));
  }

  async listarActividades(leadId?: number, oportunidadId?: number) {
    const qb = this.actRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.usuario', 'u')
      .where('a.empresaId = :eid', { eid: this.tenantService.getEmpresaId() })
      .andWhere('a.isActive = :ac', { ac: true });

    if (leadId)        qb.andWhere('a.leadId = :l', { l: leadId });
    if (oportunidadId) qb.andWhere('a.oportunidadId = :o', { o: oportunidadId });

    return qb.orderBy('a.fecha', 'DESC').getMany();
  }

  async completarActividad(id: number): Promise<ActividadCRM> {
    const a = await this.actRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Actividad #${id} no encontrada`);
    await this.actRepo.update(id, { completada: true });
    return this.actRepo.findOne({ where: { id } }) as Promise<ActividadCRM>;
  }

  // ── Dashboard / KPIs ─────────────────────────────────────────────────────────

  async getDashboard() {
    const [totalLeads, leadsNuevos, leadsCali, leadsConvert] = await Promise.all([
      this.leadRepo.count({ where: { isActive: true } }),
      this.leadRepo.count({ where: { isActive: true, estado: EstadoLead.NUEVO } }),
      this.leadRepo.count({ where: { isActive: true, estado: EstadoLead.CALIFICADO } }),
      this.leadRepo.count({ where: { isActive: true, estado: EstadoLead.CONVERTIDO } }),
    ]);

    const porFuente = await this.leadRepo
      .createQueryBuilder('l')
      .select(['l.fuente AS fuente', 'COUNT(*) AS cantidad'])
      .where('l.isActive = :a', { a: true })
      .groupBy('l.fuente')
      .getRawMany();

    const pipeline = await this.oportRepo
      .createQueryBuilder('o')
      .select(['o.etapa AS etapa', 'COUNT(*) AS cantidad', 'COALESCE(SUM(o.valor),0) AS total'])
      .where('o.isActive = :a', { a: true })
      .andWhere('o.etapa NOT IN (:...closed)', { closed: [EtapaOportunidad.GANADO, EtapaOportunidad.PERDIDO] })
      .groupBy('o.etapa')
      .getRawMany();

    const valorPipeline = pipeline.reduce((s: number, r: any) => s + Number(r.total), 0);

    const ganadasMes = await this.oportRepo
      .createQueryBuilder('o')
      .where('o.etapa = :e', { e: EtapaOportunidad.GANADO })
      .andWhere('o.updatedAt >= :d', { d: new Date(new Date().getFullYear(), new Date().getMonth(), 1) })
      .getCount();

    return {
      totalLeads, leadsNuevos, leadsCali, leadsConvert,
      tasaConversion: totalLeads > 0 ? Math.round((leadsConvert / totalLeads) * 100) : 0,
      porFuente,
      pipeline,
      valorPipeline,
      ganadasMes,
    };
  }
}
