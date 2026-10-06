import { BadRequestException, ForbiddenException, Injectable, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { LimitesService } from '../suscripciones/limites.service';
import { SuscripcionEstado } from '../suscripciones/entities/suscripcion.entity';
import { AuditoriaService, CreateAuditLogDto } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { ClientesService } from '../clientes/clientes.service';
import { VincularXlinkDto } from './dto/vincular-xlink.dto';
import { XlinkDocumentosRepository, XlinkListaFiltros } from './xlink-documentos.repository';
import { CacheKeys } from '../common/cache/cache-keys';

export interface XlinkDirectorioFiltros {
  q?: string;
  soloRegistradas?: boolean;
  page?: number;
}

const LIMIT_DIRECTORIO = 20;

/**
 * Fase 2 de HiCloud Xlink — activar la propia empresa, listar el directorio
 * y vincular clientes/proveedores con la empresa contraparte.
 */
@Injectable()
export class XlinkService {
  constructor(
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectDataSource()
    private ds: DataSource,
    private tenantService: TenantService,
    private limitesService: LimitesService,
    private auditoria: AuditoriaService,
    private proveedoresService: ProveedoresService,
    private clientesService: ClientesService,
    private xlinkRepo: XlinkDocumentosRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /** GET /xlink/enviados — Fase 5 (listado "Documentos Enviados"). */
  async listarEnviados(filtros: XlinkListaFiltros) {
    const resultado = await this.xlinkRepo.listarComoOrigen(filtros);
    const conContraparte = await this.conContraparte(resultado.data, 'destinoEmpresaId');
    return { ...resultado, data: await this.conUsuarioQuePublico(conContraparte) };
  }

  /**
   * Enriquece cada fila con el nombre de quién la publicó
   * (publicadoPorUsuarioId) — "Documentos Enviados" lo pedía y solo tenía el
   * id crudo. Un solo query por página (IN sobre los usuarioId distintos).
   */
  private async conUsuarioQuePublico<T extends { publicadoPorUsuarioId: number }>(
    filas: T[],
  ): Promise<(T & { publicadoPorUsuarioNombre: string })[]> {
    const ids = [...new Set(filas.map(f => f.publicadoPorUsuarioId))];
    if (ids.length === 0) return filas as any;

    const rows = await this.ds.query(`SELECT id, nombre FROM users WHERE id = ANY($1)`, [ids]);
    const porId = new Map<number, string>(rows.map((r: any) => [r.id, r.nombre]));

    return filas.map(f => ({ ...f, publicadoPorUsuarioNombre: porId.get(f.publicadoPorUsuarioId) ?? '—' }));
  }

  /** GET /xlink/recibidos — Fase 5 (tabs "Por Procesar"/"Procesados"/"Descartados", filtradas por estadoReceptor). */
  async listarRecibidos(filtros: XlinkListaFiltros) {
    const resultado = await this.xlinkRepo.listarComoDestino(filtros);
    return { ...resultado, data: await this.conContraparte(resultado.data, 'origenEmpresaId') };
  }

  /**
   * Enriquece cada fila con el nombre y el xlinkId de la CONTRAPARTE (nunca
   * su empresaId) — la columna "empresa relacionada" del listado, y el
   * contraparteXlinkId que el modal de homologación necesita para guardar
   * mapeos. Un solo query por página (IN sobre los empresaId distintos),
   * no uno por fila.
   */
  private async conContraparte<T extends Record<string, any>>(
    filas: T[],
    campoEmpresaId: 'origenEmpresaId' | 'destinoEmpresaId',
  ): Promise<(T & { contraparteXlinkId: string; contraparteNombre: string })[]> {
    const ids = [...new Set(filas.map(f => f[campoEmpresaId]))];
    if (ids.length === 0) return filas as any;

    const rows = await this.ds.query(
      `SELECT id, "xlinkId", COALESCE("nombreComercial", nombre) AS nombre FROM empresa WHERE id = ANY($1)`,
      [ids],
    );
    const porId = new Map(rows.map((r: any) => [r.id, r]));

    return filas.map(f => {
      const emp = porId.get(f[campoEmpresaId]) as any;
      return { ...f, contraparteXlinkId: emp?.xlinkId ?? null, contraparteNombre: emp?.nombre ?? '—' };
    });
  }

  /** GET /xlink/pendientes/conteo — badge del sidebar. */
  async contarPendientes(): Promise<{ total: number }> {
    const total = await this.xlinkRepo.contarPendientesComoDestino();
    return { total };
  }

  /**
   * Gate reutilizable para Fase 3 (publicar) y Fase 4 (recibir): una empresa
   * que no se activó en el directorio no puede ni enviar ni recibir — no
   * basta con que la CONTRAPARTE esté visible.
   */
  async assertPuedeUsarXlink(empresaId: number): Promise<void> {
    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId } });
    if (!empresa?.xlinkVisible) {
      throw new ForbiddenException(
        'Tu empresa aún no está activada en HiCloud Xlink. Ve a HiCloud Xlink → Activar para poder enviar y recibir documentos.',
      );
    }
  }

  async actualizarVisibilidad(visible: boolean, usuario: { id: number; nombre?: string; email?: string }) {
    const empresaId = this.tenantService.getEmpresaId();

    if (visible) {
      const suscripcion = await this.limitesService.getSuscripcion(empresaId);
      if (suscripcion.estado === SuscripcionEstado.PRUEBA) {
        throw new BadRequestException(
          'No puedes activar HiCloud Xlink mientras tu empresa está en período de prueba. Actualiza tu plan primero.',
        );
      }
    }

    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId } });
    if (!empresa) throw new BadRequestException('Empresa no encontrada');

    await this.empresaRepository.update(empresaId, {
      xlinkVisible: visible,
      ...(visible && !empresa.xlinkVisibleDesde ? { xlinkVisibleDesde: new Date() } : {}),
    });
    // ConfiguracionService.getEmpresa() cachea la fila de empresa y solo se
    // invalida en updateEmpresa() — este update() va directo al repo, por
    // otro camino, y dejaba el GET /configuracion/empresa sirviendo
    // xlinkVisible viejo hasta que el TTL expirara: el switch del frontend
    // lee exactamente ese valor, así que parecía "no activarse" aunque el
    // PATCH sí había guardado en BD (encontrado probando en producción).
    await this.cache.del(CacheKeys.empresaConfig(empresaId));

    const auditLog: CreateAuditLogDto = {
      userId: usuario.id,
      userName: usuario.nombre ?? usuario.email,
      accion: AccionAuditoria.UPDATE,
      modulo: 'xlink',
      entidad: 'Empresa',
      entidadId: String(empresaId),
      descripcion: visible
        ? 'Activó la visibilidad de la empresa en el Directorio de HiCloud Xlink'
        : 'Desactivó la visibilidad de la empresa en el Directorio de HiCloud Xlink',
      metodo: 'PATCH',
      ruta: '/xlink/visibilidad',
      exitoso: true,
    };
    await this.auditoria.registrar(auditLog);

    return { xlinkVisible: visible };
  }

  /**
   * Directorio de empresas — solo visibles, sin trial, activas y distintas a
   * la propia. proveedorRelacionado/clienteRelacionado se resuelven del lado
   * del SOLICITANTE (mi empresa), nunca se expone empresaId, solo xlinkId.
   */
  async getDirectorio(filtros: XlinkDirectorioFiltros) {
    const miEmpresaId = this.tenantService.getEmpresaId();
    const page = Math.max(1, filtros.page ?? 1);
    const offset = (page - 1) * LIMIT_DIRECTORIO;
    const search = filtros.q?.trim() ? `%${filtros.q.trim()}%` : null;
    const soloRegistradas = filtros.soloRegistradas === true;

    const whereBase = `
      e."isActive" = true
      AND e."xlinkVisible" = true
      AND s.estado <> '${SuscripcionEstado.PRUEBA}'
      AND e.id <> $1
      AND ($2::text IS NULL OR e."nombreComercial" ILIKE $2 OR e.nombre ILIKE $2 OR e.rnc ILIKE $2)
    `;
    // "Solo registradas" también debe traer las que coinciden por RNC pero
    // AÚN no están vinculadas (prr/clr) — son justo las que el texto de
    // ayuda promete descubrir ("la forma más rápida de ver con quién se
    // puede empezar"); antes solo contaban las YA vinculadas (pv/cv), así
    // que esas quedaban invisibles con el filtro activado (Fase 2e,
    // auditoría HiCloud Xlink 2026-10-03).
    const havingRegistradas = soloRegistradas
      ? 'AND (pv.id IS NOT NULL OR cv.id IS NOT NULL OR prr.id IS NOT NULL OR clr.id IS NOT NULL)'
      : '';

    const rows = await this.ds.query(
      `
      SELECT
        e."xlinkId"          AS "xlinkId",
        e."nombreComercial"  AS "nombreComercial",
        e.nombre              AS "nombre",
        e.rnc                 AS "rnc",
        e.sector               AS "industria",
        pv.id AS "proveedorVinculadoId", pv.nombre AS "proveedorVinculadoNombre",
        prr.id AS "proveedorRncId",       prr.nombre AS "proveedorRncNombre",
        cv.id AS "clienteVinculadoId",   cv.nombre AS "clienteVinculadoNombre",
        clr.id AS "clienteRncId",         clr.nombre AS "clienteRncNombre"
      FROM empresa e
      JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN proveedores pv
        ON pv."empresaId" = $1 AND pv."isActive" = true AND pv."xlinkEmpresaXlinkId" = e."xlinkId"
      LEFT JOIN proveedores prr
        ON prr."empresaId" = $1 AND prr."isActive" = true AND prr."xlinkEmpresaXlinkId" IS NULL AND prr.rnc = e.rnc
      LEFT JOIN clientes cv
        ON cv."empresaId" = $1 AND cv."isActive" = true AND cv."xlinkEmpresaXlinkId" = e."xlinkId"
      LEFT JOIN clientes clr
        ON clr."empresaId" = $1 AND clr."isActive" = true AND clr."xlinkEmpresaXlinkId" IS NULL
        AND (clr.rfc = e.rnc OR clr."rncReceptor" = e.rnc)
      WHERE ${whereBase}
      ${havingRegistradas}
      ORDER BY COALESCE(e."nombreComercial", e.nombre) ASC
      LIMIT ${LIMIT_DIRECTORIO} OFFSET $3
      `,
      [miEmpresaId, search, offset],
    );

    const [{ total }] = await this.ds.query(
      `
      SELECT COUNT(*) AS total
      FROM empresa e
      JOIN suscripciones s ON s."empresaId" = e.id
      LEFT JOIN proveedores pv
        ON pv."empresaId" = $1 AND pv."isActive" = true AND pv."xlinkEmpresaXlinkId" = e."xlinkId"
      LEFT JOIN proveedores prr
        ON prr."empresaId" = $1 AND prr."isActive" = true AND prr."xlinkEmpresaXlinkId" IS NULL AND prr.rnc = e.rnc
      LEFT JOIN clientes cv
        ON cv."empresaId" = $1 AND cv."isActive" = true AND cv."xlinkEmpresaXlinkId" = e."xlinkId"
      LEFT JOIN clientes clr
        ON clr."empresaId" = $1 AND clr."isActive" = true AND clr."xlinkEmpresaXlinkId" IS NULL
        AND (clr.rfc = e.rnc OR clr."rncReceptor" = e.rnc)
      WHERE ${whereBase}
      ${havingRegistradas}
      `,
      [miEmpresaId, search],
    );

    const data = rows.map((r: any) => ({
      xlinkId: r.xlinkId,
      nombreComercial: r.nombreComercial ?? r.nombre,
      rnc: r.rnc,
      industria: r.industria ?? null,
      proveedorRelacionado: r.proveedorVinculadoId
        ? { estado: 'vinculado', id: r.proveedorVinculadoId, nombre: r.proveedorVinculadoNombre }
        : r.proveedorRncId
        ? { estado: 'coincide_sin_vincular', id: r.proveedorRncId, nombre: r.proveedorRncNombre }
        : { estado: 'no_existe' },
      clienteRelacionado: r.clienteVinculadoId
        ? { estado: 'vinculado', id: r.clienteVinculadoId, nombre: r.clienteVinculadoNombre }
        : r.clienteRncId
        ? { estado: 'coincide_sin_vincular', id: r.clienteRncId, nombre: r.clienteRncNombre }
        : { estado: 'no_existe' },
    }));

    const totalNum = Number(total);
    return {
      data,
      meta: { total: totalNum, page, limit: LIMIT_DIRECTORIO, totalPages: Math.ceil(totalNum / LIMIT_DIRECTORIO) },
    };
  }

  /**
   * Vincula (o crea) un cliente/proveedor propio con la empresa de xlinkId.
   * Idempotente: si ya hay un registro vinculado a esa contraparte, lo
   * devuelve tal cual en vez de crear uno nuevo.
   *
   * `dto.datos` SOLO llega desde el formulario "Crear" del Directorio (ver
   * punto 1 del pedido): su presencia activa el modo "con confirmación" —
   * una coincidencia por RNC que antes se vinculaba en silencio ahora se
   * reporta como `requiere_confirmacion` en vez de vincularse a ciegas, y la
   * creación usa los campos que tecleó el usuario (no solo nombre/RNC). El
   * botón "Vincular" de un clic (coincide_sin_vincular) sigue llamando sin
   * `datos` — ese camino queda exactamente como estaba.
   */
  async vincular(dto: VincularXlinkDto) {
    const miEmpresaId = this.tenantService.getEmpresaId();

    const [contraparte] = await this.ds.query(
      `SELECT id, "nombreComercial", nombre, rnc, "xlinkVisible", "isActive"
       FROM empresa WHERE "xlinkId" = $1`,
      [dto.xlinkId],
    );
    if (!contraparte) throw new BadRequestException('Esa empresa no existe en HiCloud Xlink');
    if (contraparte.id === miEmpresaId) throw new BadRequestException('No puedes vincularte con tu propia empresa');
    if (!contraparte.isActive || !contraparte.xlinkVisible) {
      throw new BadRequestException('Esa empresa ya no está visible en el directorio de HiCloud Xlink');
    }

    const nombreContraparte = contraparte.nombreComercial ?? contraparte.nombre;
    const datos = dto.datos;

    if (dto.rol === 'proveedor') {
      const yaVinculado = await this.ds.query(
        `SELECT id FROM proveedores WHERE "empresaId" = $1 AND "isActive" = true AND "xlinkEmpresaXlinkId" = $2 LIMIT 1`,
        [miEmpresaId, dto.xlinkId],
      );
      if (yaVinculado[0]) {
        const registro = await this.proveedoresService.findOne(yaVinculado[0].id);
        return datos ? { accion: 'ya_vinculado' as const, registro } : registro;
      }

      const coincideRnc = contraparte.rnc
        ? await this.ds.query(
            `SELECT id, nombre FROM proveedores
             WHERE "empresaId" = $1 AND "isActive" = true AND "xlinkEmpresaXlinkId" IS NULL AND rnc = $2`,
            [miEmpresaId, contraparte.rnc],
          )
        : [];

      if (coincideRnc.length === 1) {
        if (datos) {
          return {
            accion: 'requiere_confirmacion' as const,
            existente: { id: coincideRnc[0].id, nombre: coincideRnc[0].nombre },
          };
        }
        await this.ds.query(
          `UPDATE proveedores SET "xlinkEmpresaXlinkId" = $1 WHERE id = $2`,
          [dto.xlinkId, coincideRnc[0].id],
        );
        return this.proveedoresService.findOne(coincideRnc[0].id);
      }

      // Sin match único (0 o más de 1) — crear nuevo, nunca adivinar cuál vincular.
      const registro = await this.proveedoresService.create({
        nombre: datos?.nombre ?? nombreContraparte,
        rnc: contraparte.rnc ?? undefined,
        xlinkEmpresaXlinkId: dto.xlinkId,
        telefono: datos?.telefono,
        email: datos?.email,
        direccion: datos?.direccion,
        contacto: datos?.contacto,
        categoria: datos?.categoria,
        diasPago: datos?.diasPago,
        banco: datos?.banco,
        cuentaBancaria: datos?.cuentaBancaria,
        notas: datos?.notas,
        sincronizarArticulosXlink: datos?.sincronizarArticulosXlink,
      } as any);
      return datos ? { accion: 'creado' as const, registro } : registro;
    }

    // rol === 'cliente'
    const yaVinculado = await this.ds.query(
      `SELECT id FROM clientes WHERE "empresaId" = $1 AND "isActive" = true AND "xlinkEmpresaXlinkId" = $2 LIMIT 1`,
      [miEmpresaId, dto.xlinkId],
    );
    if (yaVinculado[0]) {
      const registro = await this.clientesService.findOne(yaVinculado[0].id);
      return datos ? { accion: 'ya_vinculado' as const, registro } : registro;
    }

    const coincideRnc = contraparte.rnc
      ? await this.ds.query(
          `SELECT id, nombre FROM clientes
           WHERE "empresaId" = $1 AND "isActive" = true AND "xlinkEmpresaXlinkId" IS NULL
           AND (rfc = $2 OR "rncReceptor" = $2)`,
          [miEmpresaId, contraparte.rnc],
        )
      : [];

    if (coincideRnc.length === 1) {
      if (datos) {
        return {
          accion: 'requiere_confirmacion' as const,
          existente: { id: coincideRnc[0].id, nombre: coincideRnc[0].nombre },
        };
      }
      await this.ds.query(
        `UPDATE clientes SET "xlinkEmpresaXlinkId" = $1 WHERE id = $2`,
        [dto.xlinkId, coincideRnc[0].id],
      );
      return this.clientesService.findOne(coincideRnc[0].id);
    }

    // rfc (no rncReceptor) es el RNC/Cédula real del cliente — rncReceptor es
    // solo para cuando el receptor del e-CF difiere del cliente (ver
    // ClientesService.validarRncReceptor). Usar rncReceptor aquí dejaba rfc
    // NULL y la tabla lo exige NOT NULL: "Campo requerido faltante: rfc" al
    // crear desde el Directorio de HiCloud Xlink (encontrado en producción).
    const registro = await this.clientesService.create({
      nombre: datos?.nombre ?? nombreContraparte,
      rfc: contraparte.rnc ?? undefined,
      xlinkEmpresaXlinkId: dto.xlinkId,
      razonSocial: datos?.razonSocial,
      rncReceptor: datos?.rncReceptor,
      identificadorExtranjero: datos?.identificadorExtranjero,
      regimenFiscal: datos?.regimenFiscal,
      email: datos?.email,
      telefono: datos?.telefono,
      direccion: datos?.direccion,
      ciudad: datos?.ciudad,
      estado: datos?.estado,
      codigoPostal: datos?.codigoPostal,
      sector: datos?.sector,
      diasCredito: datos?.diasCredito,
      limiteCredito: datos?.limiteCredito,
      notas: datos?.notas,
    } as any);
    return datos ? { accion: 'creado' as const, registro } : registro;
  }
}
