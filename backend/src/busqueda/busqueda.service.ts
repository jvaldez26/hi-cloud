import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

export interface ResultadoBusqueda {
  tipo:    string;
  icono:   string;
  id:      number;
  titulo:  string;
  subtitulo?: string;
  ruta:    string;
  extra?:  string;
}

@Injectable()
export class BusquedaService {
  constructor(
    private readonly ds:        DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  async buscar(q: string): Promise<Record<string, ResultadoBusqueda[]>> {
    if (!q || q.trim().length < 2) return {};
    const empresaId = this.tenantSvc.getEmpresaId();
    const term      = `%${q.trim()}%`;

    const [facturas, clientes, productos, proveedores, compras, cotizaciones] = await Promise.all([
      // Facturas
      this.ds.query<any[]>(`
        SELECT f.id, f.folio AS titulo,
               CONCAT(c.nombre, ' · ', f.total::text) AS subtitulo,
               f.estado AS extra
        FROM facturas f
        LEFT JOIN clientes c ON c.id = f."clienteId"
        WHERE f."empresaId" = $1 AND f."isActive" = true
          AND (f.folio ILIKE $2 OR c.nombre ILIKE $2)
        ORDER BY f."createdAt" DESC LIMIT 5
      `, [empresaId, term]),

      // Clientes
      this.ds.query<any[]>(`
        SELECT id, nombre AS titulo,
               COALESCE(rfc, "rncReceptor", email, '') AS subtitulo,
               'cliente' AS extra
        FROM clientes
        WHERE "empresaId" = $1 AND "isActive" = true
          AND (nombre ILIKE $2 OR rfc ILIKE $2 OR "rncReceptor" ILIKE $2)
        ORDER BY nombre ASC LIMIT 5
      `, [empresaId, term]),

      // Productos
      this.ds.query<any[]>(`
        SELECT id, nombre AS titulo,
               CONCAT(codigo, ' · ', COALESCE(categoria, '')) AS subtitulo,
               stock::text AS extra
        FROM productos
        WHERE "empresaId" = $1 AND "isActive" = true
          AND (nombre ILIKE $2 OR codigo ILIKE $2)
        ORDER BY nombre ASC LIMIT 5
      `, [empresaId, term]),

      // Proveedores
      this.ds.query<any[]>(`
        SELECT id, nombre AS titulo,
               COALESCE(rnc, '', email, '') AS subtitulo,
               'proveedor' AS extra
        FROM proveedores
        WHERE "empresaId" = $1 AND "isActive" = true
          AND (nombre ILIKE $2 OR rnc ILIKE $2)
        ORDER BY nombre ASC LIMIT 5
      `, [empresaId, term]),

      // Compras
      this.ds.query<any[]>(`
        SELECT c.id, c.folio AS titulo,
               CONCAT(p.nombre, ' · ', c.total::text) AS subtitulo,
               c.estado AS extra
        FROM compras c
        LEFT JOIN proveedores p ON p.id = c."proveedorId"
        WHERE c."empresaId" = $1 AND c."isActive" = true
          AND (c.folio ILIKE $2 OR p.nombre ILIKE $2)
        ORDER BY c."createdAt" DESC LIMIT 5
      `, [empresaId, term]),

      // Cotizaciones
      this.ds.query<any[]>(`
        SELECT ct.id, ct.numero AS titulo,
               CONCAT(c.nombre, ' · ', ct.total::text) AS subtitulo,
               ct.estado AS extra
        FROM cotizaciones ct
        LEFT JOIN clientes c ON c.id = ct."clienteId"
        WHERE ct."empresaId" = $1 AND ct."isActive" = true
          AND (ct.numero ILIKE $2 OR c.nombre ILIKE $2)
        ORDER BY ct."createdAt" DESC LIMIT 5
      `, [empresaId, term]),
    ]);

    const mapear = (rows: any[], tipo: string, icono: string, ruta: string): ResultadoBusqueda[] =>
      rows.map(r => ({
        tipo, icono, id: r.id,
        titulo:     r.titulo,
        subtitulo:  r.subtitulo,
        extra:      r.extra,
        ruta:       `${ruta}/${r.id}`,
      }));

    const resultado: Record<string, ResultadoBusqueda[]> = {};

    if (facturas.length)    resultado['Facturas']     = mapear(facturas,    'factura',    '🧾', '/facturas');
    if (clientes.length)    resultado['Clientes']     = mapear(clientes,    'cliente',    '👥', '/clientes');
    if (productos.length)   resultado['Productos']    = mapear(productos,   'producto',   '📦', '/productos');
    if (proveedores.length) resultado['Proveedores']  = mapear(proveedores, 'proveedor',  '🏭', '/proveedores');
    if (compras.length)     resultado['Compras']      = mapear(compras,     'compra',     '🛒', '/compras');
    if (cotizaciones.length) resultado['Cotizaciones'] = mapear(cotizaciones, 'cotizacion', '📋', '/cotizaciones');

    return resultado;
  }
}
