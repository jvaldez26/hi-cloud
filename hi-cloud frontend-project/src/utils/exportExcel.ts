// ── Exportar tabla genérica ──────────────────────────────────────────────────
export async function exportarExcel(datos: Record<string, unknown>[], nombreArchivo: string) {
  const XLSX = await import('xlsx');
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
export async function exportar606(data: any, mes: number, anio: number) {
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

  await exportarExcel(filas, `Formato-606-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar Reporte 607 ─────────────────────────────────────────────────────
export async function exportar607(data: any, mes: number, anio: number) {
  const filas = (data?.filas ?? []).map((r: any) => ({
    '#':             r.linea,
    'RNC Comprador': r.rncComprador ?? '',
    'e-NCF':         r.encf ?? '',
    'Tipo NCF':      r.tipoNcf ?? '',
    'Fecha':         r.fechaComprobante ?? '',
    'Monto':         Number(r.montoFacturado ?? 0),
    'ITBIS':         Number(r.itbis ?? 0),
  }));

  // Fila de totales
  filas.push({
    '#':             'TOTALES',
    'RNC Comprador': '',
    'e-NCF':         '',
    'Tipo NCF':      `${data?.totalLineas ?? filas.length} registros`,
    'Fecha':         '',
    'Monto':         Number(data?.totales?.montoFacturado ?? 0),
    'ITBIS':         Number(data?.totales?.itbis ?? 0),
  });

  await exportarExcel(filas, `Formato-607-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar Balance ITBIS ────────────────────────────────────────────────────
export async function exportarITBIS(data: any, mes: number, anio: number) {
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

  await exportarExcel(filas, `ITBIS-${anio}-${String(mes).padStart(2, '0')}`);
}

// ── Exportar inventario (legado) ─────────────────────────────────────────────
export async function exportarInventario(productos: any[]) {
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

  await exportarExcel(filas, `Inventario-${new Date().toISOString().split('T')[0]}`);
}

// ── Exportar hoja de conteo físico ───────────────────────────────────────────
// Genera tres hojas: Conteo (líneas ordenadas por orden), Resumen, Recuento (si hay en_recuento).
// Columna "Cant. Sistema" solo aparece en modalidad informada.
export async function exportarHojaConteo(conteo: any) {
  const XLSX = await import('xlsx');

  const lineas: any[] = (conteo.lineas ?? []).slice().sort((a: any, b: any) => a.orden - b.orden);
  const informado  = conteo.modalidad === 'informado';
  const enRevision = ['en_revision', 'ajustado', 'cerrado'].includes(conteo.estado);

  // ── Hoja principal ──
  const filas = lineas.map((l: any) => {
    const badges: string[] = [];
    if (l.tieneLotes)    badges.push('Lotes');
    if (l.tieneSeriales) badges.push('Seriales');

    const row: Record<string, any> = {
      '#':           l.orden,
      'Código':      l.productoCodigo ?? '',
      'Descripción': (l.productoNombre ?? '') + (badges.length ? ` [${badges.join(', ')}]` : ''),
      'Unidad':      l.unidadMedida ?? '',
    };
    if (informado) row['Cant. Sistema'] = Number(l.cantidadSistema ?? 0);
    row['Cant. Contada'] = l.cantidadContada != null ? Number(l.cantidadContada) : '';
    if (enRevision) {
      row['Diferencia'] = Number(l.diferencia ?? 0);
      row['Estado']     = l.estadoLinea;
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(filas);
  ws['!cols'] = Object.keys(filas[0] ?? {}).map(k => ({
    wch: Math.max(k.length, ...filas.map((r: any) => String(r[k] ?? '').length)) + 2,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conteo');

  // ── Resumen ──
  const resumen = [
    { 'Campo': 'Código',     'Valor': conteo.codigo },
    { 'Campo': 'Nombre',     'Valor': conteo.nombre },
    { 'Campo': 'Modalidad',  'Valor': conteo.modalidad === 'ciego' ? 'Ciega' : 'Informada' },
    { 'Campo': 'Estado',     'Valor': conteo.estado },
    { 'Campo': 'Total líneas', 'Valor': conteo.totalLineas },
    { 'Campo': 'Capturadas', 'Valor': conteo.lineasContadas },
    { 'Campo': 'Diferencias','Valor': conteo.totalDiferencias },
    { 'Campo': 'Fecha',      'Valor': new Date(conteo.fechaGeneracion).toLocaleDateString('es-DO') },
  ];
  const wsRes = XLSX.utils.json_to_sheet(resumen);
  wsRes['!cols'] = [{ wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

  // ── Recuento (solo si hay líneas en esa fase) ──
  const recuentoLineas = lineas.filter((l: any) => l.estadoLinea === 'en_recuento');
  if (recuentoLineas.length > 0) {
    const filasRec = recuentoLineas.map((l: any) => ({
      '#':              l.orden,
      'Código':         l.productoCodigo ?? '',
      'Descripción':    l.productoNombre ?? '',
      'Cant. Original': Number(l.cantidadContada ?? 0),
      'Cant. Recuento': l.cantidadRecuento != null ? Number(l.cantidadRecuento) : '',
    }));
    const wsRec = XLSX.utils.json_to_sheet(filasRec);
    wsRec['!cols'] = Object.keys(filasRec[0]).map(k => ({ wch: Math.max(k.length, 16) }));
    XLSX.utils.book_append_sheet(wb, wsRec, 'Recuento');
  }

  XLSX.writeFile(wb, `${conteo.codigo}-conteo.xlsx`);
}

// ── Exportar catálogo completo de productos (columnas ricas) ─────────────────
// Devuelve true si generó el archivo, false si la lista estaba vacía.
export async function exportarCatalogo(productos: any[], sufijo: string): Promise<boolean> {
  if (!productos.length) return false;

  const filas = productos.map((p: any) => {
    // Sumar stock de todos los almacenes si viene stockPorAlmacen; si no, usar p.stock
    const stockTotal = Array.isArray(p.stockPorAlmacen)
      ? p.stockPorAlmacen.reduce((acc: number, s: any) => acc + Number(s.cantidad ?? 0), 0)
      : Number(p.stock ?? 0);

    return {
      'Código':        p.codigo ?? '',
      'Nombre':        p.nombre ?? '',
      'Tipo':          p.tipo === 'servicio' ? 'Servicio' : 'Producto',
      'Categoría':     p.categoria ?? '',
      'Precio P1':     Number(p.precio ?? 0),
      'Precio P2':     p.precio2 != null ? Number(p.precio2) : '',
      'Precio P3':     p.precio3 != null ? Number(p.precio3) : '',
      'ITBIS %':       Number(p.porcentajeIva ?? 18),
      'Stock actual':  p.tipo === 'servicio' ? '' : stockTotal,
      'Stock mínimo':  p.tipo === 'servicio' ? '' : Number(p.stockMinimo ?? 0),
      'Unidad medida': p.unidadMedida ?? 'PZA',
    };
  });

  await exportarExcel(filas, `Productos-${sufijo}`);
  return true;
}
