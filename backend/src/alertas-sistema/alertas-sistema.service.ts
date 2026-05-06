import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

export interface Alerta {
  id:          string;
  tipo:        string;
  severidad:   'alta' | 'media' | 'baja';
  titulo:      string;
  descripcion: string;
  cantidad?:   number;
  monto?:      number;
  ruta:        string;
  emoji:       string;
}

@Injectable()
export class AlertasSistemaService {
  constructor(
    private readonly ds:        DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  async getAlertas(): Promise<{ alertas: Alerta[]; total: number; criticas: number }> {
    const alertas: Alerta[] = [];
    const eid = this.tenantSvc.getEmpresaId();

    await Promise.all([
      this.alertasCxCVencidas(alertas, eid),
      this.alertasStockBajo(alertas, eid),
      this.alertasCxPProximas(alertas, eid),
      this.alertasContratosVence(alertas, eid),
      this.alertasFlotaVence(alertas, eid),
      this.alertasFacturasBorrador(alertas, eid),
      this.alertasCreditoExcedido(alertas, eid),
      this.alertasPeriodoSinCerrar(alertas, eid),
      this.alertasRecurrentesPendientes(alertas, eid),
    ]);

    return {
      alertas,
      total:    alertas.length,
      criticas: alertas.filter(a => a.severidad === 'alta').length,
    };
  }

  private async alertasCxCVencidas(out: Alerta[], eid: number) {
    const res = await this.ds.query<{ cantidad: string; total: string }[]>(`
      SELECT COUNT(id)::text AS cantidad,
             COALESCE(SUM("montoPendiente"),0)::text AS total
      FROM cuentas_por_cobrar
      WHERE "empresaId" = $1
        AND estado IN ('pendiente','pagada_parcial')
        AND "isActive" = true
        AND "fechaVencimiento" < CURRENT_DATE - INTERVAL '7 days'
    `, [eid]);
    const n = Number(res[0]?.cantidad ?? 0);
    if (n > 0) out.push({
      id: 'cxc-vencidas', tipo: 'cxc',
      severidad:   n > 10 ? 'alta' : n > 3 ? 'media' : 'baja',
      titulo:      'Cuentas por cobrar vencidas',
      descripcion: `${n} factura(s) sin cobrar con más de 7 días vencidas`,
      cantidad: n, monto: Number(res[0]?.total ?? 0),
      ruta: '/cxc', emoji: '💰',
    });
  }

  private async alertasStockBajo(out: Alerta[], eid: number) {
    const res = await this.ds.query<{ cantidad: string }[]>(`
      SELECT COUNT(id)::text AS cantidad
      FROM productos
      WHERE "empresaId" = $1 AND "isActive" = true AND stock <= "stockMinimo"
    `, [eid]);
    const n = Number(res[0]?.cantidad ?? 0);
    if (n > 0) out.push({
      id: 'stock-bajo', tipo: 'inventario',
      severidad: n > 5 ? 'alta' : 'media',
      titulo: 'Productos con stock bajo',
      descripcion: `${n} producto(s) están en o por debajo del stock mínimo`,
      cantidad: n, ruta: '/inventario', emoji: '📦',
    });
  }

  private async alertasCxPProximas(out: Alerta[], eid: number) {
    const res = await this.ds.query<{ cantidad: string; total: string }[]>(`
      SELECT COUNT(id)::text AS cantidad,
             COALESCE(SUM("montoPendiente"),0)::text AS total
      FROM cuentas_por_pagar
      WHERE "empresaId" = $1
        AND estado IN ('pendiente','pagada_parcial')
        AND "isActive" = true
        AND "fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
    `, [eid]);
    const n = Number(res[0]?.cantidad ?? 0);
    if (n > 0) out.push({
      id: 'cxp-proximas', tipo: 'cxp', severidad: 'alta',
      titulo: 'Pagos a proveedores próximos a vencer',
      descripcion: `${n} pago(s) vencen en los próximos 5 días`,
      cantidad: n, monto: Number(res[0]?.total ?? 0),
      ruta: '/cxp', emoji: '💳',
    });
  }

  private async alertasContratosVence(out: Alerta[], eid: number) {
    try {
      const res = await this.ds.query<{ cantidad: string }[]>(`
        SELECT COUNT(id)::text AS cantidad
        FROM contratos
        WHERE "empresaId" = $1 AND "isActive" = true AND estado = 'activo'
          AND "fechaFin" IS NOT NULL
          AND "fechaFin" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      `, [eid]);
      const n = Number(res[0]?.cantidad ?? 0);
      if (n > 0) out.push({
        id: 'contratos-vence', tipo: 'contratos', severidad: 'media',
        titulo: 'Contratos por vencer',
        descripcion: `${n} contrato(s) vencen en los próximos 30 días`,
        cantidad: n, ruta: '/contratos', emoji: '📋',
      });
    } catch {}
  }

  private async alertasFlotaVence(out: Alerta[], eid: number) {
    try {
      const res = await this.ds.query<{ cantidad: string }[]>(`
        SELECT COUNT(id)::text AS cantidad
        FROM vehiculos
        WHERE "empresaId" = $1 AND "isActive" = true
          AND (
            ("fechaMarbete" IS NOT NULL AND "fechaMarbete" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
            OR
            ("fechaSeguro"  IS NOT NULL AND "fechaSeguro"  BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
          )
      `, [eid]);
      const n = Number(res[0]?.cantidad ?? 0);
      if (n > 0) out.push({
        id: 'flota-documentos', tipo: 'flota', severidad: 'media',
        titulo: 'Documentos de flota por vencer',
        descripcion: `${n} vehículo(s) con marbete o seguro próximos a vencer`,
        cantidad: n, ruta: '/flota', emoji: '🚗',
      });
    } catch {}
  }

  private async alertasFacturasBorrador(out: Alerta[], eid: number) {
    const res = await this.ds.query<{ cantidad: string }[]>(`
      SELECT COUNT(id)::text AS cantidad
      FROM facturas
      WHERE "empresaId" = $1 AND "isActive" = true AND estado = 'borrador'
        AND "createdAt" < NOW() - INTERVAL '3 days'
    `, [eid]);
    const n = Number(res[0]?.cantidad ?? 0);
    if (n > 0) out.push({
      id: 'facturas-borrador', tipo: 'facturas', severidad: 'baja',
      titulo: 'Facturas en borrador antiguas',
      descripcion: `${n} factura(s) llevan más de 3 días sin emitir`,
      cantidad: n, ruta: '/facturas', emoji: '🧾',
    });
  }

  private async alertasCreditoExcedido(out: Alerta[], eid: number) {
    try {
      const res = await this.ds.query<{ cantidad: string }[]>(`
        SELECT COUNT(DISTINCT cc."clienteId")::text AS cantidad
        FROM credito_cliente cc
        JOIN cuentas_por_cobrar cxc ON cxc."clienteId" = cc."clienteId"
        WHERE cc."empresaId" = $1
          AND cc."isActive" = true AND cc."activo" = true
          AND cxc.estado IN ('pendiente','pagada_parcial') AND cxc."isActive" = true
        GROUP BY cc."clienteId", cc."limiteCredito"
        HAVING SUM(cxc."montoPendiente") > cc."limiteCredito"
      `, [eid]);
      const n = res.length;
      if (n > 0) out.push({
        id: 'credito-excedido', tipo: 'credito', severidad: 'alta',
        titulo: 'Clientes con crédito excedido',
        descripcion: `${n} cliente(s) han superado su límite de crédito`,
        cantidad: n, ruta: '/credito-cliente', emoji: '⚠️',
      });
    } catch {}
  }

  private async alertasPeriodoSinCerrar(out: Alerta[], eid: number) {
    try {
      const res = await this.ds.query<{ cantidad: string }[]>(`
        SELECT COUNT(id)::text AS cantidad
        FROM periodos_contables
        WHERE "empresaId" = $1 AND "isActive" = true AND estado = 'abierto'
          AND "fechaFin" < CURRENT_DATE - INTERVAL '5 days'
      `, [eid]);
      const n = Number(res[0]?.cantidad ?? 0);
      if (n > 0) out.push({
        id: 'periodos-abiertos', tipo: 'contabilidad', severidad: 'media',
        titulo: 'Períodos contables sin cerrar',
        descripcion: `${n} período(s) contable(s) ya vencieron y aún están abiertos`,
        cantidad: n, ruta: '/periodo-contable', emoji: '📅',
      });
    } catch {}
  }

  private async alertasRecurrentesPendientes(out: Alerta[], eid: number) {
    try {
      const res = await this.ds.query<{ cantidad: string }[]>(`
        SELECT COUNT(id)::text AS cantidad
        FROM facturas_recurrentes
        WHERE "empresaId" = $1 AND activa = true AND "isActive" = true
          AND "proximaEjecucion" < CURRENT_DATE
      `, [eid]);
      const n = Number(res[0]?.cantidad ?? 0);
      if (n > 0) out.push({
        id: 'recurrentes-pendientes', tipo: 'facturas', severidad: 'media',
        titulo: 'Facturas recurrentes pendientes',
        descripcion: `${n} factura(s) recurrente(s) no se generaron en la fecha programada`,
        cantidad: n, ruta: '/facturas-recurrentes', emoji: '🔄',
      });
    } catch {}
  }
}
