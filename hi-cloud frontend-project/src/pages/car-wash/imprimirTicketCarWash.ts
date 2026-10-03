/**
 * Ticket de recepción de Car Wash — 80mm, mismo molde que Conduce
 * (utils/docTermico.ts), con el QR (no fiscal) hacia la página pública de
 * seguimiento del turno. Nada que ver con el ticket fiscal de POS
 * (utils/ticketTermico.ts, exclusivo de e-CF).
 */
import { message } from 'antd';
import api from '../../api/client';
import { buildDocTermicoHTML, type GenericDocData } from '../../utils/docTermico';
import { imprimirReciboTermico } from '../../utils/printUtils';
import { generarQrTicket } from '../../utils/configTicket';

export interface TurnoParaTicket {
  codigo: string;
  placa: string;
  tipoVehiculo: string;
  marca?: string;
  color?: string;
  servicios: Array<{ nombre: string; precio: number }>;
  /** La arma el backend con FRONTEND_URL (nunca window.location.origin — en
   *  local eso da http://localhost, inútil para que un celular la escanee). */
  urlPublica: string;
}

function formatoFechaCorta(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

export async function imprimirTicketCarWash(turno: TurnoParaTicket): Promise<void> {
  try {
    const empRes = await api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => ({}));
    const tipoImpresora = ((empRes?.configuracion ?? {}) as any)?.posTipoImpresora;

    const total = turno.servicios.reduce((s, x) => s + Number(x.precio), 0);
    const qrDataUrl = await generarQrTicket(turno.urlPublica, 'normal');

    const gd: GenericDocData = {
      tipo: 'CAR WASH',
      numero: turno.codigo,
      // Corto a propósito (DD/MM HH:mm) — un valor largo tipo
      // "2/10/2026, 5:42:33 p. m." empuja la etiqueta "Fecha:" a un ancho
      // mínimo y la trunca a "Fech…" (row() da flex:1 al label pero ancho
      // fijo al valor; ver .row en docTermico.ts).
      fecha: formatoFechaCorta(new Date()),
      empresa: {
        nombre: empRes?.nombreComercial || empRes?.nombre,
        rnc: empRes?.rnc,
        direccion: empRes?.direccion,
        telefono: empRes?.telefono,
      },
      infoRows: [
        ['PLACA', turno.placa],
        ['VEHÍCULO', `${turno.tipoVehiculo}${turno.marca ? ` · ${turno.marca}` : ''}${turno.color ? ` · ${turno.color}` : ''}`],
      ],
      items: turno.servicios.map(s => ({ desc: s.nombre, total: s.precio })),
      total,
      qr: { dataUrl: qrDataUrl, caption: 'Escanee para ver el estado de su vehículo' },
    };

    imprimirReciboTermico(buildDocTermicoHTML(gd, { tipoImpresora }), undefined, tipoImpresora);
  } catch {
    message.error('No se pudo imprimir el ticket del turno');
  }
}
