import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { fechaTextoRD } from '../common/utils/fecha-local.util';

const PDFDocument = require('pdfkit') as typeof import('pdfkit');
const bwipjs      = require('bwip-js') as typeof import('bwip-js');

// ── Tipos internos ────────────────────────────────────────────────────────────

interface LineaConUbicacion {
  id: number;
  orden: number;
  productoCodigo: string | null;
  productoNombre: string | null;
  unidadMedida:   string | null;
  cantidadSistema: string;
  estadoLinea: string;
  tieneLotes: boolean;
  tieneSeriales: boolean;
  ubicacionId: number | null;
  pasillo:  string | null;
  estante:  string | null;
  nivel:    string | null;
  posicion: string | null;
}

interface ConteoParaPDF {
  id: number;
  codigo: string;
  nombre: string;
  modalidad: 'ciego' | 'informado';
  estado: string;
  almacen: string;
  fechaGeneracion: Date;
  lineas: LineaConUbicacion[];
}

interface GrupoUbi { label: string; lineas: LineaConUbicacion[] }

// ── Constantes de maquetado ───────────────────────────────────────────────────

const A4H = 842;
const M   = 30;
const CW  = 535;  // 595 - 30*2

const COL_N    = 28;
const COL_COD  = 70;
const COL_UND  = 30;
const COL_UBI  = 90;
const COL_SIS  = 52;
const COL_CANT = 65;

const ROW_H        = 17;
const HEADER_H     = 148;
const TBL_HEADER_H = 18;
const GRAY_LIGHT   = '#f0f0f0';
const GRAY_MED     = '#666666';
const GRAY_DARK    = '#222222';
const BLUE_INV     = '#003566';

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ConteoPdfService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantSvc:  TenantService,
  ) {}

  async generarHojaPDF(conteoId: number): Promise<Buffer> {
    const datos = await this.cargarDatos(conteoId, false);
    return this.renderPDF(datos, false);
  }

  async generarHojaRecuentoPDF(conteoId: number): Promise<Buffer> {
    const datos = await this.cargarDatos(conteoId, true);
    if (datos.lineas.length === 0) {
      throw new NotFoundException('No hay líneas en recuento en este conteo');
    }
    return this.renderPDF(datos, true);
  }

  // ── Cargar datos con ubicación ─────────────────────────────────────────────

  private async cargarDatos(conteoId: number, soloRecuento: boolean): Promise<ConteoParaPDF> {
    const empresaId = this.tenantSvc.getEmpresaId();

    const [conteoRow] = await this.dataSource.query<any[]>(
      `SELECT c.*, a.nombre AS almacen_nombre
       FROM conteos_inventario c
       LEFT JOIN almacenes a ON a.id = c."almacenId"
       WHERE c.id = $1 AND c."empresaId" = $2`,
      [conteoId, empresaId],
    );
    if (!conteoRow) throw new NotFoundException(`Conteo #${conteoId} no encontrado`);

    const estadoFilter = soloRecuento ? `AND l."estadoLinea" = 'en_recuento'` : '';

    const lineas = await this.dataSource.query<LineaConUbicacion[]>(
      `SELECT
         l.id, l.orden, l."productoCodigo", l."productoNombre", l."unidadMedida",
         l."cantidadSistema", l."estadoLinea", l."tieneLotes", l."tieneSeriales",
         l."ubicacionId",
         u.pasillo, u.estante, u.nivel, u.posicion
       FROM lineas_conteo l
       LEFT JOIN wms_ubicaciones u ON u.id = l."ubicacionId"
       WHERE l."conteoId" = $1 AND l."empresaId" = $2 AND l."isActive" = true
         ${estadoFilter}
       ORDER BY l.orden`,
      [conteoId, empresaId],
    );

    return {
      id:              conteoRow.id,
      codigo:          conteoRow.codigo,
      nombre:          conteoRow.nombre,
      modalidad:       conteoRow.modalidad,
      estado:          conteoRow.estado,
      almacen:         conteoRow.almacen_nombre ?? `Almacén #${conteoRow.almacenId}`,
      fechaGeneracion: new Date(conteoRow.fechaGeneracion),
      lineas,
    };
  }

  // ── Construcción del PDF ──────────────────────────────────────────────────

  private async renderPDF(datos: ConteoParaPDF, esRecuento: boolean): Promise<Buffer> {
    const barcodeBuf: Buffer = await bwipjs.toBuffer({
      bcid:          'code128',
      text:          datos.codigo,
      scale:         2,
      height:        9,
      includetext:   false,
      paddingwidth:  4,
      paddingheight: 2,
    });

    const informado = datos.modalidad === 'informado';
    const colDesc   = informado
      ? CW - COL_N - COL_COD - COL_UND - COL_UBI - COL_SIS - COL_CANT
      : CW - COL_N - COL_COD - COL_UND - COL_UBI - COL_CANT;

    const doc = new PDFDocument({
      size:        'A4',
      margins:     { top: M, bottom: M, left: M, right: M },
      bufferPages: true,
      compress:    true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    // Promesa registrada ANTES de doc.end() para garantizar que captura el evento 'end'
    const result = new Promise<Buffer>((resolve, reject) => {
      doc.on('error', reject);
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
    });

    // ── Dibujar páginas ──────────────────────────────────────────────────────
    const grupos      = this.agruparPorUbicacion(datos.lineas);
    const bodyH       = A4H - M * 2 - HEADER_H - TBL_HEADER_H;
    const rowsPerPage = Math.floor(bodyH / ROW_H);

    let yPos         = M;
    let primeraLinea = true;
    let pageItemIdx  = 0;

    const nuevaPagina = () => {
      doc.addPage();
      this.drawHeader(doc, datos, barcodeBuf, esRecuento);
      this.drawTableHeader(doc, informado, colDesc);
      yPos        = M + HEADER_H + TBL_HEADER_H;
      pageItemIdx = 0;
    };

    for (const grupo of grupos) {
      if (primeraLinea) {
        this.drawHeader(doc, datos, barcodeBuf, esRecuento);
        this.drawTableHeader(doc, informado, colDesc);
        yPos         = M + HEADER_H + TBL_HEADER_H;
        primeraLinea = false;
      } else if (yPos + ROW_H * 2 > A4H - M) {
        nuevaPagina();
      }

      // Separador de ubicación
      if (yPos + ROW_H > A4H - M) nuevaPagina();
      this.drawSeparador(doc, grupo.label, yPos, CW);
      yPos += ROW_H;
      pageItemIdx++;

      // Filas de la ubicación
      for (const linea of grupo.lineas) {
        if (yPos + ROW_H > A4H - M) nuevaPagina();
        this.drawRow(doc, linea, yPos, informado, colDesc, pageItemIdx % 2 === 0);
        yPos       += ROW_H;
        pageItemIdx++;
      }
    }

    // ── Post-procesar: número de páginas ─────────────────────────────────────
    const range      = doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).fillColor(GRAY_MED)
         .text(`Pagina ${i + 1} de ${totalPages}`, M, A4H - M - 8, { width: CW, align: 'right', lineBreak: false });
    }

    doc.flushPages();
    doc.end();

    return result;
  }

  // ── Encabezado por página ─────────────────────────────────────────────────

  private drawHeader(
    doc: PDFKit.PDFDocument,
    datos: ConteoParaPDF,
    barcodeBuf: Buffer,
    esRecuento: boolean,
  ) {
    const y = M;

    doc.rect(M, y, CW, 28).fill(BLUE_INV);
    const titulo = esRecuento ? 'HOJA DE RECUENTO' : 'HOJA DE CONTEO FISICO';
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
       .text(titulo, M + 8, y + 8, { width: CW - 16, lineBreak: false });

    doc.fillColor(GRAY_DARK).fontSize(20).font('Helvetica-Bold')
       .text(datos.codigo, M, y + 36, { width: 200 });
    doc.image(barcodeBuf, M, y + 62, { height: 32 });

    const col2  = M + 220;
    const col2w = CW - 220;
    doc.fontSize(8).font('Helvetica').fillColor(GRAY_MED);

    // Etiqueta + valor con x,y explícitos y lineBreak:false para evitar que valores
    // largos rompan en múltiples líneas y desplacen los campos siguientes.
    const campos: [string, string][] = [
      ['Nombre:',    datos.nombre],
      ['Almacen:',   datos.almacen],
      ['Fecha:',     fechaTextoRD(datos.fechaGeneracion)],
      ['Modalidad:', datos.modalidad === 'ciego' ? 'Ciega' : 'Informada'],
      ['Estado:',    datos.estado.replace(/_/g, ' ')],
    ];

    const LABEL_W = 52;
    const VALUE_X = col2 + LABEL_W + 2;
    const VALUE_W = M + CW - VALUE_X - 2;

    let cy = y + 36;
    for (const [label, valor] of campos) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY_MED)
         .text(label, col2, cy, { width: LABEL_W, lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(GRAY_DARK)
         .text(valor, VALUE_X, cy, { width: VALUE_W, lineBreak: false, ellipsis: true });
      cy += 11;
    }

    const firmY = y + 112;
    doc.fillColor(GRAY_DARK).fontSize(7.5).font('Helvetica')
       .text('Responsable:', M, firmY, { lineBreak: false })
       .text('_________________________________', M + 58, firmY, { lineBreak: false })
       .text('Firma:', M + 280, firmY, { lineBreak: false })
       .text('_____________________', M + 310, firmY, { lineBreak: false });

    doc.moveTo(M, y + HEADER_H - 1).lineTo(M + CW, y + HEADER_H - 1)
       .strokeColor('#cccccc').lineWidth(0.5).stroke();
  }

  // ── Encabezado de tabla ────────────────────────────────────────────────────

  private drawTableHeader(
    doc: PDFKit.PDFDocument,
    informado: boolean,
    colDesc: number,
  ) {
    const y = M + HEADER_H;
    doc.rect(M, y, CW, TBL_HEADER_H).fill(BLUE_INV);

    let x = M;
    const th = (texto: string, ancho: number, align: 'left' | 'center' | 'right' = 'center') => {
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
         .text(texto, x + 3, y + 5, { width: ancho - 6, align, lineBreak: false });
      x += ancho;
    };

    th('#',               COL_N,   'center');
    th('CÓDIGO',          COL_COD, 'left');
    th('DESCRIPCIÓN',     colDesc, 'left');
    th('UND',             COL_UND, 'center');
    th('UBICACIÓN',       COL_UBI, 'left');
    if (informado) th('SISTEMA', COL_SIS, 'center');
    th('CANTIDAD CONTADA', COL_CANT, 'center');
  }

  // ── Fila de datos ──────────────────────────────────────────────────────────

  private drawRow(
    doc: PDFKit.PDFDocument,
    linea: LineaConUbicacion,
    y: number,
    informado: boolean,
    colDesc: number,
    even: boolean,
  ) {
    if (even) doc.rect(M, y, CW, ROW_H).fill(GRAY_LIGHT);

    const textY = y + (ROW_H - 8) / 2;
    let x = M;

    const cell = (texto: string, ancho: number, align: 'left' | 'center' | 'right' = 'left', bold = false) => {
      doc.fillColor(GRAY_DARK).fontSize(7.5)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(texto, x + 3, textY, { width: ancho - 6, align, lineBreak: false, ellipsis: true });
      x += ancho;
    };

    cell(String(linea.orden), COL_N, 'center');
    cell(linea.productoCodigo ?? '—', COL_COD);

    const badges = [
      linea.tieneLotes    ? 'L' : '',
      linea.tieneSeriales ? 'S' : '',
    ].filter(Boolean);
    cell((linea.productoNombre ?? '') + (badges.length ? ` [${badges.join(',')}]` : ''), colDesc, 'left', badges.length > 0);

    cell(linea.unidadMedida ?? '', COL_UND, 'center');
    cell(this.ubiLabel(linea), COL_UBI);
    if (informado) cell(Number(linea.cantidadSistema).toFixed(2), COL_SIS, 'right');

    // Casilla vacía para escribir a mano
    doc.rect(x + 3, y + 2, COL_CANT - 6, ROW_H - 4).strokeColor('#999999').lineWidth(0.5).stroke();

    doc.moveTo(M, y + ROW_H - 0.5).lineTo(M + CW, y + ROW_H - 0.5)
       .strokeColor('#dddddd').lineWidth(0.3).stroke();
  }

  // ── Separador de ubicación ─────────────────────────────────────────────────

  private drawSeparador(doc: PDFKit.PDFDocument, label: string, y: number, cw: number) {
    doc.rect(M, y, cw, ROW_H - 1).fill('#dbe9f4');
    // Usar ">>" en lugar de "■": Helvetica solo soporta WinAnsiEncoding, ■ (U+25A0) no está incluido
    doc.fillColor(BLUE_INV).fontSize(7.5).font('Helvetica-Bold')
       .text(`>> ${label.toUpperCase()}`, M + 6, y + (ROW_H - 8) / 2, { width: cw - 12, lineBreak: false });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private ubiLabel(l: LineaConUbicacion): string {
    if (!l.ubicacionId) return '—';
    return [l.pasillo, l.estante, l.nivel, l.posicion].filter(Boolean).join('-');
  }

  private agruparPorUbicacion(lineas: LineaConUbicacion[]): GrupoUbi[] {
    const grupos = new Map<string, GrupoUbi>();

    for (const l of lineas) {
      const key = l.ubicacionId ? String(l.ubicacionId) : '__sin__';

      let label: string;
      if (l.ubicacionId) {
        const partes: string[] = [];
        if (l.pasillo)  partes.push(`Pasillo ${l.pasillo}`);
        if (l.estante)  partes.push(`Estante ${l.estante}`);
        if (l.nivel)    partes.push(`Nivel ${l.nivel}`);
        if (l.posicion) partes.push(`Pos. ${l.posicion}`);
        label = partes.length ? partes.join(' / ') : `Ubicación ${l.ubicacionId}`;
      } else {
        label = 'Sin Ubicación';
      }

      if (!grupos.has(key)) grupos.set(key, { label, lineas: [] });
      grupos.get(key)!.lineas.push(l);
    }

    // Sin ubicación siempre al final
    const sinUbi = grupos.get('__sin__');
    if (sinUbi) { grupos.delete('__sin__'); grupos.set('__sin__', sinUbi); }

    return [...grupos.values()];
  }
}
