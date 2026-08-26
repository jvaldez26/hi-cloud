/**
 * Impresión de un conduce — el único camino, para los tres sitios que lo
 * imprimen: el módulo Conduce, el Reporte de Entrega y el panel del POS.
 *
 * La plantilla ya estaba unificada (utils/docTermico), pero cada pantalla se
 * traía el documento y la empresa por su cuenta y armaba la llamada a mano. Con
 * tres copias de las mismas quince líneas basta con que una se quede atrás para
 * que los tickets vuelvan a diferenciarse. Aquí hay una.
 *
 * Dos formatos, uno por medio físico: ticket para térmica y PDF para hoja
 * carta. Los dos llevan chofer, bloque de firma y código de barras.
 */
import { message } from 'antd';
import api from '../api/client';
import { buildDocTermicoHTML, buildConduceDocData } from './docTermico';
import { imprimirReciboTermico } from './printUtils';

/** Ticket térmico (58/80mm o el que tenga configurado la empresa). */
export async function imprimirConduceTermico(conduceId: number): Promise<void> {
  try {
    const [docRes, empRes] = await Promise.all([
      api.get(`/conduces/${conduceId}`).then(r => r.data?.data ?? r.data),
      api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({})),
    ]);
    const gd = buildConduceDocData({ ...docRes, id: conduceId }, empRes);
    const tipoImpresora = ((empRes?.configuracion ?? {}) as any).posTipoImpresora;
    imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora }), undefined, tipoImpresora);
  } catch {
    message.error('Error al imprimir conduce');
  }
}

/** PDF en hoja carta, en una pestaña nueva. */
export async function abrirConducePDF(conduceId: number): Promise<void> {
  try {
    const res  = await api.get(`/conduces/${conduceId}/pdf`, { responseType: 'blob' });
    const blob = (res as any).data as Blob;
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    // Liberar la URL del objeto después de que la ventana la haya cargado
    if (win) win.addEventListener('load', () => URL.revokeObjectURL(url));
    else     message.warning('Permite las ventanas emergentes para ver el PDF');
  } catch {
    message.error('No se pudo generar el PDF del conduce');
  }
}
