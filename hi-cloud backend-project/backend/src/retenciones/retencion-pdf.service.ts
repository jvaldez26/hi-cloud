import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { RetencionISR } from './entities/retencion-isr.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';

const SERVICIO_LABEL: Record<string, string> = {
  profesional: 'Servicios Profesionales', servicios_tecnicos: 'Servicios Técnicos',
  alquileres: 'Alquileres', otros_servicios: 'Otros Servicios',
  dividendos: 'Dividendos', intereses: 'Intereses',
};

@Injectable()
export class RetencionPDFService {
  constructor(
    @InjectRepository(RetencionISR) private repo: Repository<RetencionISR>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const ret = await this.repo.findOne({ where: { id, empresaId } });
    if (!ret) throw new NotFoundException(`Retención #${id} no encontrada`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const numero = `RET-${ret.id.toString().padStart(6, '0')}`;

    const data: DocData = {
      tipo:    'COMPROBANTE DE RETENCIÓN ISR',
      tipoSub: 'Retención de Impuesto Sobre la Renta · DGII RD',
      numero,
      fecha:   String((ret as any).createdAt ?? new Date()),
      empresa: {
        nombre:    empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
      },
      participante: {
        label:  'Proveedor / Beneficiario',
        nombre: ret.nombreProveedor,
        rnc:    ret.rncProveedor,
      },
      campos: [
        { label: 'Período',          valor: ret.periodo },
        { label: 'Tipo de Servicio', valor: SERVICIO_LABEL[ret.tipoServicio as string] ?? (ret.tipoServicio as string) },
        { label: '% Retención',      valor: `${Number(ret.porcentajeRetencion)}%` },
      ],
      items: [
        { descripcion: ret.descripcionServicio, importe: Number(ret.montoBruto) },
      ],
      totales: [
        { label: 'Monto Bruto',                                           valor: Number(ret.montoBruto) },
        { label: `Retención ISR (${Number(ret.porcentajeRetencion)}%)`,   valor: Number(ret.montoRetenido), color: '#dc2626' },
        { label: 'Monto Neto a Pagar',                                    valor: Number(ret.montoNeto), bold: true },
      ],
      pie: `Comprobante de retención ISR emitido conforme al artículo 307 del Código Tributario de la República Dominicana. Período: ${ret.periodo}. HiCloud ERP`,
    };

    const buffer = await generarDocumentoPDF(data);
    return { buffer, filename: `retencion-${numero}.pdf` };
  }
}
