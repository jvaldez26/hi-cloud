import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
const PDFDocument = require('pdfkit');

@Injectable()
export class AgroPdfService {
  private readonly logger = new Logger(AgroPdfService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async buildBase(doc: PDFKit.PDFDocument, title: string) {
    doc.font('Helvetica-Bold').fontSize(14).text('HiCloud ERP', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text(title, { align: 'center' });
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
    doc.moveDown(0.5);
  }

  private row(doc: PDFKit.PDFDocument, label: string, value: any) {
    doc.font('Helvetica-Bold').fontSize(9).text(label, { continued: true, width: 160 });
    doc.font('Helvetica').fontSize(9).text(String(value ?? '-'));
  }

  // ── PDF 1: Trazabilidad del ciclo ────────────────────────────────────────
  async trazabilidadCiclo(empresaId: number, cicloId: number): Promise<Buffer> {
    const [ciclo] = await this.ds.query<any[]>(
      `SELECT c.*, p.nombre AS "parcelaNombre", p.area AS "parcelaArea", p."unidadArea" AS "parcelaUnidad",
              cu.nombre AS "cultivoNombre", cu.variedad AS "cultivoVariedad",
              f.nombre AS "fincaNombre", f.provincia
         FROM ag_ciclos c
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_fincas f ON f.id=p."fincaId"
        WHERE c.id=$1 AND c."empresaId"=$2`,
      [cicloId, empresaId],
    );
    if (!ciclo) throw new NotFoundException(`Ciclo #${cicloId} no encontrado`);

    const aplicaciones = await this.ds.query<any[]>(
      `SELECT * FROM ag_aplicaciones_insumo WHERE "cicloId"=$1 ORDER BY fecha`, [cicloId],
    );
    const labores = await this.ds.query<any[]>(
      `SELECT * FROM ag_labores WHERE "cicloId"=$1 ORDER BY fecha`, [cicloId],
    );
    const cosechas = await this.ds.query<any[]>(
      `SELECT * FROM ag_cosechas WHERE "cicloId"=$1 ORDER BY fecha`, [cicloId],
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Encabezado
      doc.font('Helvetica-Bold').fontSize(16).text(ciclo.fincaNombre ?? 'Finca', { align: 'center' });
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(12).text('REPORTE DE TRAZABILIDAD', { align: 'center' });
      doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
      doc.moveDown(0.6);

      // Datos del ciclo
      doc.font('Helvetica-Bold').fontSize(11).text('INFORMACIÓN DEL CICLO');
      doc.moveDown(0.3);
      this.row(doc, 'Ciclo N°:', ciclo.numero);
      this.row(doc, 'Cultivo:', `${ciclo.cultivoNombre}${ciclo.cultivoVariedad ? ` (${ciclo.cultivoVariedad})` : ''}`);
      this.row(doc, 'Parcela:', `${ciclo.parcelaNombre} — ${ciclo.parcelaArea ?? ''} ${ciclo.parcelaUnidad ?? ''}`);
      this.row(doc, 'Finca:', `${ciclo.fincaNombre}${ciclo.provincia ? ` — ${ciclo.provincia}` : ''}`);
      this.row(doc, 'Fecha Siembra:', ciclo.fechaSiembra);
      this.row(doc, 'Fecha Est. Cosecha:', ciclo.fechaEstimadaCosecha ?? '-');
      this.row(doc, 'Área Sembrada:', `${ciclo.areaSembrada ?? '-'} ${ciclo.unidadArea ?? ''}`);
      this.row(doc, 'Estado:', ciclo.estado);
      doc.moveDown(0.8);

      // Aplicaciones de insumos
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).text('APLICACIONES DE INSUMOS');
      doc.moveDown(0.3);
      if (aplicaciones.length === 0) {
        doc.font('Helvetica').fontSize(9).text('Sin aplicaciones registradas.');
      } else {
        doc.font('Helvetica-Bold').fontSize(8);
        const hY = doc.y;
        doc.text('Fecha', 50, hY, { width: 70 });
        doc.text('Producto/Insumo', 120, hY, { width: 130 });
        doc.text('Tipo', 250, hY, { width: 70 });
        doc.text('Cantidad', 320, hY, { width: 60 });
        doc.text('Dosis/Área', 380, hY, { width: 80 });
        doc.text('Carencia', 460, hY, { width: 80 });
        doc.moveDown(0.2);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.2);
        aplicaciones.forEach(a => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(8);
          doc.text(String(a.fecha).split('T')[0], 50, y, { width: 70 });
          doc.text(a.insumoNombre, 120, y, { width: 130 });
          doc.text(a.tipo ?? '-', 250, y, { width: 70 });
          doc.text(`${a.cantidad} ${a.unidad ?? ''}`, 320, y, { width: 60 });
          doc.text(a.dosisPorArea ?? '-', 380, y, { width: 80 });
          doc.text(a.periodoCarencia ? `${a.periodoCarencia} días` : 'N/A', 460, y, { width: 80 });
          doc.moveDown(0.15);
        });
      }
      doc.moveDown(0.8);

      // Labores
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).text('LABORES REALIZADAS');
      doc.moveDown(0.3);
      labores.forEach(l => {
        doc.font('Helvetica-Bold').fontSize(8).text(`${String(l.fecha).split('T')[0]} — ${l.tipo}`, { continued: true });
        doc.font('Helvetica').fontSize(8).text(l.descripcion ? `  ${l.descripcion}` : '');
      });
      doc.moveDown(0.8);

      // Cosechas
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).text('COSECHAS');
      doc.moveDown(0.3);
      if (cosechas.length === 0) {
        doc.font('Helvetica').fontSize(9).text('Sin cosechas registradas.');
      } else {
        cosechas.forEach(c => {
          this.row(doc, `${c.numero ?? 'Cosecha'}:`, `${c.cantidad} ${c.unidad ?? ''} — Calidad: ${c.calidad ?? '-'} — Destino: ${c.destino ?? '-'}`);
        });
      }

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(7).fillColor('gray')
        .text(`Generado por HiCloud ERP — ${new Date().toLocaleDateString('es-DO')}`, { align: 'right' });
      doc.end();
    });
  }

  // ── PDF 2: Análisis costos y rentabilidad ────────────────────────────────
  async costosCiclo(empresaId: number, cicloId: number): Promise<Buffer> {
    const [ciclo] = await this.ds.query<any[]>(
      `SELECT c.*, cu.nombre AS "cultivoNombre", p.nombre AS "parcelaNombre"
         FROM ag_ciclos c
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
        WHERE c.id=$1 AND c."empresaId"=$2`,
      [cicloId, empresaId],
    );
    if (!ciclo) throw new NotFoundException(`Ciclo #${cicloId} no encontrado`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.buildBase(doc, `ANÁLISIS DE COSTOS Y RENTABILIDAD — ${ciclo.numero}`).then(() => {
        this.row(doc, 'Ciclo:', ciclo.numero);
        this.row(doc, 'Cultivo:', ciclo.cultivoNombre);
        this.row(doc, 'Parcela:', ciclo.parcelaNombre);
        this.row(doc, 'Siembra:', ciclo.fechaSiembra);
        this.row(doc, 'Estado:', ciclo.estado);
        doc.moveDown(0.8);

        doc.font('Helvetica-Bold').fontSize(11).text('DESGLOSE DE COSTOS');
        doc.moveDown(0.4);

        const costos = [
          { label: 'Semilla', val: Number(ciclo.costoSemilla) },
          { label: 'Insumos (fertilizantes, pesticidas)', val: Number(ciclo.costoInsumos) },
          { label: 'Mano de Obra', val: Number(ciclo.costoManoObra) },
          { label: 'Maquinaria', val: Number(ciclo.costoMaquinaria) },
          { label: 'Otros', val: Number(ciclo.costoOtros) },
        ];
        const total = costos.reduce((s, c) => s + c.val, 0);
        costos.forEach(c => {
          const pct = total > 0 ? ((c.val / total) * 100).toFixed(1) : '0.0';
          this.row(doc, `${c.label}:`, `RD$${c.val.toLocaleString('es-DO', { minimumFractionDigits: 2 })} (${pct}%)`);
        });
        doc.moveTo(50, doc.y + 4).lineTo(300, doc.y + 4).stroke();
        doc.moveDown(0.4);
        this.row(doc, 'COSTO TOTAL:', `RD$${Number(ciclo.costoTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
        doc.moveDown(0.8);

        doc.font('Helvetica-Bold').fontSize(11).text('RESULTADOS');
        doc.moveDown(0.4);
        const ingreso = Number(ciclo.ingresoVentas);
        const costoT  = Number(ciclo.costoTotal);
        const rent    = ingreso - costoT;
        const margen  = ingreso > 0 ? ((rent / ingreso) * 100).toFixed(2) : '0.00';
        const cosechado = Number(ciclo.cantidadCosechada) || 0;

        this.row(doc, 'Ingreso Ventas:', `RD$${ingreso.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
        this.row(doc, 'Rentabilidad:', `RD$${rent.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`);
        this.row(doc, 'Margen:', `${margen}%`);
        if (cosechado > 0) {
          this.row(doc, 'Costo/Unidad:', `RD$${(costoT / cosechado).toFixed(2)} por ${ciclo.unidadCosecha ?? 'unidad'}`);
          this.row(doc, 'Cantidad Cosechada:', `${cosechado} ${ciclo.unidadCosecha ?? ''}`);
        }

        doc.moveDown(1);
        doc.font('Helvetica').fontSize(7).fillColor('gray')
          .text(`Generado por HiCloud ERP — ${new Date().toLocaleDateString('es-DO')}`, { align: 'right' });
        doc.end();
      }).catch(reject);
    });
  }

  // ── PDF 3: Ficha del animal ───────────────────────────────────────────────
  async fichaAnimal(empresaId: number, animalId: number): Promise<Buffer> {
    const [animal] = await this.ds.query<any[]>(
      `SELECT a.*, f.nombre AS "fincaNombre",
              m.numero AS "madreNum", m.nombre AS "madreNom",
              p.numero AS "padreNum", p.nombre AS "padreNom"
         FROM ag_animales a
         LEFT JOIN ag_fincas f ON f.id=a."fincaId"
         LEFT JOIN ag_animales m ON m.id=a."madreId"
         LEFT JOIN ag_animales p ON p.id=a."padreId"
        WHERE a.id=$1 AND a."empresaId"=$2`,
      [animalId, empresaId],
    );
    if (!animal) throw new NotFoundException(`Animal #${animalId} no encontrado`);

    const eventos = await this.ds.query<any[]>(
      `SELECT * FROM ag_eventos_animal WHERE "animalId"=$1 ORDER BY fecha DESC LIMIT 30`, [animalId],
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(14).text('FICHA DEL ANIMAL', { align: 'center' });
      doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
      doc.moveDown(0.6);

      this.row(doc, 'Arete / N°:', animal.numero ?? '-');
      this.row(doc, 'Nombre:', animal.nombre ?? '-');
      this.row(doc, 'Tipo:', animal.tipo);
      this.row(doc, 'Raza:', animal.raza ?? '-');
      this.row(doc, 'Sexo:', animal.sexo ?? '-');
      this.row(doc, 'Fecha Nacimiento:', animal.fechaNacimiento ?? '-');
      this.row(doc, 'Peso Actual:', animal.pesoActual ? `${animal.pesoActual} kg` : '-');
      this.row(doc, 'Propósito:', animal.proposito ?? '-');
      this.row(doc, 'Estado:', animal.estado);
      this.row(doc, 'Finca:', animal.fincaNombre ?? '-');
      doc.moveDown(0.6);

      doc.font('Helvetica-Bold').fontSize(10).text('GENEALOGÍA');
      doc.moveDown(0.2);
      this.row(doc, 'Madre:', animal.madreNum ? `${animal.madreNum} ${animal.madreNom ?? ''}` : '-');
      this.row(doc, 'Padre:', animal.padreNum ? `${animal.padreNum} ${animal.padreNom ?? ''}` : '-');
      doc.moveDown(0.6);

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).text('HISTORIAL SANITARIO (últimos 30 eventos)');
      doc.moveDown(0.3);
      if (eventos.length === 0) {
        doc.font('Helvetica').fontSize(9).text('Sin eventos registrados.');
      } else {
        eventos.forEach(e => {
          doc.font('Helvetica-Bold').fontSize(8).text(`${String(e.fecha).split('T')[0]} — ${e.tipo}`, { continued: true });
          doc.font('Helvetica').fontSize(8).text(
            [e.producto ? ` | ${e.producto}` : '', e.dosis ? ` — ${e.dosis}` : '', e.descripcion ? `  ${e.descripcion}` : ''].join(''),
          );
        });
      }

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(7).fillColor('gray')
        .text(`Generado por HiCloud ERP — ${new Date().toLocaleDateString('es-DO')}`, { align: 'right' });
      doc.end();
    });
  }

  // ── PDF 4: Inventario de insumos ─────────────────────────────────────────
  async inventarioInsumos(empresaId: number): Promise<Buffer> {
    const insumos = await this.ds.query<any[]>(
      `SELECT * FROM ag_insumos WHERE "empresaId"=$1 AND "isActive"=true ORDER BY tipo, nombre`,
      [empresaId],
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(14).text('INVENTARIO DE INSUMOS AGRÍCOLAS', { align: 'center' });
      doc.font('Helvetica').fontSize(9).text(new Date().toLocaleDateString('es-DO'), { align: 'center' });
      doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).stroke();
      doc.moveDown(0.5);

      // Header tabla
      const hY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Nombre', 50, hY, { width: 140 });
      doc.text('Tipo', 190, hY, { width: 80 });
      doc.text('Presentación', 270, hY, { width: 90 });
      doc.text('Stock', 360, hY, { width: 60 });
      doc.text('Mín.', 420, hY, { width: 40 });
      doc.text('Costo Unit.', 460, hY, { width: 80 });
      doc.moveDown(0.2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.2);

      insumos.forEach(i => {
        const stockBajo = Number(i.stockActual) <= Number(i.stockMinimo);
        const y = doc.y;
        if (stockBajo) doc.fillColor('red');
        doc.font('Helvetica').fontSize(8);
        doc.text(i.nombre, 50, y, { width: 140 });
        doc.text(i.tipo ?? '-', 190, y, { width: 80 });
        doc.text(i.presentacion ?? '-', 270, y, { width: 90 });
        doc.text(`${i.stockActual} ${i.unidad ?? ''}`, 360, y, { width: 60 });
        doc.text(`${i.stockMinimo}`, 420, y, { width: 40 });
        doc.text(i.costoUnitario ? `RD$${Number(i.costoUnitario).toFixed(2)}` : '-', 460, y, { width: 80 });
        doc.fillColor('black').moveDown(0.15);
      });

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(7).fillColor('gray')
        .text(`* Rojos: stock bajo mínimo | Generado por HiCloud ERP — ${new Date().toLocaleDateString('es-DO')}`, { align: 'right' });
      doc.end();
    });
  }
}
