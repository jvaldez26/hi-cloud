import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcfRecibido, FuenteImportacion } from './entities/ecf-recibido.entity';
import { TenantService } from '../tenant/tenant.service';

// ── Contrato normalizado — independiente del origen (CSV hoy, API en Fase 2) ─

export interface DocumentoRecibidoNormalizado {
  encf: string;
  rncEmisor?: string;
  nombreEmisor?: string;
  fechaDocumento?: Date;
  tipoEcf?: string;
  total?: number;
  montoGravado?: number;
  itbis?: number;
  montoExento?: number;
  status?: string;
  creadoEnMseller?: Date;
  urlDocumento?: string;
  fuenteImportacion: FuenteImportacion;
  /** Número de fila de origen (CSV). Interno — no se persiste. */
  _filaNum?: number;
  /** Valor crudo de la fecha como vino en el CSV. Interno — no se persiste. */
  _fechaRaw?: string;
}

export interface ImportResultDetalle {
  fila: number;
  encf?: string;
  estado: 'importado' | 'actualizado' | 'error';
  error?: string;
}

export interface ImportResult {
  total: number;
  importados: number;
  actualizados: number;
  errores: number;
  detalles: ImportResultDetalle[];
}

@Injectable()
export class EcfRecibidosService {
  private readonly logger = new Logger(EcfRecibidosService.name);

  constructor(
    @InjectRepository(EcfRecibido)
    private readonly repo: Repository<EcfRecibido>,
    private readonly tenantService: TenantService,
  ) {}

  // ── Parser CSV ─────────────────────────────────────────────────────────────
  // Soporta exportaciones del panel de MSeller (Documentos → Recibidos → Exportar CSV)
  // Columnas: ECF, RNC Emisor, Nombre Emisor, Fecha Documento, Tipo ECF, Total, Creado, Status

  private detectarDelimitador(primeraLinea: string): string {
    const comas      = (primeraLinea.match(/,/g) ?? []).length;
    const puntosComa = (primeraLinea.match(/;/g) ?? []).length;
    return puntosComa > comas ? ';' : ',';
  }

  private parsearLinea(linea: string, delimitador: string): string[] {
    // Soporta campos entrecomillados con comas internas
    const result: string[] = [];
    let campo = '';
    let dentro = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') { dentro = !dentro; continue; }
      if (c === delimitador && !dentro) { result.push(campo.trim()); campo = ''; continue; }
      campo += c;
    }
    result.push(campo.trim());
    return result;
  }

  private parsearFecha(str: string): Date | undefined {
    if (!str?.trim()) return undefined;
    // YYYY-MM-DD
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
      const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00`);
      return isNaN(d.getTime()) ? undefined : d;
    }
    // DD/MM/YYYY
    const dmy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) {
      const d = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T12:00:00`);
      return isNaN(d.getTime()) ? undefined : d;
    }
    // ISO o cualquier otro formato
    const iso = new Date(str);
    return isNaN(iso.getTime()) ? undefined : iso;
  }

  private csvANormalizado(buffer: Buffer): DocumentoRecibidoNormalizado[] {
    const texto = buffer.toString('utf-8').replace(/^﻿/, ''); // quitar BOM UTF-8
    const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .filter(l => l.trim().length > 0)
      .filter(l => !l.toLowerCase().startsWith('sep=')); // directiva Excel sep=

    if (lineas.length < 2) {
      throw new BadRequestException('El CSV debe tener encabezado y al menos una fila de datos');
    }

    const delim   = this.detectarDelimitador(lineas[0]);
    const headers = this.parsearLinea(lineas[0], delim)
      .map(h => h.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''));

    const idx = (name: string): number => headers.indexOf(name);
    // MSeller CSV usa "encf"; versiones antiguas usaban "ecf" — probar ambos
    const iEcf    = idx('encf') !== -1 ? idx('encf') : idx('ecf');
    const iRnc    = idx('rncemisor');
    const iNombre = idx('nombreemisor');
    const iFecha  = idx('fechadocumento');
    const iTipo   = idx('tipoecf');
    const iTotal  = idx('total');
    const iCreado = idx('creado');
    const iStatus = idx('status');
    // totalimpuestos → itbis (columna real de MSeller)
    const iTotalImpuestos = idx('totalimpuestos');
    const iUrlDoc = idx('urldocumento');

    if (iEcf === -1) {
      throw new BadRequestException(
        'Columna "ENCF" o "ECF" no encontrada. Columnas detectadas: ' + headers.join(', '),
      );
    }

    return lineas.slice(1).map((linea, i): DocumentoRecibidoNormalizado => {
      const fila = this.parsearLinea(linea, delim);
      const get  = (ii: number) => (ii >= 0 ? fila[ii]?.trim() ?? '' : '');
      const rncRaw = get(iRnc).replace(/\D/g, '');
      const itbisRaw = iTotalImpuestos >= 0 ? get(iTotalImpuestos) : '';

      const fechaRaw = get(iFecha);
      return {
        encf:            get(iEcf),
        rncEmisor:       rncRaw || undefined,
        nombreEmisor:    get(iNombre) || undefined,
        fechaDocumento:  this.parsearFecha(fechaRaw),
        tipoEcf:         get(iTipo).replace(/\D/g, '') || undefined,
        total:           parseFloat(Number(get(iTotal).replace(/,/g, '') || 0).toFixed(2)),
        itbis:           itbisRaw ? parseFloat(Number(itbisRaw.replace(/,/g, '')).toFixed(2)) : undefined,
        status:          get(iStatus).toLowerCase() || 'received',
        creadoEnMseller: this.parsearFecha(get(iCreado)),
        urlDocumento:    get(iUrlDoc) || undefined,
        fuenteImportacion: FuenteImportacion.CSV,
        _filaNum:  i + 2, // línea real en el archivo (1-based, +1 por el header)
        _fechaRaw: fechaRaw,
      };
    });
  }

  // ── importarDocumentos — único método de escritura, sirve para CSV y Fase 2 API ─

  async importarDocumentos(docs: DocumentoRecibidoNormalizado[]): Promise<ImportResult> {
    const empresaId = this.tenantService.getEmpresaId();
    const result: ImportResult = { total: 0, importados: 0, actualizados: 0, errores: 0, detalles: [] };

    for (const doc of docs) {
      result.total++;
      const filaNum = doc._filaNum ?? result.total;

      // Validación: e-NCF obligatorio y formato mínimo (E + dígitos, ≥5 chars)
      if (!doc.encf || doc.encf.length < 5 || !/^[A-Za-z]\d+/.test(doc.encf)) {
        result.errores++;
        result.detalles.push({ fila: filaNum, encf: doc.encf, estado: 'error', error: 'e-NCF vacío o con formato inválido' });
        continue;
      }

      // Validación: fecha — si la celda tiene algo pero no se pudo interpretar, rechazar la fila.
      // Guardar NULL silenciosamente impide asignar el comprobante a un período fiscal.
      // Formatos aceptados: DD/MM/YYYY o YYYY-MM-DD.
      if (!doc.fechaDocumento && doc._fechaRaw?.trim()) {
        result.errores++;
        result.detalles.push({
          fila: filaNum,
          encf: doc.encf,
          estado: 'error',
          error: `Fecha "${doc._fechaRaw}" (fila ${filaNum}) no reconocida — use DD/MM/YYYY o YYYY-MM-DD`,
        });
        continue;
      }

      // Validación: RNC emisor si está presente debe ser 9 dígitos (empresas RD)
      if (doc.rncEmisor && doc.rncEmisor.length !== 9) {
        result.errores++;
        result.detalles.push({
          fila: filaNum,
          encf: doc.encf,
          estado: 'error',
          error: `RNC emisor "${doc.rncEmisor}" debe tener 9 dígitos (RNC empresa) — corregir en la fuente`,
        });
        continue;
      }

      try {
        const existe = await this.repo.findOne({ where: { empresaId, encf: doc.encf } });

        if (existe) {
          await this.repo.update(existe.id, {
            rncEmisor:       doc.rncEmisor      ?? existe.rncEmisor,
            nombreEmisor:    doc.nombreEmisor   ?? existe.nombreEmisor,
            fechaDocumento:  doc.fechaDocumento ?? existe.fechaDocumento,
            tipoEcf:         doc.tipoEcf        ?? existe.tipoEcf,
            total:           doc.total          ?? existe.total,
            montoGravado:    doc.montoGravado   ?? existe.montoGravado,
            itbis:           doc.itbis          ?? existe.itbis,
            montoExento:     doc.montoExento    ?? existe.montoExento,
            status:          doc.status         ?? existe.status,
            creadoEnMseller: doc.creadoEnMseller ?? existe.creadoEnMseller,
            urlDocumento:    doc.urlDocumento   ?? existe.urlDocumento,
          });
          result.actualizados++;
          result.detalles.push({ fila: filaNum, encf: doc.encf, estado: 'actualizado' });
        } else {
          const { _filaNum, _fechaRaw, ...campos } = doc as any;
          await this.repo.save(
            this.repo.create({ empresaId, ...campos }),
          );
          result.importados++;
          result.detalles.push({ fila: filaNum, encf: doc.encf, estado: 'importado' });
        }
      } catch (err) {
        this.logger.error(`[EcfRecibidos] Error importando ${doc.encf}: ${(err as Error).message}`);
        result.errores++;
        result.detalles.push({ fila: filaNum, encf: doc.encf, estado: 'error', error: (err as Error).message });
      }
    }

    this.logger.log(
      `[EcfRecibidos] empresa=${empresaId}: ${result.importados} importados, ` +
      `${result.actualizados} actualizados, ${result.errores} errores`,
    );
    return result;
  }

  // ── Importar desde CSV (Fase 1) ────────────────────────────────────────────

  async importarCsv(buffer: Buffer): Promise<ImportResult> {
    const docs = this.csvANormalizado(buffer);
    return this.importarDocumentos(docs);
  }

  // TODO (Fase 2): Sincronización automática con API de MSeller
  // Consultar endpoint pendiente de confirmar con soporte MSeller.
  // El cron convertirá la respuesta al array DocumentoRecibidoNormalizado[]
  // y llamará a importarDocumentos() — misma lógica de guardado/deduplicación.
  //
  // async sincronizarDesdeMseller(): Promise<ImportResult> {
  //   const msellerDocs = await this.msellerClient.getDocumentosRecibidos(...);
  //   const docs = msellerDocs.map(d => ({ encf: d.encf, ..., fuenteImportacion: FuenteImportacion.API }));
  //   return this.importarDocumentos(docs);
  // }

  // ── Listado con paginación y filtros ───────────────────────────────────────

  async listar(opts: {
    page?: number;
    limit?: number;
    desde?: string;
    hasta?: string;
    rncEmisor?: string;
    tipoEcf?: string;
    status?: string;
    /** exportar=true: devuelve todos sin paginación (para Excel) */
    exportar?: boolean;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const exportar  = opts.exportar === true;
    const page  = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 20));

    const qb = this.repo.createQueryBuilder('er')
      .where('er."empresaId" = :empresaId', { empresaId })
      .orderBy('er."fechaDocumento"', 'DESC', 'NULLS LAST')
      .addOrderBy('er.id', 'DESC');

    // En modo exportar se omite la paginación para traer todos los registros del filtro
    if (!exportar) {
      qb.skip((page - 1) * limit).take(limit);
    }

    if (opts.desde)     qb.andWhere('er."fechaDocumento" >= :desde', { desde: opts.desde });
    if (opts.hasta)     qb.andWhere('er."fechaDocumento" <= :hasta', { hasta: opts.hasta });
    if (opts.rncEmisor) qb.andWhere('er."rncEmisor" ILIKE :rnc',    { rnc: `%${opts.rncEmisor}%` });
    if (opts.tipoEcf)   qb.andWhere('er."tipoEcf" = :tipo',         { tipo: opts.tipoEcf });
    if (opts.status)    qb.andWhere('er.status = :status',           { status: opts.status });

    if (exportar) {
      const data = await qb.getMany();
      return { data, total: data.length, page: 1, limit: data.length, pages: 1 };
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
