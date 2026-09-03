import { Injectable, Optional } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

export type Entidad =
  | 'factura' | 'producto' | 'cliente' | 'proveedor'
  | 'caja'    | 'inventario' | 'cxc'   | 'cotizacion'
  | 'compra'  | 'conduce'    | 'vendedor';

@Injectable()
export class RealtimeService {
  constructor(
    // Optional: si el módulo no está disponible en tests, no falla
    @Optional() private readonly gateway: RealtimeGateway,
  ) {}

  notify(
    empresaId: number,
    entidad: Entidad,
    accion: 'created' | 'updated' | 'deleted' = 'updated',
    id?: number,
  ) {
    this.gateway?.notificar(empresaId, entidad, accion, id);
  }

  notificarPOS(
    empresaId: number,
    facturaId: number,
    payload: { tipo: 'ECF_ACEPTADO' | 'ECF_RECHAZADO' | 'ECF_ENVIADO'; encf: string; trackId?: string; qrUrl?: string; mensaje?: string },
  ) {
    this.gateway?.notificarPOS(empresaId, facturaId, payload);
  }

  /**
   * Avisa de que hay un mensaje nuevo del Super Admin. Sin contenido: el
   * cliente consulta y el servidor vuelve a filtrar por destinatario.
   *
   * No sustituye al sondeo del notificador, lo adelanta. El sondeo sigue siendo
   * la garantía para quien no tiene canal: /portal-empleado nunca lo monta, una
   * pestaña dormida pierde los eventos y Socket.IO no reencola nada.
   */
  notificarMensajeNuevo(empresaIds: number[] | 'todas') {
    this.gateway?.notificarMensajeNuevo(empresaIds);
  }
}
