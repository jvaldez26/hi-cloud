import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

interface FiltrosLibro {
  desde: string;
  hasta: string;
  tipoNcf?: string;
}

@Injectable()
export class LibroVentasService {
  constructor(
    private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  // ─── Libro de Ventas ─────────────────────────────────────────────────────────

  async getLibroVentas(filtros: FiltrosLibro) {
    const { desde, hasta, tipoNcf } = filtros;
    let query = `
      SELECT
        f.fecha::text,
        f.folio,
        COALESCE(f."tipoNcf", 'E32')              AS "tipoNcf",
        e.numero                                   AS "encf",
        e."estadoDGII"                             AS "encfEstado",
        COALESCE(c.nombre, 'Consumidor Final')     AS "clienteNombre",
        COALESCE(c."rncReceptor", c.rfc, '')       AS "rncCliente",
        f.subtotal::text,
        f.iva::text,
        f.total::text,
        f.estado,
        f."nombreVendedor"
      FROM facturas f
      LEFT JOIN clientes c ON c.id = f."clienteId"
      LEFT JOIN LATERAL (
        SELECT numero, "estadoDGII"
        FROM ecf
        WHERE "facturaId" = f.id AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 1
      ) e ON TRUE
      WHERE f."isActive" = true
        AND f."empresaId" = $3
        AND f.estado IN ('emitida','pagada')
        AND f.fecha BETWEEN $1 AND $2
    `;
    const params: any[] = [desde, hasta, this.eid];
    if (tipoNcf) {
      params.push(tipoNcf);
      query += ` AND f."tipoNcf" = $${params.length}`;
    }
    query += ` ORDER BY f.fecha ASC, f.folio ASC`;

    const rows = await this.ds.query<{
      fecha: string; folio: string; tipoNcf: string;
      encf: string | null; encfEstado: string | null;
      clienteNombre: string; rncCliente: string;
      subtotal: string; iva: string; total: string;
      estado: string; nombreVendedor: string;
    }[]>(query, params);

    const registros = rows.map(r => ({
      fecha:          r.fecha,
      folio:          r.folio,
      tipoNcf:        r.tipoNcf,
      encf:           r.encf ?? null,
      encfEstado:     r.encfEstado ?? null,
      clienteNombre:  r.clienteNombre,
      rncCliente:     r.rncCliente,
      subtotal:       +r.subtotal,
      iva:            +r.iva,
      total:          +r.total,
      estado:         r.estado,
      vendedor:       r.nombreVendedor,
    }));

    const totSubtotal = registros.reduce((s, r) => s + r.subtotal, 0);
    const totIva      = registros.reduce((s, r) => s + r.iva, 0);
    const totTotal    = registros.reduce((s, r) => s + r.total, 0);

    const porNcf: Record<string, { cantidad: number; subtotal: number; iva: number; total: number }> = {};
    registros.forEach(r => {
      if (!porNcf[r.tipoNcf]) porNcf[r.tipoNcf] = { cantidad: 0, subtotal: 0, iva: 0, total: 0 };
      porNcf[r.tipoNcf].cantidad++;
      porNcf[r.tipoNcf].subtotal += r.subtotal;
      porNcf[r.tipoNcf].iva      += r.iva;
      porNcf[r.tipoNcf].total    += r.total;
    });

    return {
      periodo:     { desde, hasta },
      registros,
      totales: {
        cantidad:  registros.length,
        subtotal:  +totSubtotal.toFixed(2),
        iva:       +totIva.toFixed(2),
        total:     +totTotal.toFixed(2),
      },
      porTipoNcf: Object.entries(porNcf).map(([tipo, v]) => ({
        tipo,
        cantidad:  v.cantidad,
        subtotal:  +v.subtotal.toFixed(2),
        iva:       +v.iva.toFixed(2),
        total:     +v.total.toFixed(2),
      })).sort((a, b) => a.tipo.localeCompare(b.tipo)),
    };
  }

  // ─── Libro de Compras ─────────────────────────────────────────────────────────

  async getLibroCompras(filtros: FiltrosLibro) {
    const { desde, hasta } = filtros;
    const rows = await this.ds.query<{
      fecha: string; folio: string;
      proveedorNombre: string; rncProveedor: string;
      subtotal: string; iva: string; total: string; estado: string;
      encf: string | null; encfEstado: string | null;
    }[]>(`
      SELECT
        c.fecha::text,
        c.folio,
        COALESCE(p.nombre, 'Proveedor') AS "proveedorNombre",
        COALESCE(p.rnc, '')             AS "rncProveedor",
        c.subtotal::text,
        c.itbis::text                   AS iva,
        c.total::text,
        c.estado,
        e.numero                        AS "encf",
        e."estadoDGII"                  AS "encfEstado"
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c."proveedorId"
      LEFT JOIN LATERAL (
        SELECT numero, "estadoDGII"
        FROM ecf
        WHERE "documentoOrigenId" = c.id
          AND "documentoOrigenTipo" = 'COMPRA'
          AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT 1
      ) e ON TRUE
      WHERE c."isActive" = true
        AND c."empresaId" = $3
        AND c.estado IN ('recibida','pagada')
        AND c.fecha BETWEEN $1 AND $2
      ORDER BY c.fecha ASC, c.folio ASC
    `, [desde, hasta, this.eid]);

    const registros = rows.map(r => ({
      fecha:           r.fecha,
      folio:           r.folio,
      proveedorNombre: r.proveedorNombre,
      rncProveedor:    r.rncProveedor,
      encf:            r.encf ?? null,
      encfEstado:      r.encfEstado ?? null,
      subtotal:        +r.subtotal,
      iva:             +r.iva,
      total:           +r.total,
      estado:          r.estado,
    }));

    const totSubtotal = registros.reduce((s, r) => s + r.subtotal, 0);
    const totIva      = registros.reduce((s, r) => s + r.iva, 0);
    const totTotal    = registros.reduce((s, r) => s + r.total, 0);

    return {
      periodo: { desde, hasta },
      registros,
      totales: {
        cantidad:  registros.length,
        subtotal:  +totSubtotal.toFixed(2),
        iva:       +totIva.toFixed(2),
        total:     +totTotal.toFixed(2),
      },
    };
  }
}
