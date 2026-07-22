import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ReciboCobro } from './entities/recibo-cobro.entity';
import { TenantService } from '../tenant/tenant.service';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia Bancaria',
  cheque: 'Cheque', tarjeta: 'Tarjeta de Crédito/Débito',
  deposito: 'Depósito Bancario', otro: 'Otro',
};

@Injectable()
export class ReciboPDFService {
  constructor(
    @InjectRepository(ReciboCobro) private repo: Repository<ReciboCobro>,
    private tenantSvc: TenantService,
  ) {}

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rec = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!rec) throw new NotFoundException(`Recibo #${id} no encontrado`);

    const empresa = await this.repo.manager
      .query('SELECT * FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1', [empresaId])
      .then((r: any[]) => r[0] || {});

    const data: DocData = {
      tipo:    'RECIBO DE COBRO',
      tipoSub: 'Comprobante de pago al cliente',
      numero:  rec.numero,
      fecha:   String(rec.fecha),
      empresa: {
        nombre:    empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
      },
      participante: {
        label:  'Cliente',
        nombre: rec.clienteNombre || 'Consumidor Final',
      },
      campos: [
        { label: 'Método de Pago', valor: METODO_LABEL[rec.metodoPago as string] ?? (rec.metodoPago as string) },
        { label: 'Moneda', valor: rec.moneda === 'USD' ? 'Dólares Americanos (USD)' : 'Pesos Dominicanos (DOP)' },
        ...(rec.facturaFolio  ? [{ label: 'Factura Aplicada', valor: rec.facturaFolio, mono: true }] : []),
        ...(rec.referencia    ? [{ label: 'Referencia', valor: rec.referencia }]          : []),
        ...(rec.nombreUsuario ? [{ label: 'Atendido por', valor: rec.nombreUsuario }]     : []),
      ],
      items:   [{ descripcion: rec.concepto + (rec.moneda === 'USD' ? ` — US$${Number(rec.monto).toFixed(2)}` : ''), importe: Number(rec.monto) }],
      totales: [{ label: `Total Recibido (${rec.moneda ?? 'DOP'})`, valor: Number(rec.monto), bold: true }],
      notas:   rec.notas ?? undefined,
      pie: 'Este recibo certifica que el cliente realizó el pago indicado. Consérvelo como comprobante. HiCloud ERP · República Dominicana',
    };

    const buffer = await generarDocumentoPDF(data);
    return { buffer, filename: `${rec.numero}.pdf` };
  }
}
