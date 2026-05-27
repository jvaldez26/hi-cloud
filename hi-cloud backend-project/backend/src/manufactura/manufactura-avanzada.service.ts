import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CentroTrabajo, TipoCentroTrabajo } from './entities/centro-trabajo.entity';
import { RutaProduccion } from './entities/ruta-produccion.entity';
import { EtapaRuta } from './entities/etapa-ruta.entity';
import { RegistroEtapaOrden, EstadoEtapaOrden } from './entities/registro-etapa-orden.entity';
import { OrdenProduccion, EstadoOrdenProduccion } from './entities/orden-produccion.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ManufacturaAvanzadaService {
  constructor(
    @InjectRepository(CentroTrabajo)
    private centroRepo: Repository<CentroTrabajo>,
    @InjectRepository(RutaProduccion)
    private rutaRepo: Repository<RutaProduccion>,
    @InjectRepository(EtapaRuta)
    private etapaRepo: Repository<EtapaRuta>,
    @InjectRepository(RegistroEtapaOrden)
    private registroRepo: Repository<RegistroEtapaOrden>,
    @InjectRepository(OrdenProduccion)
    private ordenRepo: Repository<OrdenProduccion>,
    private tenantService: TenantService,
  ) {}

  // ── Centros de Trabajo ─────────────────────────────────────────────────────

  async crearCentro(dto: {
    nombre: string; descripcion?: string; tipo?: TipoCentroTrabajo;
    capacidadHorasDia?: number; costoHora?: number;
    responsable?: string; ubicacion?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = this.centroRepo.create({ ...dto, empresaId, activo: true });
    return this.centroRepo.save(c);
  }

  async getCentros() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.centroRepo.find({
      where: { empresaId, isActive: true },
      order: { nombre: 'ASC' },
    });
  }

  async updateCentro(id: number, dto: Partial<CentroTrabajo>) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.centroRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Centro de trabajo #${id} no encontrado`);
    await this.centroRepo.update(id, dto as any);
    return this.centroRepo.findOne({ where: { id } });
  }

  async deleteCentro(id: number) {
    await this.updateCentro(id, { isActive: false } as any);
    return { message: 'Centro de trabajo eliminado' };
  }

  // ── Rutas de Producción ────────────────────────────────────────────────────

  async crearRuta(dto: {
    codigo: string; nombre: string; descripcion?: string; listaId?: number;
    etapas?: Array<{
      centroTrabajoId?: number; nombre: string; orden: number;
      tiempoSetupMin?: number; tiempoOperacionMinPorUnidad?: number;
      descripcion?: string; esControl?: boolean;
    }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const ruta = await this.rutaRepo.save(
      this.rutaRepo.create({ codigo: dto.codigo, nombre: dto.nombre, descripcion: dto.descripcion, listaId: dto.listaId, activa: true, empresaId }),
    );

    if (dto.etapas?.length) {
      const etapas = dto.etapas.map(e => this.etapaRepo.create({ ...e, rutaId: ruta.id, empresaId }));
      await this.etapaRepo.save(etapas);
    }

    return this.getRuta(ruta.id);
  }

  async getRutas(listaId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.rutaRepo.createQueryBuilder('r')
      .leftJoinAndSelect('r.etapas', 'e')
      .leftJoinAndSelect('e.centroTrabajo', 'ct')
      .where('r.empresaId = :eid', { eid: empresaId })
      .andWhere('r.isActive = true');
    if (listaId) qb.andWhere('r.listaId = :lid', { lid: listaId });
    return qb.orderBy('r.nombre', 'ASC').addOrderBy('e.orden', 'ASC').getMany();
  }

  async getRuta(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const r = await this.rutaRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['etapas', 'etapas.centroTrabajo'],
    });
    if (!r) throw new NotFoundException(`Ruta #${id} no encontrada`);
    r.etapas = (r.etapas ?? []).sort((a, b) => a.orden - b.orden);
    return r;
  }

  async updateRuta(id: number, dto: { codigo?: string; nombre?: string; descripcion?: string; listaId?: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const ruta = await this.rutaRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!ruta) throw new NotFoundException(`Ruta #${id} no encontrada`);
    await this.rutaRepo.update(id, dto as any);
    return this.getRuta(id);
  }

  async deleteRuta(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const ruta = await this.rutaRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!ruta) throw new NotFoundException(`Ruta #${id} no encontrada`);
    await this.rutaRepo.update(id, { isActive: false } as any);
    return { message: 'Ruta eliminada' };
  }

  async agregarEtapa(rutaId: number, dto: {
    centroTrabajoId?: number; nombre: string; orden: number;
    tiempoSetupMin?: number; tiempoOperacionMinPorUnidad?: number;
    descripcion?: string; esControl?: boolean;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.getRuta(rutaId);
    const etapa = this.etapaRepo.create({ ...dto, rutaId, empresaId });
    return this.etapaRepo.save(etapa);
  }

  async updateEtapa(id: number, dto: Partial<EtapaRuta>) {
    await this.etapaRepo.update(id, dto as any);
    return this.etapaRepo.findOne({ where: { id }, relations: ['centroTrabajo'] });
  }

  async deleteEtapa(id: number) {
    await this.etapaRepo.delete(id);
    return { message: 'Etapa eliminada' };
  }

  // ── WIP — Asignar ruta a orden y trackear progreso ─────────────────────────

  async asignarRutaAOrden(ordenId: number, rutaId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const orden = await this.ordenRepo.findOne({ where: { id: ordenId, empresaId, isActive: true } as any });
    if (!orden) throw new NotFoundException(`Orden #${ordenId} no encontrada`);
    if (orden.estado !== EstadoOrdenProduccion.BORRADOR && orden.estado !== EstadoOrdenProduccion.PLANIFICADA) {
      throw new BadRequestException('Solo se puede asignar ruta a órdenes en borrador o planificadas');
    }

    const ruta = await this.getRuta(rutaId);

    // Eliminar registros anteriores si los hay
    await this.registroRepo.delete({ ordenId, empresaId });

    // Crear un registro por cada etapa (en estado PENDIENTE)
    const registros = ruta.etapas.map(e =>
      this.registroRepo.create({
        ordenId, etapaId: e.id, ordenEtapa: e.orden,
        estado: EstadoEtapaOrden.PENDIENTE, empresaId,
      }),
    );
    await this.registroRepo.save(registros);

    return this.getWIPOrden(ordenId);
  }

  async getWIPOrden(ordenId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const [orden, registros] = await Promise.all([
      this.ordenRepo.findOne({ where: { id: ordenId, empresaId, isActive: true } as any, relations: ['lista'] }),
      this.registroRepo.find({
        where: { ordenId, empresaId, isActive: true },
        relations: ['etapa', 'etapa.centroTrabajo'],
        order: { ordenEtapa: 'ASC' },
      }),
    ]);
    if (!orden) throw new NotFoundException(`Orden #${ordenId} no encontrada`);

    const totalEtapas    = registros.length;
    const completadas    = registros.filter(r => r.estado === EstadoEtapaOrden.COMPLETADA).length;
    const etapaActual    = registros.find(r => r.estado === EstadoEtapaOrden.EN_PROCESO)
                        ?? registros.find(r => r.estado === EstadoEtapaOrden.PENDIENTE);

    return {
      orden,
      progreso:    totalEtapas > 0 ? Number(((completadas / totalEtapas) * 100).toFixed(1)) : 0,
      etapaActual: etapaActual?.etapa?.nombre ?? 'Sin ruta asignada',
      registros,
      totalEtapas,
      completadas,
    };
  }

  async avanzarEtapa(registroId: number, dto: {
    estado: EstadoEtapaOrden;
    cantidadProcesada?: number;
    operadorId?: number;
    observaciones?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const reg = await this.registroRepo.findOne({ where: { id: registroId, empresaId, isActive: true } });
    if (!reg) throw new NotFoundException(`Registro #${registroId} no encontrado`);

    const update: Partial<RegistroEtapaOrden> = {
      estado:              dto.estado,
      cantidadProcesada:   dto.cantidadProcesada ?? reg.cantidadProcesada,
      operadorId:          dto.operadorId,
      observaciones:       dto.observaciones,
    };

    if (dto.estado === EstadoEtapaOrden.EN_PROCESO && !reg.fechaInicio) {
      update.fechaInicio = new Date();
    }
    if (dto.estado === EstadoEtapaOrden.COMPLETADA || dto.estado === EstadoEtapaOrden.RECHAZADA) {
      update.fechaFin = new Date();
    }

    await this.registroRepo.update(registroId, update as any);
    return this.registroRepo.findOne({ where: { id: registroId }, relations: ['etapa', 'etapa.centroTrabajo'] });
  }

  async getWIPResumen() {
    const empresaId = this.tenantService.getEmpresaId();

    const ordenesEnProceso = await this.ordenRepo.find({
      where: { estado: EstadoOrdenProduccion.EN_PROCESO, empresaId, isActive: true } as any,
      relations: ['lista'],
    });

    const wip = await Promise.all(
      ordenesEnProceso.map(async o => {
        const registros = await this.registroRepo.find({
          where: { ordenId: o.id, empresaId, isActive: true },
          order: { ordenEtapa: 'ASC' },
        });
        const completadas = registros.filter(r => r.estado === EstadoEtapaOrden.COMPLETADA).length;
        const etapaActual = registros.find(r => r.estado === EstadoEtapaOrden.EN_PROCESO)
                         ?? registros.find(r => r.estado === EstadoEtapaOrden.PENDIENTE);
        return {
          orden: o,
          totalEtapas:  registros.length,
          completadas,
          progreso:     registros.length > 0 ? Number(((completadas / registros.length) * 100).toFixed(1)) : 0,
          etapaActual:  etapaActual?.etapaId ? String(etapaActual.etapaId) : 'Sin ruta',
          etapaId:      etapaActual?.etapaId,
        };
      }),
    );

    return {
      ordenesEnProceso: wip,
      totalOrdenes:     wip.length,
      ordenesConRuta:   wip.filter(w => w.totalEtapas > 0).length,
    };
  }

  // ── Cálculo de tiempo estimado por ruta ───────────────────────────────────

  calcularTiempoRuta(etapas: EtapaRuta[], cantidad: number) {
    const detalle = etapas.map(e => {
      const tiempoSetup = Number(e.tiempoSetupMin ?? 0);
      const tiempoOper  = Number(e.tiempoOperacionMinPorUnidad ?? 0) * cantidad;
      return {
        etapa:          e.nombre,
        centroTrabajo:  (e.centroTrabajo as any)?.nombre ?? '—',
        tiempoSetupMin: tiempoSetup,
        tiempoOperMin:  tiempoOper,
        totalMin:       tiempoSetup + tiempoOper,
      };
    });
    const totalMin  = detalle.reduce((s, e) => s + e.totalMin, 0);
    return { detalle, totalMinutos: totalMin, totalHoras: Number((totalMin / 60).toFixed(2)) };
  }
}
