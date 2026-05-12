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
}
