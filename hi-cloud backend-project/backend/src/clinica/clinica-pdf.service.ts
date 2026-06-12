import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ClinicaPdfService {
  private readonly logger = new Logger(ClinicaPdfService.name);

  private header(doc: any, titulo: string, empresa?: string) {
    doc.font('Helvetica-Bold').fontSize(16).text(empresa ?? 'Clínica / Consultorio', 50, 45, { align: 'center' });
    doc.font('Helvetica').fontSize(11).text(titulo, 50, 68, { align: 'center' });
    doc.moveTo(50, 85).lineTo(545, 85).stroke('#334155');
    doc.y = 95;
  }

  private row(doc: any, label: string, value: string, x = 50, w = 495) {
    doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, x, doc.y, { continued: true });
    doc.font('Helvetica').text(value ?? '—');
  }

  private sectionTitle(doc: any, title: string) {
    doc.moveDown(0.5);
    doc.rect(50, doc.y, 495, 16).fill('#1e3a5f');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9).text(title, 55, doc.y - 13);
    doc.fillColor('black');
    doc.moveDown(0.3);
  }

  private edad(fechaNacimiento: string | null): string {
    if (!fechaNacimiento) return '—';
    const dob = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return `${age} años`;
  }

  private fmtDate(val: any): string {
    if (!val) return '—';
    return new Date(val).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── RECETA ─────────────────────────────────────────────────────────────────

  async generarReceta(receta: any): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.header(doc, 'RECETA MÉDICA', receta.medicoNombre ? `Dr(a). ${receta.medicoNombre} ${receta.medicoApellidos ?? ''}` : 'Receta Médica');

        // Médico
        doc.fontSize(8).text(`Especialidad: ${receta.especialidad ?? '—'}  |  Exequatur: ${receta.exequatur ?? '—'}`, { align: 'right' });
        doc.moveDown(0.3);

        // Datos receta
        this.sectionTitle(doc, 'DATOS DE LA RECETA');
        doc.fontSize(9);
        this.row(doc, 'No. Receta', receta.numero);
        this.row(doc, 'Fecha', this.fmtDate(receta.fecha));
        this.row(doc, 'Vencimiento', this.fmtDate(receta.fechaVencimiento));

        this.sectionTitle(doc, 'DATOS DEL PACIENTE');
        doc.fontSize(9);
        this.row(doc, 'Nombre', `${receta.pacienteNombre ?? ''} ${receta.apellidos ?? receta.pacienteApellidos ?? ''}`);
        this.row(doc, 'Cédula', receta.cedula ?? '—');
        this.row(doc, 'Edad', this.edad(receta.fechaNacimiento));
        if (receta.arsNombre) this.row(doc, 'ARS', `${receta.arsNombre} — Afiliado: ${receta.arsNumeroAfiliado ?? '—'}`);
        if (receta.diagnostico) { doc.moveDown(0.2); this.row(doc, 'Diagnóstico', receta.diagnostico); }

        this.sectionTitle(doc, 'MEDICAMENTOS');
        doc.fontSize(9);
        const meds = receta.medicamentos ?? [];
        meds.forEach((m: any, i: number) => {
          doc.font('Helvetica-Bold').text(`${i + 1}. ${m.medicamento}${m.concentracion ? ' ' + m.concentracion : ''}${m.forma ? ' — ' + m.forma : ''}`, 55);
          const detalle = [
            m.via ? `Vía: ${m.via}` : null,
            m.dosis ? `Dosis: ${m.dosis}` : null,
            m.frecuencia ? `Frecuencia: ${m.frecuencia}` : null,
            m.duracion ? `Duración: ${m.duracion}` : null,
            m.cantidad ? `Cantidad: ${m.cantidad}` : null,
          ].filter(Boolean).join('  |  ');
          if (detalle) doc.font('Helvetica').fontSize(8).text(detalle, 65);
          if (m.indicaciones) doc.font('Helvetica-Oblique').fontSize(8).text(`→ ${m.indicaciones}`, 65);
          doc.moveDown(0.2);
        });
        if (!meds.length) doc.font('Helvetica').text('Sin medicamentos registrados.', 55);

        if (receta.indicacionesGenerales) {
          this.sectionTitle(doc, 'INDICACIONES GENERALES');
          doc.font('Helvetica').fontSize(9).text(receta.indicacionesGenerales, 55);
        }

        // Firma
        doc.moveDown(3);
        const sigY = doc.y;
        doc.moveTo(300, sigY).lineTo(540, sigY).stroke('#334155');
        doc.font('Helvetica').fontSize(8).text(`Dr(a). ${receta.medicoNombre ?? ''} ${receta.medicoApellidos ?? ''}`, 300, sigY + 3, { width: 240, align: 'center' });
        doc.text(`Exequatur: ${receta.exequatur ?? '—'}`, 300, sigY + 13, { width: 240, align: 'center' });

        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generando PDF receta: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }

  // ── ORDEN LABORATORIO ─────────────────────────────────────────────────────

  async generarOrdenLab(orden: any): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.header(doc, `ORDEN DE LABORATORIO${orden.urgente ? ' — URGENTE' : ''}`, orden.medicoNombre ? `Dr(a). ${orden.medicoNombre} ${orden.medicoApellidos ?? ''}` : undefined);
        if (orden.urgente) {
          doc.rect(450, 42, 90, 18).fill('#dc2626');
          doc.fillColor('white').font('Helvetica-Bold').fontSize(10).text('URGENTE', 455, 47);
          doc.fillColor('black');
        }

        this.sectionTitle(doc, 'DATOS DE LA SOLICITUD');
        this.row(doc, 'No. Orden', orden.numero);
        this.row(doc, 'Fecha', this.fmtDate(orden.fecha));
        this.row(doc, 'Laboratorio', orden.laboratorioNombre ?? '—');
        this.row(doc, 'Estado', (orden.estado ?? '—').toUpperCase().replace('_', ' '));

        this.sectionTitle(doc, 'DATOS DEL PACIENTE');
        this.row(doc, 'Nombre', `${orden.pacienteNombre ?? ''} ${orden.pacienteApellidos ?? ''}`);
        this.row(doc, 'Cédula', orden.cedula ?? '—');
        this.row(doc, 'Edad', this.edad(orden.fechaNacimiento));
        if (orden.arsNombre) this.row(doc, 'ARS', `${orden.arsNombre} — No. ${orden.arsNumeroAfiliado ?? '—'}`);

        if (orden.diagnosticoPresuntivo) {
          this.sectionTitle(doc, 'DIAGNÓSTICO PRESUNTIVO');
          doc.font('Helvetica').fontSize(9).text(orden.diagnosticoPresuntivo, 55);
        }

        this.sectionTitle(doc, 'EXÁMENES SOLICITADOS');
        const examenes = orden.examenes ?? [];
        // Agrupar por categoría
        const grupos: Record<string, any[]> = {};
        examenes.forEach((e: any) => {
          const cat = e.categoria ?? 'GENERAL';
          if (!grupos[cat]) grupos[cat] = [];
          grupos[cat].push(e);
        });
        Object.entries(grupos).forEach(([cat, exs]) => {
          doc.font('Helvetica-Bold').fontSize(9).text(`${cat}:`, 55);
          (exs as any[]).forEach((e: any) => {
            doc.font('Helvetica').fontSize(9).text(`• ${e.examen}${e.resultado ? `  → ${e.resultado} ${e.unidad ?? ''}` : ''}`, 65);
          });
          doc.moveDown(0.2);
        });
        if (!examenes.length) doc.font('Helvetica').text('Sin exámenes registrados.', 55);

        if (orden.indicaciones) {
          this.sectionTitle(doc, 'INDICACIONES');
          doc.font('Helvetica').fontSize(9).text(orden.indicaciones, 55);
        }

        // Firma
        doc.moveDown(3);
        const sigY = doc.y;
        doc.moveTo(300, sigY).lineTo(540, sigY).stroke('#334155');
        doc.font('Helvetica').fontSize(8)
          .text(`Dr(a). ${orden.medicoNombre ?? ''} ${orden.medicoApellidos ?? ''}`, 300, sigY + 3, { width: 240, align: 'center' })
          .text(`Exequatur: ${orden.exequatur ?? '—'}`, 300, sigY + 13, { width: 240, align: 'center' });

        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generando PDF orden lab: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }

  // ── EXPEDIENTE MÉDICO ─────────────────────────────────────────────────────

  async generarExpediente(expediente: any): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const { paciente, consultas, recetas, laboratorios, procedimientos } = expediente;

        this.header(doc, 'EXPEDIENTE MÉDICO');
        doc.fontSize(7).text(`Generado: ${this.fmtDate(new Date())}`, { align: 'right' });

        // Datos paciente
        this.sectionTitle(doc, 'DATOS DEL PACIENTE');
        doc.fontSize(9);
        this.row(doc, 'Código', paciente.codigo);
        this.row(doc, 'Nombre', `${paciente.nombre ?? ''} ${paciente.apellidos ?? ''}`);
        this.row(doc, 'Cédula', paciente.cedula ?? '—');
        this.row(doc, 'Fecha Nac.', `${this.fmtDate(paciente.fechaNacimiento)}  (${this.edad(paciente.fechaNacimiento)})`);
        this.row(doc, 'Sexo', paciente.sexo ?? '—');
        this.row(doc, 'Teléfono', paciente.telefono ?? '—');
        if (paciente.arsNombre) this.row(doc, 'ARS', `${paciente.arsNombre} — ${paciente.arsNumeroAfiliado ?? '—'}`);
        if (paciente.grupoSanguineo) this.row(doc, 'Grupo Sanguíneo', paciente.grupoSanguineo);

        // Antecedentes
        if (paciente.alergias || paciente.antecedentesPersonales || paciente.antecedentesFamiliares) {
          this.sectionTitle(doc, 'ANTECEDENTES');
          if (paciente.alergias) this.row(doc, 'Alergias', paciente.alergias);
          if (paciente.antecedentesPersonales) this.row(doc, 'Personales', paciente.antecedentesPersonales);
          if (paciente.antecedentesFamiliares) this.row(doc, 'Familiares', paciente.antecedentesFamiliares);
          if (paciente.medicamentosActuales) this.row(doc, 'Medicamentos Actuales', paciente.medicamentosActuales);
        }

        // Consultas
        if (consultas?.length) {
          this.sectionTitle(doc, `CONSULTAS (${consultas.length})`);
          consultas.slice(0, 10).forEach((c: any) => {
            doc.font('Helvetica-Bold').fontSize(8).text(`${this.fmtDate(c.fecha)} — ${c.motivoConsulta ?? ''}  |  Dr(a). ${c.medicoNombre ?? ''} (${c.especialidad ?? ''})`, 55);
            if (c.diagnosticoPrincipal) doc.font('Helvetica').fontSize(8).text(`Dx: ${c.diagnosticoPrincipal}`, 65);
            if (c.planTratamiento) doc.font('Helvetica').fontSize(8).text(`Plan: ${c.planTratamiento}`, 65);
            doc.moveDown(0.2);
          });
        }

        // Recetas
        if (recetas?.length) {
          this.sectionTitle(doc, `RECETAS (${recetas.length})`);
          recetas.slice(0, 5).forEach((r: any) => {
            doc.font('Helvetica').fontSize(8).text(`${this.fmtDate(r.fecha)} — ${r.numero}  |  ${r.diagnostico ?? ''}`, 55);
          });
        }

        // Laboratorios
        if (laboratorios?.length) {
          this.sectionTitle(doc, `ÓRDENES DE LABORATORIO (${laboratorios.length})`);
          laboratorios.slice(0, 5).forEach((l: any) => {
            doc.font('Helvetica').fontSize(8).text(`${this.fmtDate(l.fecha)} — ${l.numero}  |  Estado: ${(l.estado ?? '').replace('_', ' ')}`, 55);
          });
        }

        // Procedimientos
        if (procedimientos?.length) {
          this.sectionTitle(doc, `PROCEDIMIENTOS (${procedimientos.length})`);
          procedimientos.slice(0, 5).forEach((p: any) => {
            doc.font('Helvetica').fontSize(8).text(`${this.fmtDate(p.fecha)} — ${p.nombre}  |  ${p.estado ?? ''}`, 55);
          });
        }

        // Footer
        doc.moveDown(1);
        doc.fontSize(7).fillColor('#64748b').text(`Documento generado por HiCloud ERP — Confidencial`, { align: 'center' });

        doc.end();
      } catch (err: any) {
        this.logger.error(`Error generando PDF expediente: ${err.message}`, err.stack);
        reject(err);
      }
    });
  }
}
