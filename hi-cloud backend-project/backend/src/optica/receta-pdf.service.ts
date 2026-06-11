import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

function fmtFecha(s: string | Date): string {
  try {
    const iso = s instanceof Date ? s.toISOString() : String(s);
    const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
    if (isNaN(d.getTime())) return String(s);
    return [
      String(d.getUTCDate()).padStart(2, '0'),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      d.getUTCFullYear(),
    ].join('/');
  } catch { return String(s); }
}

function fmtGrad(v: number | null): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(Number(v));
  const sign = Number(v) >= 0 ? '+' : '-';
  return `${sign}${abs.toFixed(2)}`;
}

function fmtEje(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(Number(v))}°`;
}

@Injectable()
export class RecetaPdfService {
  private readonly logger = new Logger(RecetaPdfService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  async generarPdfReceta(recetaId: number): Promise<Buffer> {
    const empresaId = this.tenantSvc.getEmpresaId();
    let rows: any[];
    try {
      rows = await this.ds.query<any[]>(`
        SELECT
          r.id, r.numero, r.fecha, r.tipo,
          r."esferaOD", r."cilindroOD", r."ejeOD", r."adicionOD",
          r."esferaOI", r."cilindroOI", r."ejeOI", r."adicionOI",
          r."dipLejos", r."dipCerca",
          r."marcaContacto", r."tipoContacto",
          r.instrucciones, r."vigenciaAnos", r.notas,
          p.nombre || ' ' || p.apellido AS "pacienteNombre",
          p.cedula AS "pacienteCedula",
          p.telefono AS "pacienteTelefono",
          m.nombre || ' ' || m.apellido AS "medicoNombre",
          m.especialidad AS "medicoEspecialidad",
          m.exequatur AS "medicoExequatur",
          e.nombre AS "empresaNombre", e.rnc AS "empresaRnc",
          e.direccion AS "empresaDireccion", e.ciudad AS "empresaCiudad",
          e.telefono AS "empresaTelefono", e.email AS "empresaEmail"
        FROM op_recetas r
        JOIN op_pacientes p ON p.id = r."pacienteId" AND p."empresaId" = r."empresaId"
        LEFT JOIN op_medicos m ON m.id = r."medicoId" AND m."empresaId" = r."empresaId"
        JOIN empresa e ON e.id = r."empresaId"
        WHERE r.id = $1 AND r."empresaId" = $2
      `, [recetaId, empresaId]);
    } catch (err: any) {
      this.logger.error(`Error consultando receta #${recetaId} para PDF: ${err.message}`, err.stack);
      throw err;
    }

    if (!rows.length) throw new NotFoundException(`Receta #${recetaId} no encontrada`);
    const r = rows[0];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, compress: true });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = doc.page.width;
      const PL = 40;
      const PR = PW - 40;
      const W  = PR - PL;

      const DARK  = '#111111';
      const BLUE  = '#1677ff';
      const GRAY  = '#555555';
      const LGRAY = '#f5f5f5';
      const LINE  = '#dddddd';

      let y = 36;

      // ── ENCABEZADO ────────────────────────────────────────────────────────

      const iniciales = (r.empresaNombre || 'OP')
        .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

      doc.rect(PL, y, 48, 48).fill(DARK);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
        .text(iniciales, PL, y + 16, { width: 48, align: 'center' });

      const infoX = PL + 62;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13)
        .text(r.empresaNombre.toUpperCase(), infoX, y, { width: 240 });
      let iy = y + 16;
      doc.font('Helvetica').fontSize(8).fillColor(GRAY);
      if (r.empresaRnc) { doc.text(`RNC: ${r.empresaRnc}`, infoX, iy, { width: 240 }); iy += 11; }
      if (r.empresaDireccion) {
        const dir = r.empresaDireccion + (r.empresaCiudad ? ', ' + r.empresaCiudad : '');
        doc.text(dir, infoX, iy, { width: 240 }); iy += 11;
      }
      if (r.empresaTelefono) { doc.text(`Tel: ${r.empresaTelefono}`, infoX, iy, { width: 240 }); }

      // Bloque documento (derecha)
      const docX = PW - 180;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE)
        .text('RECETA ÓPTICA', docX, y, { width: 140, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(DARK)
        .text(`N°: ${r.numero}`, docX, y + 20, { width: 140, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(GRAY)
        .text(`Fecha: ${fmtFecha(r.fecha)}`, docX, y + 33, { width: 140, align: 'right' })
        .text(`Vigencia: ${r.vigenciaAnos} año(s)`, docX, y + 45, { width: 140, align: 'right' });

      y += 64;
      doc.moveTo(PL, y).lineTo(PR, y).strokeColor(LINE).lineWidth(0.5).stroke();
      y += 12;

      // ── PACIENTE / MÉDICO ─────────────────────────────────────────────────

      const halfW = W / 2 - 10;

      doc.rect(PL, y, halfW, 72).fill(LGRAY);
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
        .text('PACIENTE', PL + 8, y + 8);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
        .text(r.pacienteNombre, PL + 8, y + 20, { width: halfW - 16 });
      doc.font('Helvetica').fontSize(8).fillColor(GRAY);
      let py = y + 33;
      if (r.pacienteCedula)  { doc.text(`Cédula: ${r.pacienteCedula}`, PL + 8, py, { width: halfW - 16 }); py += 11; }
      if (r.pacienteTelefono) { doc.text(`Tel: ${r.pacienteTelefono}`, PL + 8, py, { width: halfW - 16 }); }

      const midX = PL + halfW + 20;
      doc.rect(midX, y, halfW, 72).fill(LGRAY);
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
        .text('MÉDICO / OPTOMETRISTA', midX + 8, y + 8);
      if (r.medicoNombre) {
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
          .text(`Dr(a). ${r.medicoNombre}`, midX + 8, y + 20, { width: halfW - 16 });
        doc.font('Helvetica').fontSize(8).fillColor(GRAY);
        let my = y + 33;
        if (r.medicoEspecialidad) { doc.text(r.medicoEspecialidad, midX + 8, my, { width: halfW - 16 }); my += 11; }
        if (r.medicoExequatur)    { doc.text(`Exequatur: ${r.medicoExequatur}`, midX + 8, my, { width: halfW - 16 }); }
      } else {
        doc.fillColor(GRAY).font('Helvetica').fontSize(9)
          .text('Sin médico asignado', midX + 8, y + 30, { width: halfW - 16 });
      }

      y += 84;

      // ── TABLA GRADUACIÓN ──────────────────────────────────────────────────

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
        .text('GRADUACIÓN', PL, y);
      y += 16;

      const cols = [
        { label: '',       x: PL,       w: 80  },
        { label: 'ESF',    x: PL + 80,  w: 70  },
        { label: 'CIL',    x: PL + 150, w: 70  },
        { label: 'EJE',    x: PL + 220, w: 70  },
        { label: 'ADIC',   x: PL + 290, w: 70  },
        { label: 'D.I.P.', x: PL + 360, w: 155 },
      ];

      // Header fila
      doc.rect(PL, y, W, 22).fill(DARK);
      cols.forEach(c => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
          .text(c.label, c.x + 4, y + 7, { width: c.w - 8, align: c.label === '' ? 'left' : 'center' });
      });
      y += 22;

      const drawRow = (label: string, esf: any, cil: any, eje: any, adic: any, dip: string, bgColor: string) => {
        doc.rect(PL, y, W, 26).fill(bgColor);
        doc.rect(PL, y, W, 26).strokeColor(LINE).lineWidth(0.3).stroke();

        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
          .text(label, cols[0].x + 4, y + 8, { width: cols[0].w - 8 });
        [fmtGrad(esf), fmtGrad(cil), fmtEje(eje), fmtGrad(adic)].forEach((val, i) => {
          doc.font('Helvetica').fontSize(10).fillColor(val === '—' ? GRAY : DARK)
            .text(val, cols[i + 1].x + 4, y + 8, { width: cols[i + 1].w - 8, align: 'center' });
        });
        doc.font('Helvetica').fontSize(9).fillColor(GRAY)
          .text(dip, cols[5].x + 4, y + 8, { width: cols[5].w - 8, align: 'center' });
        y += 26;
      };

      const dipStr = r.dipLejos || r.dipCerca
        ? `L: ${r.dipLejos ? Number(r.dipLejos).toFixed(1) + ' mm' : '—'}  C: ${r.dipCerca ? Number(r.dipCerca).toFixed(1) + ' mm' : '—'}`
        : '—';

      drawRow('OD (Der)', r.esferaOD, r.cilindroOD, r.ejeOD, r.adicionOD, dipStr, '#ffffff');
      drawRow('OI (Izq)', r.esferaOI, r.cilindroOI, r.ejeOI, r.adicionOI, LGRAY,  LGRAY);

      y += 12;

      // ── TIPO Y LENTES DE CONTACTO ─────────────────────────────────────────

      const tipoLabel = r.tipo === 'lentes_contacto' ? 'Lentes de contacto' : 'Lentes oftálmicos';
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
        .text('TIPO: ', PL, y, { continued: true })
        .font('Helvetica').fillColor(BLUE).text(tipoLabel.toUpperCase());
      y += 14;

      if (r.tipo === 'lentes_contacto' && (r.marcaContacto || r.tipoContacto)) {
        doc.rect(PL, y, W, 30).fill(LGRAY);
        doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8).text('LENTES DE CONTACTO', PL + 8, y + 6);
        doc.fillColor(DARK).font('Helvetica').fontSize(9);
        const partes: string[] = [];
        if (r.marcaContacto) partes.push(`Marca: ${r.marcaContacto}`);
        if (r.tipoContacto)  partes.push(`Tipo: ${r.tipoContacto}`);
        doc.text(partes.join('   |   '), PL + 8, y + 17, { width: W - 16 });
        y += 42;
      }

      // ── INSTRUCCIONES ─────────────────────────────────────────────────────

      if (r.instrucciones) {
        doc.moveTo(PL, y).lineTo(PR, y).strokeColor(LINE).lineWidth(0.5).stroke();
        y += 10;
        doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text('INSTRUCCIONES', PL, y);
        y += 13;
        doc.fillColor(DARK).font('Helvetica').fontSize(9)
          .text(r.instrucciones, PL, y, { width: W });
        y += doc.heightOfString(r.instrucciones, { width: W }) + 10;
      }

      // ── NOTAS ─────────────────────────────────────────────────────────────

      if (r.notas) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(8)
          .text(`Nota: ${r.notas}`, PL, y, { width: W });
        y += doc.heightOfString(`Nota: ${r.notas}`, { width: W }) + 10;
      }

      // ── FIRMA ─────────────────────────────────────────────────────────────

      const firmaY = Math.max(y + 20, doc.page.height - 120);
      doc.moveTo(PL, firmaY).lineTo(PR, firmaY).strokeColor(LINE).lineWidth(0.5).stroke();
      const firmaX = PW / 2 - 80;
      doc.moveTo(firmaX, firmaY + 50).lineTo(firmaX + 160, firmaY + 50)
        .strokeColor(DARK).lineWidth(0.5).stroke();
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('Firma y Sello del Médico', firmaX, firmaY + 54, { width: 160, align: 'center' });
      if (r.medicoNombre) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK)
          .text(`Dr(a). ${r.medicoNombre}`, firmaX, firmaY + 66, { width: 160, align: 'center' });
      }

      // ── PIE ───────────────────────────────────────────────────────────────

      doc.fillColor(GRAY).font('Helvetica').fontSize(7)
        .text(
          `Receta generada por HiCloud ERP — Válida por ${r.vigenciaAnos} año(s) desde ${fmtFecha(r.fecha)}`,
          PL, doc.page.height - 30, { width: W, align: 'center' },
        );

      doc.end();
    });
  }
}
