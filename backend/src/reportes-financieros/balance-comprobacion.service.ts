import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

export interface LineaBalance {
  codigo:      string;
  nombre:      string;
  tipo:        string;
  naturaleza:  string;
  nivel:       number;
  totalDebe:   number;
  totalHaber:  number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

@Injectable()
export class BalanceComprobacionService {
  constructor(
    private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  async getBalance(hasta?: string): Promise<{
    lineas:  LineaBalance[];
    totales: { debe: number; haber: number; deudor: number; acreedor: number; cuadra: boolean };
    fecha:   string;
  }> {
    const fechaCorte = hasta ?? new Date().toISOString().split('T')[0];

    const rows = await this.ds.query<{
      codigo: string; nombre: string; tipo: string; naturaleza: string;
      nivel: string; total_debe: string; total_haber: string;
    }[]>(`
      SELECT
        cc.codigo,
        cc.nombre,
        cc.tipo,
        cc.naturaleza,
        cc."nivel",
        COALESCE(SUM(al.debe),  0)::text AS total_debe,
        COALESCE(SUM(al.haber), 0)::text AS total_haber
      FROM cuentas_contables cc
      LEFT JOIN asiento_lineas al ON al."cuentaContableId" = cc.id
        AND al."isActive" = true
      LEFT JOIN asientos_contables ac ON ac.id = al."asientoId"
        AND ac.estado = 'contabilizado'
        AND ac."isActive" = true
        AND ac.fecha <= $1
      WHERE cc."isActive" = true
        AND (ac."empresaId" = $2 OR ac."empresaId" IS NULL)
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, cc."nivel"
      HAVING COALESCE(SUM(al.debe), 0) != 0 OR COALESCE(SUM(al.haber), 0) != 0
      ORDER BY cc.codigo
    `, [fechaCorte, this.eid]);

    const lineas: LineaBalance[] = rows.map(r => {
      const debe   = +r.total_debe;
      const haber  = +r.total_haber;
      return {
        codigo:        r.codigo,
        nombre:        r.nombre,
        tipo:          r.tipo,
        naturaleza:    r.naturaleza,
        nivel:         Number(r.nivel),
        totalDebe:     +debe.toFixed(2),
        totalHaber:    +haber.toFixed(2),
        saldoDeudor:   debe > haber ? +(debe - haber).toFixed(2) : 0,
        saldoAcreedor: haber > debe ? +(haber - debe).toFixed(2) : 0,
      };
    });

    const totDebe     = lineas.reduce((s, l) => s + l.totalDebe,     0);
    const totHaber    = lineas.reduce((s, l) => s + l.totalHaber,    0);
    const totDeudor   = lineas.reduce((s, l) => s + l.saldoDeudor,   0);
    const totAcreedor = lineas.reduce((s, l) => s + l.saldoAcreedor, 0);

    return {
      lineas,
      totales: {
        debe:      +totDebe.toFixed(2),
        haber:     +totHaber.toFixed(2),
        deudor:    +totDeudor.toFixed(2),
        acreedor:  +totAcreedor.toFixed(2),
        cuadra:    Math.abs(totDebe - totHaber) < 0.01 && Math.abs(totDeudor - totAcreedor) < 0.01,
      },
      fecha: fechaCorte,
    };
  }

  // Estado de cuenta de proveedor
  async estadoCuentaProveedor(proveedorId: number) {
    const compras = await this.ds.query<{
      folio: string; fecha: string; total: string; estado: string;
      montoPagado: string; montoPendiente: string; fechaVencimiento: string;
    }[]>(`
      SELECT
        c.folio,
        c.fecha::text,
        c.total::text,
        c.estado,
        COALESCE(cxp."montoPagado",0)::text   AS "montoPagado",
        COALESCE(cxp."montoPendiente",c.total)::text AS "montoPendiente",
        COALESCE(cxp."fechaVencimiento"::text, '')    AS "fechaVencimiento"
      FROM compras c
      LEFT JOIN cuentas_por_pagar cxp ON cxp."compraId" = c.id
      WHERE c."proveedorId" = $1 AND c."empresaId" = $2
        AND c."isActive" = true
        AND c.estado IN ('recibida','pagada')
      ORDER BY c.fecha DESC
      LIMIT 50
    `, [proveedorId, this.eid]);

    const pagos = await this.ds.query<{
      fecha: string; monto: string; metodo: string;
    }[]>(`
      SELECT
        p.fecha::text,
        p.monto::text,
        p."metodoPago" AS metodo
      FROM pagos_realizados p
      JOIN cuentas_por_pagar cxp ON cxp.id = p."cuentaPorPagarId"
      WHERE cxp."proveedorId" = $1
        AND p."isActive" = true
      ORDER BY p.fecha DESC
      LIMIT 50
    `, [proveedorId]).catch(() => []);

    const totalDeuda     = compras.reduce((s, c) => s + Number(c.montoPendiente), 0);
    const totalComprado  = compras.reduce((s, c) => s + Number(c.total), 0);
    const totalPagado    = compras.reduce((s, c) => s + Number(c.montoPagado), 0);

    return {
      proveedorId,
      compras: compras.map(c => ({
        folio:            c.folio,
        fecha:            c.fecha,
        total:            Number(c.total),
        estado:           c.estado,
        montoPagado:      Number(c.montoPagado),
        montoPendiente:   Number(c.montoPendiente),
        fechaVencimiento: c.fechaVencimiento,
      })),
      pagos,
      resumen: {
        totalComprado:  +totalComprado.toFixed(2),
        totalPagado:    +totalPagado.toFixed(2),
        totalDeuda:     +totalDeuda.toFixed(2),
        cantidadOC:     compras.length,
      },
    };
  }
}
