import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bwipjs = require('bwip-js') as typeof import('bwip-js');
import { Conduce } from './entities/conduce.entity';
import { TenantService } from '../tenant/tenant.service';

const ESTADO_LABEL: Record<string, string> = {
  generado:    'Generado',
  en_transito: 'En Tránsito',
  entregado:   'Entregado',
  devuelto:    'Devuelto',
};

const ESTADO_HEX: Record<string, string> = {
  generado:    '#d97706',
  en_transito: '#2563eb',
  entregado:   '#16a34a',
  devuelto:    '#dc2626',
};

const TZ = 'America/Santo_Domingo';

function fmtFecha(d: any): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
}

function fmtFechaHora(d: any): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString('es-DO', { timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtAhora(): string {
  return new Date().toLocaleString('es-DO', { timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true });
}

@Injectable()
export class ConducePDFService {
  constructor(
    @InjectRepository(Conduce) private repo: Repository<Conduce>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cond = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!cond) throw new NotFoundException(`Conduce #${id} no encontrado`);

    const empresaRows: any[] = await this.repo.manager.query(
      'SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    );
    const empresa = empresaRows[0] ?? {};
    const nombreEmpresa: string = empresa.nombreComercial || empresa.nombre || 'Mi Empresa';
    const estadoLabel = ESTADO_LABEL[cond.estado] ?? cond.estado;
    const estadoHex   = ESTADO_HEX[cond.estado]   ?? '#2563eb';

    const sucursalNombre: string | undefined = (cond as any).sucursalId
      ? await this.repo.manager.query(
          'SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1',
          [(cond as any).sucursalId],
        ).then((r: any[]) => r[0]?.nombre ?? undefined)
      : undefined;

    const facturaFolio: string | undefined = cond.facturaId
      ? await this.repo.manager.query(
          'SELECT folio FROM facturas WHERE id = $1 LIMIT 1',
          [cond.facturaId],
        ).then((r: any[]) => r[0]?.folio ?? undefined)
      : undefined;

    // Quién registró la devolución. Solo se consulta si el conduce está devuelto.
    const devueltoPorNombre: string | undefined = cond.devueltoPorUsuarioId
      ? await this.repo.manager.query(
          'SELECT nombre FROM users WHERE id = $1 LIMIT 1',
          [cond.devueltoPorUsuarioId],
        ).then((r: any[]) => r[0]?.nombre ?? undefined)
      : undefined;

    const detalles: any[] = (cond as any).detalles ?? [];
    const cli = (cond as any).cliente ?? {};

    // ── Código de barras Code128 del número del conduce ─────────────────────
    // El valor va tal cual, sin prefijos ni ceros de relleno: escanearlo tiene
    // que caer en la misma rama exacta del buscador del reporte de entrega que
    // teclearlo a mano. includetext va en false porque el número se dibuja
    // debajo con la fuente del PDF, que se lee mejor que la de la librería.
    let barcodeBuf: Buffer | null = null;
    try {
      barcodeBuf = await bwipjs.toBuffer({
        bcid:          'code128',
        text:          cond.numero,
        scale:         3,
        height:        9,
        includetext:   false,
        // Zona muda de 10 módulos a cada lado: es lo que pide Code128 y sin ella
        // hay escáneres que no enganchan el arranque.
        paddingwidth:  10,
        paddingheight: 2,
        // Fondo blanco explícito. bwip-js genera el PNG con fondo TRANSPARENTE, y
        // aunque sobre la hoja se vea igual, un lector que no componga el alpha
        // sobre blanco no lo decodifica: comprobado con zxing, no lee el PNG
        // transparente y sí el opaco.
        backgroundcolor: 'FFFFFF',
      });
    } catch (e: any) {
      // Un conduce sin barcode se sigue imprimiendo; sin conduce, no.
      barcodeBuf = null;
    }

    // ── Pre-calcular altura de sección cliente para derivar espacio disponible ──
    // Columna izq: label(14) + nombre(14) + campos opcionales
    let leftH = 28;
    if (cli.rncReceptor) leftH += 12;
    if (cli.direccion)   leftH += 12;
    if (cli.telefono)    leftH += 12;
    if (cli.email)       leftH += 12;

    // Columna der: label(14) + infoRows * 24
    const infoRowsArr: [string, string][] = [
      ['Dirección', cond.direccionEntrega + (cond.ciudad ? ', ' + cond.ciudad : '')],
    ];
    if (cond.fechaEntregaProgramada) infoRowsArr.push(['Entrega programada', fmtFecha(cond.fechaEntregaProgramada)]);
    if (cond.contactoEntrega)        infoRowsArr.push(['Contacto', cond.contactoEntrega + (cond.telefonoContacto ? '  ' + cond.telefonoContacto : '')]);
    // El chofer va SIEMPRE, tenga valor o no: los conduces emitidos antes de que
    // el campo fuera obligatorio salen con la raya para escribirlo a mano, nunca
    // en blanco ni con 'undefined'.
    infoRowsArr.push(['Chofer', (cond.conductor ?? '').trim() || '__________________________']);
    if (cond.vehiculo)               infoRowsArr.push(['Vehículo',  cond.vehiculo]);
    if (sucursalNombre)              infoRowsArr.push(['Sucursal',  sucursalNombre]);
    const rightH = 14 + infoRowsArr.length * 24;

    const clientSectionH = Math.max(leftH, rightH);

    // ── Medidas del pie y del bloque de recepción ───────────────────────────
    //
    // Antes se comprimía la altura de fila para que todo cupiera en una hoja, con
    // un mínimo de 14pt que no se respetaba a sí mismo: pasados los veinte ítems
    // la tabla se salía igual y cada text() fuera de la hoja abría una página
    // nueva a medio dibujar. Ahora la fila mide siempre lo mismo y es la tabla la
    // que pasa de página cuando toca, con su cabecera repetida.
    const FOOTER_H   = 38;
    // Bloque de recepción: separador + título + tres renglones con aire para
    // escribir a mano. Esto se firma de pie en la puerta de un negocio, así que
    // el espacio entre rayas es el que hace falta para escribir, no el que sobra.
    const SIG_TITULO = 12 + 18;      // separador + título RECIBIDO CONFORME
    const SIG_FILA   = 46;           // alto de cada renglón (raya + etiqueta + aire)
    const SIG_SPACE  = SIG_TITULO + SIG_FILA * 3;
    const rowH       = 18;
    const rowFs      = 8;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      // Márgenes verticales a cero a propósito: TODO en esta plantilla se dibuja
      // con coordenadas absolutas, y el pie va en page.height - 38, por debajo del
      // margen inferior de 50. pdfkit reacciona a eso abriendo una página nueva
      // por cada text() que cae ahí, así que el conduce salía en tres hojas: la
      // buena y dos con solo el pie. Con el margen vertical en cero, la única
      // página es la que se dibuja.
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 0, bottom: 0, left: 50, right: 50 },
        compress: true,
        bufferPages: true,   // el pie se pinta al final, cuando se sabe cuántas hay
      });
      const chunks: Buffer[] = [];
      doc.on('data',  c  => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W   = doc.page.width  - 100; // ancho útil
      const PL  = 50;                    // margen izquierdo
      const PR  = doc.page.width - 50;  // margen derecho
      const brandBlue = '#1e40af';

      // ── Franja de cabecera ──────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 78).fill(brandBlue);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
        .text(nombreEmpresa, PL, 18, { width: W * 0.65 });
      doc.font('Helvetica').fontSize(9)
        .text(`RNC: ${empresa.rnc || '—'}  ·  Tel: ${empresa.telefono || '—'}`, PL, 40)
        .text(empresa.direccion || '', PL, 52);

      // Badge de estado (esquina superior derecha)
      const badgeX = PR - 120;
      doc.roundedRect(badgeX, 20, 115, 26, 5).fill(estadoHex);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
        .text(estadoLabel.toUpperCase(), badgeX, 27, { width: 115, align: 'center' });

      // ── Título CONDUCE ──────────────────────────────────────────────────────
      let y = 98;
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(20)
        .text('CONDUCE / NOTA DE ENTREGA', PL, y);
      const refLine = facturaFolio
        ? `N°: ${cond.numero}   ·   Fecha: ${fmtFecha(cond.fecha)}   ·   Ref. Factura: ${facturaFolio}`
        : `N°: ${cond.numero}   ·   Fecha: ${fmtFecha(cond.fecha)}`;
      doc.fillColor('#374151').font('Helvetica').fontSize(10)
        .text(refLine, PL, y + 26, { width: W - 180 });

      // Código de barras arriba a la derecha, donde se ve sin desdoblar la hoja.
      if (barcodeBuf) {
        const bcW = 165;
        const bcX = PR - bcW;
        doc.image(barcodeBuf, bcX, y - 8, { width: bcW, height: 34 });
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
          .text(cond.numero, bcX, y + 28, { width: bcW, align: 'center' });
      }
      y += 52;

      // ── Línea separadora ────────────────────────────────────────────────────
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
      y += 10;

      // ── Dos columnas: destinatario / detalles entrega ───────────────────────
      const colW  = W / 2 - 10;
      const colR  = PL + colW + 20;
      const yTop  = y;
      let   yL    = y;
      let   yr    = y;

      // Columna izquierda — DESTINATARIO
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('DESTINATARIO / CLIENTE', PL, yL);
      yL += 14;
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
        .text(cli.nombre || 'Sin cliente', PL, yL, { width: colW });
      yL += 14;
      if (cli.rncReceptor) { doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`RNC: ${cli.rncReceptor}`, PL, yL); yL += 12; }
      if (cli.direccion)   { doc.font('Helvetica').fontSize(9).fillColor('#374151').text(cli.direccion, PL, yL, { width: colW }); yL += 12; }
      if (cli.telefono)    { doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`Tel: ${cli.telefono}`, PL, yL); yL += 12; }
      if (cli.email)       { doc.font('Helvetica').fontSize(9).fillColor('#374151').text(cli.email, PL, yL); yL += 12; }

      // Columna derecha — DETALLES DE ENTREGA
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('DETALLES DE ENTREGA', colR, yr);
      yr += 14;
      for (const [label, val] of infoRowsArr) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
          .text(label.toUpperCase(), colR, yr, { width: colW });
        doc.font('Helvetica').fontSize(9).fillColor('#111827')
          .text(val, colR, yr + 9, { width: colW });
        yr += 24;
      }

      // Avanzar y al mayor de las dos columnas + margen
      y = Math.max(yL, yr) + 13;

      // ── Separador ──────────────────────────────────────────────────────────
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
      y += 12;

      // ── Tabla de ítems ─────────────────────────────────────────────────────
      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('ARTÍCULOS / MERCANCÍA', PL, y);
      y += 16;

      // Cabecera de tabla
      const colWidths = [28, W - 28 - 54 - 46 - 90, 54, 46, 90]; // #, Desc, Cant, U.M., Obs
      const headers   = ['#', 'Descripción', 'Cantidad', 'U.M.', 'Obs / Dev.'];
      const aligns    = ['center', 'left', 'right', 'center', 'left'] as const;

      // Fondo útil: por debajo de aquí empieza el pie.
      const LIMITE  = doc.page.height - FOOTER_H - 10;
      const TOP_CONT = 62;   // y inicial de las páginas de continuación

      const cabeceraTabla = () => {
        doc.rect(PL, y, W, 18).fill('#1e3a8a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
        let hx = PL;
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], hx + 3, y + 4, { width: colWidths[i] - 6, align: aligns[i] });
          hx += colWidths[i];
        }
        y += 18;
      };

      // Página de continuación: franja fina que identifica la hoja suelta —
      // quién emite, qué conduce y para quién es. Sin eso, la segunda hoja de un
      // conduce de treinta líneas no se sabe de dónde salió.
      const paginaContinuacion = () => {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, 44).fill(brandBlue);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
          .text(nombreEmpresa, PL, 12, { width: W * 0.6 });
        doc.font('Helvetica').fontSize(8)
          .text(`CONDUCE ${cond.numero}  ·  ${cli.nombre ?? ''}`, PL, 27, { width: W * 0.6 });
        doc.font('Helvetica-Bold').fontSize(9)
          .text('(continuación)', PR - 120, 20, { width: 120, align: 'right' });
        y = TOP_CONT;
      };

      cabeceraTabla();

      if (detalles.length === 0) {
        doc.rect(PL, y, W, rowH + 2).fill('#f9fafb').stroke();
        doc.fillColor('#9ca3af').font('Helvetica').fontSize(9)
          .text('Sin ítems registrados', PL, y + 4, { width: W, align: 'center' });
        y += rowH + 2;
      } else {
        detalles.forEach((d: any, idx: number) => {
          if (y + rowH > LIMITE) { paginaContinuacion(); cabeceraTabla(); }
          const bg   = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
          doc.rect(PL, y, W, rowH).fill(bg).stroke('#e5e7eb');

          const nota = Number(d.cantidadDevuelta ?? 0) > 0
            ? `Dev: ${Number(d.cantidadDevuelta)}`
            : (d.observaciones ?? '');

          const rowData = [
            String(idx + 1),
            d.descripcion ?? '',
            Number(d.cantidad).toLocaleString('es-DO', { maximumFractionDigits: 2 }),
            d.unidadMedida ?? 'PZA',
            nota,
          ];

          let cx = PL;
          const vOff = Math.max(3, Math.floor((rowH - rowFs) / 2));
          for (let i = 0; i < rowData.length; i++) {
            doc.fillColor('#111827').font('Helvetica').fontSize(rowFs)
              .text(rowData[i], cx + 3, y + vOff, {
                width: colWidths[i] - 6,
                align: aligns[i],
                ellipsis: true,
              });
            cx += colWidths[i];
          }
          y += rowH;
        });
      }

      y += 14;

      // ── Notas ──────────────────────────────────────────────────────────────
      if (cond.notas) {
        doc.rect(PL, y, W, 1).fill('#e5e7eb');
        y += 6;
        doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9).text('NOTAS', PL, y);
        y += 12;
        doc.fillColor('#374151').font('Helvetica').fontSize(9)
          .text(cond.notas, PL, y, { width: W });
        y += doc.heightOfString(cond.notas, { width: W }) + 8;
      }

      // ── Devolución — solo si el conduce está devuelto ──────────────────────
      //
      // En rojo y con marco: quien recoge este papel tiene que ver de un
      // vistazo que la mercancía volvió y por qué, sin buscarlo en un pie.
      if (cond.estado === 'devuelto') {
        const motivo   = (cond.motivoDevolucion ?? '').trim() || 'No registrado';
        const quien    = devueltoPorNombre ?? '—';
        const cuando   = cond.fechaDevolucion ? fmtFechaHora(cond.fechaDevolucion) : '—';
        const motivoH  = doc.heightOfString(motivo, { width: W - 24 });
        const cajaH    = 20 + motivoH + 6 + 12 + 10;

        if (y + cajaH > LIMITE) paginaContinuacion();
        doc.roundedRect(PL, y, W, cajaH, 4).fillAndStroke('#fef2f2', '#dc2626');
        doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(9)
          .text('DEVOLUCIÓN', PL + 12, y + 7);
        doc.fillColor('#111827').font('Helvetica').fontSize(9)
          .text(motivo, PL + 12, y + 20, { width: W - 24 });
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
          .text(`Registrada por ${quien}  ·  ${cuando}`, PL + 12, y + 20 + motivoH + 6, { width: W - 24 });
        y += cajaH + 10;
      }

      // ── Bloque de recepción — siempre en la última página ───────────────────
      //
      // Antes eran tres rayas cortas de 60pt en fila (preparado / entregado /
      // recibido) donde no cabía una firma. Esto se firma de pie, apoyado en un
      // mostrador: cada dato tiene su renglón, del ancho de la hoja, y con aire
      // suficiente para escribir a mano.
      const sigTop = doc.page.height - FOOTER_H - SIG_SPACE - 10;
      // Si lo que queda de hoja no da para firmar, el bloque se lleva entero a la
      // siguiente: media firma partida entre dos hojas no vale para nada.
      if (y + 10 + SIG_SPACE > LIMITE) paginaContinuacion();
      y = Math.max(y + 10, sigTop);
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
      y += 12;

      doc.fillColor(brandBlue).font('Helvetica-Bold').fontSize(9)
        .text('RECIBIDO CONFORME', PL, y);
      y += 18;

      // Cada renglón: raya larga abajo del hueco, etiqueta pequeña debajo.
      const renglon = (label: string, x: number, ancho: number) => {
        doc.moveTo(x, y + 30).lineTo(x + ancho, y + 30)
          .strokeColor('#374151').lineWidth(0.6).stroke();
        doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5)
          .text(label, x, y + 34, { width: ancho });
      };

      renglon('Firma del receptor', PL, W * 0.58 - 10);
      renglon('Cédula', PL + W * 0.58, W * 0.42);
      y += SIG_FILA;
      renglon('Nombre en LETRA DE MOLDE', PL, W);
      y += SIG_FILA;
      renglon('Fecha y hora de recibido', PL, W * 0.58 - 10);
      renglon('Vehículo / placa', PL + W * 0.58, W * 0.42);

      // ── Pie de página, en todas las hojas ──────────────────────────────────
      const rango = doc.bufferedPageRange();
      for (let i = rango.start; i < rango.start + rango.count; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - FOOTER_H;
        doc.rect(0, footerY, doc.page.width, FOOTER_H).fill('#f1f5f9');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
          .text(
            `Este conduce certifica la entrega de la mercancía descrita. La firma del receptor acredita conformidad.  ·  HiCloud ERP`,
            PL, footerY + 8, { width: W, align: 'center' },
          );
        doc.fillColor('#9ca3af').fontSize(7)
          .text(`Generado: ${fmtAhora()}`, PL, footerY + 22, { width: W * 0.5 });
        if (rango.count > 1) {
          doc.fillColor('#9ca3af').fontSize(7)
            .text(`Página ${i - rango.start + 1} de ${rango.count}`, PL + W * 0.5, footerY + 22,
              { width: W * 0.5, align: 'right' });
        }
      }

      doc.end();
    });

    return { buffer, filename: `${cond.numero}.pdf` };
  }
}
