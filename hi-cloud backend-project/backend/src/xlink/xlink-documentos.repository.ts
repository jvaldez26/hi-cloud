import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
  estadoReceptor?: XlinkEstadoReceptor;
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

  /** Ya existe un xlink_documento publicado para este documento origen. */
  async existePorOrigen(tipoDocumento: XlinkTipoDocumento, documentoOrigenId: number): Promise<boolean> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    const count = await this.repo.count({ where: { origenEmpresaId, tipoDocumento, documentoOrigenId } });
    return count > 0;
  }

  /** Cualquiera de los dos lados (origen o destino) puede leerlo — ej. ver el PDF original. */
  async buscarPorId(id: number): Promise<XlinkDocumento | null> {
    const eid = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: [{ id, origenEmpresaId: eid }, { id, destinoEmpresaId: eid }] });
  }

  /** Solo el lado DESTINO puede resolverlo (recibir/marcar procesado/descartar). */
  async buscarPorIdComoDestino(id: number, manager?: EntityManager): Promise<XlinkDocumento | null> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.manager(manager).findOne({ where: { id, destinoEmpresaId } });
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
      .where('x.id = :id AND x."destinoEmpresaId" = :destinoEmpresaId', { id, destinoEmpresaId })
      .setLock('pessimistic_write')
      .getOne();
  }

  /** Solo el lado ORIGEN puede resolverlo (ej. DELETE /xlink/enviados/:id, anular). */
  async buscarPorIdComoOrigen(id: number): Promise<XlinkDocumento | null> {
    const origenEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.findOne({ where: { id, origenEmpresaId } });
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
    return this.repo.findOne({ where: { origenEmpresaId, tipoDocumento, documentoOrigenId } });
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

    const qb = this.repo.createQueryBuilder('x').where(`x."${lado}" = :eid`, { eid });
    if (desde)          qb.andWhere('x."fechaOrigen" >= :desde', { desde });
    if (hasta)          qb.andWhere('x."fechaOrigen" <= :hasta', { hasta });
    if (tipoDocumento)  qb.andWhere('x."tipoDocumento" = :tipoDocumento', { tipoDocumento });
    if (numeroOrigen)   qb.andWhere('x."numeroOrigen" ILIKE :numeroOrigen', { numeroOrigen: `%${numeroOrigen}%` });
    if (ncfOrigen)      qb.andWhere('x."ncfOrigen" ILIKE :ncfOrigen', { ncfOrigen: `%${ncfOrigen}%` });
    if (estadoReceptor) qb.andWhere('x."estadoReceptor" = :estadoReceptor', { estadoReceptor });

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
    return this.repo.findOne({ where: { destinoEmpresaId, origenEmpresaId, tipoDocumento, documentoOrigenId } });
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
    return this.repo.findOne({ where: { destinoEmpresaId, documentoGeneradoTipo, documentoGeneradoId } });
  }

  /** Conteo para el badge de "Por Procesar" del sidebar. */
  async contarPendientesComoDestino(): Promise<number> {
    const destinoEmpresaId = this.tenantService.getEmpresaId();
    return this.repo.count({ where: { destinoEmpresaId, estadoReceptor: XlinkEstadoReceptor.PENDIENTE } });
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
