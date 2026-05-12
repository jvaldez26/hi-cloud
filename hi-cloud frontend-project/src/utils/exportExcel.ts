import * as XLSX from 'xlsx';

// ── Exportar tabla genérica ──────────────────────────────────────────────────
export function exportarExcel(datos: Record<string, unknown>[], nombreArchivo: string) {
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();

  // Ajustar ancho de columnas automáticamente
  const cols = Object.keys(datos[0] ?? {}).map(k => ({
    wch: Math.max(k.length, ...datos.map(r => String(r[k] ?? '').length)) + 2,
  }));
  ws['!cols'] = cols;

  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}

// ── Exportar Reporte 606 ─────────────────────────────────────────────────────
export function exportar606(data: any, mes: number, anio: number) {
  const filas = (data?.detalle ?? []).map((r: any) => ({
    'Folio':             r.folio,
    'Fecha':             r.fecha,
    'RNC Proveedor':     r.rncProveedor,
    'Proveedor':         r.nombreProveedor,
    'No. CF Proveedor':  r.numCFProveedor,
    'Monto Gravado':     Number(r.montoGravado),
    'ITBIS':             Number(r.itbis),
    'Total':             Number(r.total),
  }));

  // Fila de totales
  filas.push({
    'Folio':            'TOTALES',
    'Fecha':            '',
    'RNC Proveedor':    '',
    'Proveedor':        `${data?.totales?.compras ?? 0} compras`,
    'No. CF Proveedor': '',
    'Monto Gravado':    Number(data?.totales?.montoTotal ?? 0) - Number(data?.totales?.itbisPagado ?? 0),
    'ITBIS':            Number(data?.totales?.itbisPagado ?? 0),
    'Total':            Number(data?.totales?.montoTotal ?? 0),
  });

  exportarExcel(filas, `Formato-606-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar Reporte 607 ─────────────────────────────────────────────────────
export function exportar607(data: any, mes: number, anio: number) {
  const filas = (data?.detalle ?? []).map((r: any) => ({
    'Folio':           r.folio,
    'NCF':             r.ncf,
    'RNC Receptor':    r.rncReceptor,
    'Receptor':        r.nombreReceptor,
    'Fecha':           r.fecha,
    'Monto Anulado':   Number(r.montoAnulado),
    'Fecha Anulación': r.fechaAnulacion,
  }));

  exportarExcel(filas, `Formato-607-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar Balance ITBIS ────────────────────────────────────────────────────
export function exportarITBIS(data: any, mes: number, anio: number) {
  const filas = [
    { 'Concepto': 'VENTAS', 'Detalle': '', 'Monto': '' },
    { 'Concepto': 'Facturas emitidas', 'Detalle': data?.ventas?.facturas ?? 0, 'Monto': data?.ventas?.totalFacturado ?? 0 },
    { 'Concepto': 'Monto gravado',     'Detalle': '',                           'Monto': data?.ventas?.montoGravado ?? 0 },
    { 'Concepto': 'ITBIS cobrado',     'Detalle': '',                           'Monto': data?.ventas?.itbisCobrado ?? 0 },
    { 'Concepto': '', 'Detalle': '', 'Monto': '' },
    { 'Concepto': 'COMPRAS', 'Detalle': '', 'Monto': '' },
    { 'Concepto': 'Órdenes recibidas', 'Detalle': data?.compras?.ordenes ?? 0, 'Monto': data?.compras?.totalComprado ?? 0 },
    { 'Concepto': 'Monto gravado',     'Detalle': '',                          'Monto': data?.compras?.montoGravado ?? 0 },
    { 'Concepto': 'ITBIS crédito',     'Detalle': '',                          'Monto': data?.compras?.itbisPagado ?? 0 },
    { 'Concepto': '', 'Detalle': '', 'Monto': '' },
    { 'Concepto': 'BALANCE ITBIS DGII', 'Detalle': data?.resumenITBIS?.situacion ?? '', 'Monto': data?.resumenITBIS?.balance ?? 0 },
  ];

  exportarExcel(filas, `ITBIS-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar inventario ───────────────────────────────────────────────────────
export function exportarInventario(productos: any[]) {
  const filas = productos.map((p: any) => ({
    'Código':        p.codigo,
    'Nombre':        p.nombre,
    'Categoría':     p.categoria ?? '—',
    'Unidad':        p.unidadMedida,
    'Precio':        Number(p.precio),
    'Stock actual':  Number(p.stock),
    'Stock mínimo':  Number(p.stockMinimo),
    'Valor total':   Number(p.precio) * Number(p.stock),
    'Alerta':        p.alerta ? 'SÍ' : 'NO',
  }));

  exportarExcel(filas, `Inventario-${new Date().toISOString().split('T')[0]}`);
}
