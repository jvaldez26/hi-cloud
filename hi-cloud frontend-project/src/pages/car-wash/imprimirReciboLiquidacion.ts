/** Recibo de pago a lavador — mismo molde que Conduce/Car Wash (docTermico.ts), con espacio de firma. */
import { message } from 'antd';
import api from '../../api/client';
import { buildDocTermicoHTML, type GenericDocData } from '../../utils/docTermico';
import { imprimirReciboTermico } from '../../utils/printUtils';

export interface LiquidacionParaRecibo {
  id: number;
  lavadorNombre: string;
  desde: string;
  hasta: string;
  totalComisiones: number;
  totalAdelantos: number;
  totalPagado: number;
}

export async function imprimirReciboLiquidacion(liq: LiquidacionParaRecibo): Promise<void> {
  try {
    const empRes = await api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({}));
    const tipoImpresora = ((empRes?.configuracion ?? {}) as any)?.posTipoImpresora;

    const gd: GenericDocData = {
      tipo: 'PAGO A LAVADOR',
      numero: `LIQ-${liq.id}`,
      fecha: new Date().toLocaleDateString('es-DO'),
      empresa: {
        nombre: empRes?.nombreComercial || empRes?.nombre,
        rnc: empRes?.rnc,
        direccion: empRes?.direccion,
        telefono: empRes?.telefono,
      },
      cliente: liq.lavadorNombre,
      etiquetaContraparte: 'Lavador',
      infoRows: [['PERÍODO', `${liq.desde} a ${liq.hasta}`]],
      items: [
        { desc: 'Comisiones del período', total: liq.totalComisiones },
        { desc: 'Adelantos descontados', total: -liq.totalAdelantos },
      ],
      total: liq.totalPagado,
      firmaRecepcion: true,
    };

    imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora }), undefined, tipoImpresora);
  } catch {
    message.error('No se pudo imprimir el recibo de pago');
  }
}
