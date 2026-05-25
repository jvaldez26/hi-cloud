import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Presupuesto } from './entities/presupuesto.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';

const TIPO_LABEL: Record<string, string> = {
  ventas: 'Ventas', compras: 'Compras', gastos: 'Gastos', caja: 'Caja', general: 'General',
};
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Injectable()
export class PresupuestoPDFService {
  constructor(
    @InjectRepository(Presupuesto) private repo: Repository<Presupuesto>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pres = await this.repo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!pres) throw new NotFoundException(`Presupuesto #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const numero = `PRES-${pres.id.toString().padStart(4, '0')}`;
    const lineas = ((pres as any).lineas ?? []).sort((a: any, b: any) => a.mes - b.mes);

    const data: DocData = {
      tipo:        'PRESUPUESTO',
      tipoSub:     `${TIPO_LABEL[pres.tipo] ?? pres.tipo} · Año ${pres.anio}`,
      numero,
      fecha:       `${pres.anio}-01-01`,
      estado:      pres.estado,
      estadoColor: pres.estado === 'aprobado' ? 'green' : pres.estado === 'cerrado' ? 'red' : 'orange',
      empresa: {
        nombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
      },
      campos: [
        { label: 'Nombre', valor: pres.nombre },
        { label: 'Tipo',   valor: TIPO_LABEL[pres.tipo] ?? pres.tipo },
        { label: 'Año',    valor: pres.anio },
      ],
      items: lineas.map((l: any) => ({
        descripcion: `${MESES[(l.mes ?? 1) - 1] ?? l.mes} · ${l.categoria || 'General'}`,
        nota:        l.cuentaCodigo ? `Cuenta: ${l.cuentaCodigo}` : undefined,
        importe:     Number(l.montoPresupuestado),
      })),
      totales: [
        { label: 'Total Presupuestado', valor: Number(pres.totalPresupuestado), bold: true },
      ],
      notas: pres.descripcion ?? undefined,
      pie: `Presupuesto ${TIPO_LABEL[pres.tipo] ?? pres.tipo} para el año ${pres.anio}. HiCloud ERP · República Dominicana`,
    };

    const buffer = await generarDocumentoPDF(data);
    return { buffer, filename: `presupuesto-${numero}.pdf` };
  }
}
