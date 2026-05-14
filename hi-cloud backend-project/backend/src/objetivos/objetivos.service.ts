import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Objetivo, EstadoObjetivo, PeriodoObjetivo } from './entities/objetivo.entity';
import { ResultadoClave, TipoResultado } from './entities/resultado-clave.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class ObjetivosService {
  constructor(
    @InjectRepository(Objetivo)       private objRepo: Repository<Objetivo>,
    @InjectRepository(ResultadoClave) private krRepo:  Repository<ResultadoClave>,
    private tenantService: TenantService,
  ) {}

  // ── Objetivos ─────────────────────────────────────────────────────────────

  async crear(dto: any) {
    return this.objRepo.save(this.objRepo.create({ ...dto, progresoGlobal: 0 }));
  }

  async listar(anio?: number, periodo?: PeriodoObjetivo) {
    const eid = this.tenantService.getEmpresaId();
    const qb = this.objRepo.createQueryBuilder('o')
      .where('o.isActive = true')
      .andWhere('o.empresaId = :eid', { eid });
    if (anio)    qb.andWhere('o.anio = :y',    { y: anio });
    if (periodo) qb.andWhere('o.periodo = :p', { p: periodo });
    const objetivos = await qb.orderBy('o.createdAt', 'DESC').getMany();
    return Promise.all(objetivos.map(o => this.enriquecer(o)));
  }

  async findById(id: number) {
    const o = await this.objRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!o) throw new NotFoundException(`Objetivo #${id} no encontrado`);
    return this.enriquecer(o);
  }

  private async enriquecer(o: Objetivo) {
    const krs = await this.krRepo.find({ where: { objetivoId: o.id, isActive: true } });
    const progreso = krs.length > 0
      ? Math.round(krs.reduce((s, k) => s + k.progreso, 0) / krs.length)
      : o.progresoGlobal;
    return { ...o, resultadosClave: krs, progresoCalculado: progreso };
  }

  async actualizar(id: number, dto: any) {
    await this.objRepo.findOne({ where: { id } });
    await this.objRepo.update(id, dto);
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.objRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Resultados Clave (KR) ─────────────────────────────────────────────────

  async crearKR(objetivoId: number, dto: any) {
    await this.objRepo.findOne({ where: { id: objetivoId } });
    const kr = await this.krRepo.save(this.krRepo.create({
      objetivoId, ...dto, progreso: 0,
    }));
    return kr;
  }

  async actualizarProgreso(krId: number, valorActual: number): Promise<ResultadoClave> {
    const kr = await this.krRepo.findOne({ where: { id: krId } });
    if (!kr) throw new NotFoundException(`KR #${krId} no encontrado`);

    let progreso = 0;
    if (kr.tipo === TipoResultado.BOOLEANO) {
      progreso = valorActual >= 1 ? 100 : 0;
    } else {
      const rango = Number(kr.valorMeta) - Number(kr.valorInicio);
      if (rango > 0) {
        progreso = Math.min(100, Math.round(
          ((valorActual - Number(kr.valorInicio)) / rango) * 100,
        ));
      }
    }

    await this.krRepo.update(krId, { valorActual, progreso });

    // Recalcular progreso global del objetivo
    const todosKRs = await this.krRepo.find({ where: { objetivoId: kr.objetivoId, isActive: true } });
    const progresoGlobal = todosKRs.length > 0
      ? Math.round(todosKRs.reduce((s, k) => s + (k.id === krId ? progreso : k.progreso), 0) / todosKRs.length)
      : 0;

    // Actualizar estado automáticamente
    let nuevoEstado: EstadoObjetivo = EstadoObjetivo.ACTIVO;
    if (progresoGlobal >= 100)      nuevoEstado = EstadoObjetivo.CUMPLIDO;
    else if (progresoGlobal < 30)   nuevoEstado = EstadoObjetivo.EN_RIESGO;

    await this.objRepo.update(kr.objetivoId, { progresoGlobal, estado: nuevoEstado });

    return this.krRepo.findOne({ where: { id: krId } }) as Promise<ResultadoClave>;
  }

  async eliminarKR(id: number) {
    await this.krRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard OKR ─────────────────────────────────────────────────────────

  async getDashboard(anio: number) {
    const objetivos = await this.listar(anio);
    const cumplidos  = objetivos.filter(o => o.estado === EstadoObjetivo.CUMPLIDO).length;
    const enRiesgo   = objetivos.filter(o => o.estado === EstadoObjetivo.EN_RIESGO).length;
    const activos    = objetivos.filter(o => o.estado === EstadoObjetivo.ACTIVO).length;
    const promedioGlobal = objetivos.length > 0
      ? Math.round(objetivos.reduce((s, o) => s + o.progresoCalculado, 0) / objetivos.length)
      : 0;

    return {
      anio,
      total: objetivos.length,
      cumplidos, enRiesgo, activos,
      promedioGlobal,
      objetivos,
    };
  }
}
