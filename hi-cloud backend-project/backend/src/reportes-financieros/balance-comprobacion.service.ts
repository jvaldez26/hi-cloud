import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { SaldosCuentasService } from './saldos-cuentas.service';

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
    private readonly saldosCuentasService: SaldosCuentasService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  async getBalance(hasta?: string): Promise<{
    lineas:  LineaBalance[];
    totales: { debe: number; haber: number; deudor: number; acreedor: number; cuadra: boolean };
    fecha:   string;
  }> {
    const fechaCorte = hasta ?? fechaHoyRD();
    const eid = this.eid; // resuelto UNA vez — falla cerrado antes de tocar la BD

    // Balance/Diagnóstico (2026-09-20): saldos leídos de SaldosCuentasService,
    // la misma función que usa Balance General/Estado de Resultados — antes
    // cada uno tenía su propia consulta SQL y podían divergir. Las columnas
    // Deudor/Acreedor de un balance de comprobación siguen comparando
    // totalDebe/totalHaber CRUDOS (no el saldo firmado por naturaleza): así
    // es como se arma un balance de comprobación — eso no cambia.
    const cuentas = await this.saldosCuentasService.obtenerSaldos(eid, undefined, fechaCorte);

    const lineas: LineaBalance[] = cuentas.map(c => ({
      codigo:        c.codigo,
      nombre:        c.nombre,
      tipo:          c.tipo,
      naturaleza:    c.naturaleza,
      nivel:         c.nivel,
      totalDebe:     c.totalDebe,
      totalHaber:    c.totalHaber,
      saldoDeudor:   c.totalDebe > c.totalHaber ? +(c.totalDebe - c.totalHaber).toFixed(2) : 0,
      saldoAcreedor: c.totalHaber > c.totalDebe ? +(c.totalHaber - c.totalDebe).toFixed(2) : 0,
    }));

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
