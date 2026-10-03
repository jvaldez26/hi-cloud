import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import {
  XlinkDocumento,
  XlinkEstadoReceptor,
  XlinkTipoDocumento,
} from './entities/xlink-documento.entity';

export interface XlinkListaFiltros {
  page?: number;
  limit?: number;
  desde?: string;
  hasta?: string;
  tipoDocumento?: XlinkTipoDocumento;
  numeroOrigen?: string;
  ncfOrigen?: string;
  /**
   * Un valor filtra exacto; un array filtra con IN — usado por la pestaña
   * "Procesados" para mostrar 'procesado' Y 'procesado_manual' juntos (antes
   * procesado_manual desaparecía de toda vista del receptor una vez marcado).
   */
  estadoReceptor?: XlinkEstadoReceptor | XlinkEstadoReceptor[];
}

/**
 * ÚNICO punto de acceso a `xlink_documentos` en todo el backend. La tabla no
 * tiene `empresaId` (pertenece a DOS empresas) y por eso NO puede pasar por
 * TenantAwareRepository/TenantSubscriber — este repositorio es lo que hace
 * ese trabajo a mano: cada método exige el eid del CLS y filtra por
 * (origenEmpresaId = eid OR destinoEmpresaId = eid), o el lado específico
 * según la operación (nunca confiar en un eid que venga del body/DTO).
 *
 * PROHIBIDO usar `@InjectRepository(XlinkDocumento)` en cualquier otro
 * archivo — xlink-documentos.repository.spec.ts falla el build si algún
 * otro archivo referencia la entidad o la tabla directo.
 */
@Injectable()
export class XlinkDocumentosRepository {
  constructor(
    @InjectRepository(XlinkDocumento)
    private readonly repo: Repository<XlinkDocumento>,
    private readonly tenantService: TenantService,
  ) {}

  private manager(manager?: EntityManager) {
    return manager ? manager.getRepository(XlinkDocumento) : this.repo;
  }

  /** Crea un documento como ORIGEN — origenEmpresaId sale SIEMPRE del CLS, nunca del caller. */
  async crear(
    data: Omit<Partial<XlinkDocumento>, 'origenEmpresaId'>,
    manager?: EntityManager,
  ): Promise<XlinkDocumento> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    const entity = this.manager(manager).create({ ...data, origenEmpresaId });
    return this.manager(manager).save(entity);
  }

  /**
   * Ya existe un xlink_documento publicado para este documento origen. Solo
   * cuenta los ACTIVOS: un envío retirado (isActive=false) no debe bloquear
   * un reenvío — "retirar" es un verdadero deshacer, no solo ocultarlo.
   */
  async existePorOrigen(tipoDocumento: XlinkTipoDocumento, documentoOrigenId: number): Promise<boolean> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    const count = await this.repo.count({ where: { origenEmpresaId, tipoDocumento, documentoOrigenId, isActive: true } });
    return count > 0;
  }

  /**
   * Estado de envío de VARIOS documentos origen en UNA sola consulta — para
   * la columna Xlink de los listados y el envío en lote ("Solo pendientes de
   * enviar"), que antes no tenían forma de saber esto sin pedir uno por uno
   * (Fase 2a, auditoría HiCloud Xlink 2026-10-03). Devuelve un Map por
   * documentoOrigenId — los que no aparecen ahí nunca se publicaron.
   */
  async buscarEstadosPorOrigenes(
    tipoDocumento: XlinkTipoDocumento,
    documentoOrigenIds: number[],
  ): Promise<Map<number, { estadoReceptor: XlinkEstadoReceptor; numeroGenerado?: string }>> {
    const mapa = new Map<number, { estadoReceptor: XlinkEstadoReceptor; numeroGenerado?: string }>();
    if (documentoOrigenIds.length === 0) return mapa;

    const origenEmpresaId = this.tenantService.getEmpresaId();
    const filas = await this.repo.find({
      where: { origenEmpresaId, tipoDocumento, documentoOrigenId: In(documentoOrigenIds), isActive: true },
      select: ['documentoOrigenId', 'estadoReceptor', 'numeroGenerado'],
    });
    for (const f of filas) {
      mapa.set(f.documentoOrigenId, { estadoReceptor: f.estadoReceptor, numeroGenerado: f.numeroGenerado });
    }
    return mapa;
  }

  /** Cualquiera de los dos lados (origen o destino) puede leerlo — ej. ver el PDF original. */
  async buscarPorId(id: number): Promise<XlinkDocumento | null> {
    const eid = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: [
      { id, origenEmpresaId: eid, isActive: true },
      { id, destinoEmpresaId: eid, isActive: true },
    ] });
  }

  /** Solo el lado DESTINO puede resolverlo (recibir/marcar procesado/descartar). */
  async buscarPorIdComoDestino(id: number, manager?: EntityManager): Promise<XlinkDocumento | null> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.manager(manager).findOne({ where: { id, destinoEmpresaId, isActive: true } });
  }

  /**
   * Igual que buscarPorIdComoDestino, pero con FOR UPDATE dentro de la
   * transacción del caller — evita que dos peticiones concurrentes por el
   * mismo xlinkDocumentoId pasen ambas el chequeo de "pendiente" antes de
   * que ninguna termine de procesar (ver Fase 4, POST /xlink/recibir).
   * Requiere `manager` de una transacción activa.
   */
  async bloquearPorIdComoDestino(id: number, manager: EntityManager): Promise<XlinkDocumento | null> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return manager
      .getRepository(XlinkDocumento)
      .createQueryBuilder('x')
      .where('x.id = :id AND x."destinoEmpresaId" = :destinoEmpresaId AND x."isActive" = true', { id, destinoEmpresaId })
      .setLock('pessimistic_write')
      .getOne();
  }

  /** Solo el lado ORIGEN puede resolverlo (ej. DELETE /xlink/enviados/:id, anular). */
  async buscarPorIdComoOrigen(id: number): Promise<XlinkDocumento | null> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: { id, origenEmpresaId, isActive: true } });
  }

  /**
   * ¿Este documento (por su id ORIGINAL, no el id de xlink_documentos) ya
   * fue publicado por mi empresa? Usado por el gancho de anulación — si el
   * emisor anula un documento después de publicarlo, hay que encontrarlo
   * por su documentoOrigenId, no por el id de la fila de Xlink (que el
   * caller de facturas/NC/ND/compras no conoce).
   */
  async buscarPorOrigenParaAnular(
    tipoDocumento: XlinkTipoDocumento,
    documentoOrigenId: number,
  ): Promise<XlinkDocumento | null> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: { origenEmpresaId, tipoDocumento, documentoOrigenId, isActive: true } });
  }

  async listarComoDestino(filtros: XlinkListaFiltros) {
    return this.listar('destinoEmpresaId', filtros);
  }

  async listarComoOrigen(filtros: XlinkListaFiltros) {
    return this.listar('origenEmpresaId', filtros);
  }

  private async listar(lado: 'origenEmpresaId' | 'destinoEmpresaId', filtros: XlinkListaFiltros) {
    const eid = this.tenantService.getEmpresaId();
    const { page = 1, limit = 10, desde, hasta, tipoDocumento, numeroOrigen, ncfOrigen, estadoReceptor } = filtros;

    const qb = this.repo.createQueryBuilder('x').where(`x."${lado}" = :eid AND x."isActive" = true`, { eid });
    // Por publicadoEn (cuándo pasó por Xlink), no por fechaOrigen (la fecha
    // propia del documento, que puede ser de cualquier día — una OC fechada
    // en septiembre y enviada hoy no aparecía en el filtro "este mes" de
    // ninguna de las dos pantallas, aunque el envío hubiera funcionado).
    if (desde)          qb.andWhere('x."publicadoEn"::date >= :desde', { desde });
    if (hasta)          qb.andWhere('x."publicadoEn"::date <= :hasta', { hasta });
    if (tipoDocumento)  qb.andWhere('x."tipoDocumento" = :tipoDocumento', { tipoDocumento });
    if (numeroOrigen)   qb.andWhere('x."numeroOrigen" ILIKE :numeroOrigen', { numeroOrigen: `%${numeroOrigen}%` });
    if (ncfOrigen)      qb.andWhere('x."ncfOrigen" ILIKE :ncfOrigen', { ncfOrigen: `%${ncfOrigen}%` });
    if (Array.isArray(estadoReceptor)) {
      if (estadoReceptor.length > 0) qb.andWhere('x."estadoReceptor" IN (:...estadoReceptor)', { estadoReceptor });
    } else if (estadoReceptor) {
      qb.andWhere('x."estadoReceptor" = :estadoReceptor', { estadoReceptor });
    }

    const [data, total] = await qb
      .orderBy('x."publicadoEn"', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Encuentra, del lado DESTINO (mi empresa), el xlink_documento que
   * corresponde a un (origenEmpresaId, tipoDocumento, documentoOrigenId)
   * puntual — usado para encontrar la Compra que generé al recibir la
   * Factura que una Nota de Crédito recibida ahora modifica.
   */
  async buscarPorOrigenComoDestino(
    origenEmpresaId: number,
    tipoDocumento: XlinkTipoDocumento,
    documentoOrigenId: number,
  ): Promise<XlinkDocumento | null> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: { destinoEmpresaId, origenEmpresaId, tipoDocumento, documentoOrigenId, isActive: true } });
  }

  /**
   * ¿El documento generado (ej. una Cotización) que YO recibí vino a su vez
   * de un xlink_documentos anterior? Usado para encadenar `xlinkPadreId` al
   * publicar una Factura que se emitió a partir de ese documento generado —
   * ver XlinkPublicarService.
   */
  async buscarPorDocumentoGeneradoComoDestino(
    documentoGeneradoTipo: string,
    documentoGeneradoId: number,
  ): Promise<XlinkDocumento | null> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: { destinoEmpresaId, documentoGeneradoTipo, documentoGeneradoId, isActive: true } });
  }

  /** Conteo para el badge de "Por Procesar" del sidebar. */
  async contarPendientesComoDestino(): Promise<number> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.count({ where: { destinoEmpresaId, estadoReceptor: XlinkEstadoReceptor.PENDIENTE, isActive: true } });
  }

  /**
   * Guarda una entidad ya obtenida por alguno de los métodos de arriba (la
   * pertenencia ya se verificó al leerla) — nunca aceptar una entidad
   * construida a mano desde otro archivo.
   */
  async guardar(entity: XlinkDocumento, manager?: EntityManager): Promise<XlinkDocumento> {
    return this.manager(manager).save(entity);
  }

  /** Defensa en profundidad: si algún caller pasa una entidad de otra empresa, rechazar aquí también. */
  assertPerteneceAEmpresaActual(doc: XlinkDocumento, lado: 'origen' | 'destino' | 'cualquiera' = 'cualquiera'): void {
    const eid = this.tenantService.getEmpresaId();
    const esOrigen  = doc.origenEmpresaId  === eid;
    const esDestino = doc.destinoEmpresaId === eid;
    const ok = lado === 'origen' ? esOrigen : lado === 'destino' ? esDestino : (esOrigen || esDestino);
    if (!ok) throw new ForbiddenException('Este documento de HiCloud Xlink no pertenece a tu empresa');
  }
}
