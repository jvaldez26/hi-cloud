import { fecha } from './fechaRD';
import { hoyRD } from './fechaRD';
// ── Exportar e-CF Recibidos ──────────────────────────────────────────────────
// Fechas como celda Excel real (tipo 'd') para que sean ordenables y filtrables.
// Montos como número, sin prefijo "RD$".
// Filas sin fecha se marcan con "SIN FECHA ⚠" en esa columna.
export async function exportarEcfRecibidos(registros: any[], nombre: string) {
  const XLSX = await import('xlsx');

  // Convierte "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss..." a Date al mediodía (evita offset TZ)
  const toDate = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    const ymd = s.substring(0, 10); // "YYYY-MM-DD"
    const d = new Date(`${ymd}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };

  const filas = registros.map((r: any) => {
    const fecha = toDate(r.fechaDocumento);
    return {
      'e-NCF':         r.encf ?? '',
      'RNC Emisor':    r.rncEmisor ?? '',
      'Emisor':        r.nombreEmisor ?? '',
      'Fecha':         fecha ?? 'SIN FECHA ⚠',
      'Día':           fecha ? fecha.getDate() : '',
      'Tipo':          r.tipoEcf ? `E${r.tipoEcf}` : '',
      'Monto Gravado': r.montoGravado != null ? Number(r.montoGravado) : '',
      'ITBIS':         r.itbis != null ? Number(r.itbis) : '',
      'Total':         r.total != null ? Number(r.total) : 0,
      'Estado':        r.status ?? '',
      'Origen':        r.fuenteImportacion ?? '',
    };
  });

  // cellDates: true → xlsx serializa Date como celda de fecha real (no texto)
  const ws = XLSX.utils.json_to_sheet(filas, { cellDates: true });

  // Ancho de columnas
  const headers = Object.keys(filas[0] ?? {});
  ws['!cols'] = headers.map((k, i) => ({
    wch: Math.max(k.length, ...filas.map(row => String((row as any)[k] ?? '').length), i === 3 ? 12 : 0) + 2,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'e-CF Recibidos');
  XLSX.writeFile(wb, `${nombre}.xlsx`);
}

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
// Columnas según Formato de Envío de Ventas de Bienes y Servicios (DGII 2023)
export async function exportar607(data: any, mes: number, anio: number) {
  // DGII exige fecha sin guiones: YYYYMMDD
  const fmtFecha = (f: string) => (f ? f.replace(/-/g, '').substring(0, 8) : '');

  const filas = (data?.filas ?? []).map((r: any) => ({
    'No':                             r.linea,
    'RNC/Cédula o Pasaporte':         r.rncComprador ?? '',
    'Tipo Identificación':            r.tipoId ?? '',
    'Número Comprobante Fiscal':      r.encf ?? '',
    'NCF Modificado':                 '',
    'Tipo de Ingreso':                r.tipoIngreso ?? '',
    'Fecha Comprobante':              fmtFecha(r.fechaComprobante),
    'Fecha Retención':                '',
    'Monto Facturado':                Number(r.montoFacturado ?? 0),
    'ITBIS Facturado':                Number(r.itbis ?? 0),
    'ITBIS Retenido Terceros':        Number(r.itbisRetenido ?? 0),
    'Retención Renta por Terceros':   Number(r.isrRetenido ?? 0),
    'ISR Percibido':                  0,
    'Impuesto Selectivo al Consumo':  0,
    'Otros Impuestos/Tasas':          0,
    'Monto Propina Legal':            0,
    'Efectivo':                       Number(r.efectivo ?? 0),
    'Cheque/Transferencia/Depósito':  Number(r.chequeTransferencia ?? 0),
    'Tarjeta Débito/Crédito':         Number(r.tarjeta ?? 0),
    'Venta a Crédito':                Number(r.credito ?? 0),
    'Bonos o Certificados de Regalo': Number(r.bonos ?? 0),
    'Permuta':                        Number(r.permuta ?? 0),
    'Otras Formas de Ventas':         Number(r.otras ?? 0),
  }));

  // Fila de totales
  const t = data?.totales ?? {};
  filas.push({
    'No':                             'TOTALES',
    'RNC/Cédula o Pasaporte':         '',
    'Tipo Identificación':            '',
    'Número Comprobante Fiscal':      `${data?.totalLineas ?? (filas.length)} registros`,
    'NCF Modificado':                 '',
    'Tipo de Ingreso':                '',
    'Fecha Comprobante':              '',
    'Fecha Retención':                '',
    'Monto Facturado':                Number(t.montoFacturado ?? 0),
    'ITBIS Facturado':                Number(t.itbis ?? 0),
    'ITBIS Retenido Terceros':        0,
    'Retención Renta por Terceros':   0,
    'ISR Percibido':                  0,
    'Impuesto Selectivo al Consumo':  0,
    'Otros Impuestos/Tasas':          0,
    'Monto Propina Legal':            0,
    'Efectivo':                       Number(t.efectivo ?? 0),
    'Cheque/Transferencia/Depósito':  Number(t.transferencia ?? 0),
    'Tarjeta Débito/Crédito':         Number(t.tarjeta ?? 0),
    'Venta a Crédito':                Number(t.credito ?? 0),
    'Bonos o Certificados de Regalo': 0,
    'Permuta':                        0,
    'Otras Formas de Ventas':         0,
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

  await exportarExcel(filas, `Inventario-${hoyRD()}`);
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
    { 'Campo': 'Fecha',      'Valor': fecha(conteo.fechaGeneracion) },
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

// ── Exportar conciliación fiscal 606 vs IR-2 (Fase 3) ────────────────────────
// Herramienta de control interno, no un veredicto de DGII: el archivo solo
// documenta qué dos números no coinciden y de qué se compone la diferencia,
// con la misma etiqueta CONFIRMADA/CONCEPTUAL y las mismas 4 alertas
// preventivas que la pantalla. 4 hojas: Conciliación, Correspondencias,
// Alertas, Anexo J.
export async function exportarConciliacion606IR2(data: any, anio: number) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Conciliación por tipo de gasto 606 ──
  const filasConciliacion = (data?.filasPorTipo ?? []).map((f: any) => ({
    'Código 606':               f.codigo606,
    'Tipo de bien/servicio':    f.labelTipoBienes,
    'Casilla IR-2':             f.correspondencia?.casillaIR2 ?? 'Sin casilla identificada',
    'Anexo':                    f.correspondencia?.anexoIR2 ?? '—',
    'Marca':                    f.correspondencia?.confirmada ? 'CONFIRMADA (instructivo IR-2)' : 'CONCEPTUAL (criterio, a confirmar)',
    'Total 606 (clasificado)':  Number(f.total606?.valor ?? 0),
    'Cant. líneas 606':         Number(f.total606?.cantidad ?? 0),
    'Total IR-2 — con NCF':     Number(f.totalIR2ConNCF?.valor ?? 0),
    'Total IR-2 — sin NCF':     Number(f.totalIR2SinNCF?.valor ?? 0),
    'Diferencia (IR-2 con NCF − 606)': Number(f.diferencia ?? 0),
  }));
  filasConciliacion.push({
    'Código 606': 'TOTALES', 'Tipo de bien/servicio': '', 'Casilla IR-2': '', 'Anexo': '', 'Marca': '',
    'Total 606 (clasificado)':        Number(data?.totales?.total606 ?? 0),
    'Cant. líneas 606':                '' as any,
    'Total IR-2 — con NCF':            Number(data?.totales?.totalIR2ConNCF ?? 0),
    'Total IR-2 — sin NCF':            Number(data?.totales?.totalIR2SinNCF ?? 0),
    'Diferencia (IR-2 con NCF − 606)': Number(data?.totales?.diferencia ?? 0),
  });
  const wsConc = XLSX.utils.json_to_sheet(filasConciliacion);
  wsConc['!cols'] = Object.keys(filasConciliacion[0] ?? {}).map(k => ({
    wch: Math.max(k.length, ...filasConciliacion.map((r: any) => String(r[k] ?? '').length)) + 2,
  }));
  XLSX.utils.book_append_sheet(wb, wsConc, 'Conciliación');

  // ── Hoja 2: Alertas preventivas ──
  const alertas = data?.alertas ?? {};
  const filasAlertas: Record<string, any>[] = [];
  filasAlertas.push({ 'Alerta': 'Meses sin TXT 606 generado', 'Detalle': (alertas.mesesSinTxtGenerado ?? []).join(', ') || 'Ninguno', 'Monto': '' });
  (alertas.comprasSinRevisar ?? []).forEach((c: any) => filasAlertas.push({
    'Alerta': 'Compra con clasificación 606 por defecto, sin revisar', 'Detalle': `${c.folio ?? c.id} — ${c.proveedor} (${c.fecha})`, 'Monto': Number(c.total),
  }));
  (alertas.gastosSinComprobante ?? []).forEach((g: any) => filasAlertas.push({
    'Alerta': 'Gasto contabilizado sin comprobante que debería tenerlo', 'Detalle': `${g.descripcion} (${g.fecha})`, 'Monto': Number(g.total),
  }));
  (alertas.cuentasSinEtiquetaConSaldo ?? []).forEach((c: any) => filasAlertas.push({
    'Alerta': 'Cuenta con saldo en el ejercicio y sin etiqueta fiscal', 'Detalle': `${c.codigo} — ${c.nombre}`, 'Monto': Number(c.saldo),
  }));
  if (filasAlertas.length === 1) filasAlertas.push({ 'Alerta': 'Sin alertas adicionales', 'Detalle': '', 'Monto': '' });
  const wsAlertas = XLSX.utils.json_to_sheet(filasAlertas);
  wsAlertas['!cols'] = [{ wch: 45 }, { wch: 50 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsAlertas, 'Alertas');

  // ── Hoja 3: Anexo J — cantidad y monto por tipo de comprobante ──
  const filasAnexoJ = (data?.anexoJ ?? []).map((r: any) => ({
    'Tipo de comprobante': r.tipoComprobante,
    'Cantidad':            Number(r.cantidad),
    'Monto recibido':      Number(r.monto),
  }));
  const wsJ = XLSX.utils.json_to_sheet(filasAnexoJ.length ? filasAnexoJ : [{ 'Tipo de comprobante': 'Sin comprobantes clasificados', 'Cantidad': '', 'Monto recibido': '' }]);
  wsJ['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsJ, 'Anexo J');

  XLSX.writeFile(wb, `Conciliacion-606-IR2-${anio}.xlsx`);
}

// ── Exportar Anexo A1 del IR-2 — Balance General (Fase 4 Bloque B) ──────────
// Herramienta de control interno: el propio anexo marca qué líneas trae
// el ERP con datos reales y cuáles quedan en cero para llenado manual —
// el Excel conserva esa misma distinción, nunca inventa un valor.
export async function exportarAnexoA1(data: any, fechaCorte: string) {
  const filas: Record<string, any>[] = [];
  const seccion = (titulo: string, cuentas: any[]) => {
    filas.push({ 'Casilla': titulo.toUpperCase(), 'Código': '', 'Cuenta': '', 'Saldo': '' });
    cuentas.forEach((c: any) => filas.push({
      'Casilla': c.casillaIR2 ?? '— sin casilla —', 'Código': c.codigo, 'Cuenta': c.nombre, 'Saldo': Number(c.saldo),
    }));
  };

  seccion('Activo corriente', data?.activo?.corriente?.cuentas ?? []);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'Total activo corriente', 'Saldo': Number(data?.activo?.corriente?.total ?? 0) });
  seccion('Activo no corriente', data?.activo?.noCorriente?.cuentas ?? []);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'Total activo no corriente', 'Saldo': Number(data?.activo?.noCorriente?.total ?? 0) });
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'TOTAL ACTIVO', 'Saldo': Number(data?.activo?.total ?? 0) });

  seccion('Pasivo corriente', data?.pasivo?.corriente?.cuentas ?? []);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'Total pasivo corriente', 'Saldo': Number(data?.pasivo?.corriente?.total ?? 0) });
  seccion('Pasivo no corriente', data?.pasivo?.noCorriente?.cuentas ?? []);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'Total pasivo no corriente', 'Saldo': Number(data?.pasivo?.noCorriente?.total ?? 0) });
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'TOTAL PASIVO', 'Saldo': Number(data?.pasivo?.total ?? 0) });

  seccion('Patrimonio', data?.patrimonio?.cuentas ?? []);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'TOTAL PATRIMONIO', 'Saldo': Number(data?.patrimonio?.total ?? 0) });

  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': '', 'Saldo': '' });
  filas.push({ 'Casilla': 'LÍNEAS DE LLENADO MANUAL — el ERP no las registra', 'Código': '', 'Cuenta': '', 'Saldo': '' });
  (data?.lineasLlenadoManual ?? []).forEach((l: any) => filas.push({
    'Casilla': '', 'Código': '', 'Cuenta': `${l.concepto} — ${l.motivo}`, 'Saldo': 0,
  }));

  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': '', 'Saldo': '' });
  filas.push({
    'Casilla': 'Ecuación contable', 'Código': '',
    'Cuenta': data?.totales?.cuadrado ? 'Cuadra (Activo = Pasivo + Patrimonio)' : `No cuadra — diferencia ${data?.totales?.ecuacion}`,
    'Saldo': Number(data?.totales?.ecuacion ?? 0),
  });

  await exportarExcel(filas, `Anexo-A1-IR2-${fechaCorte}`);
}

// ── Exportar Anexo B1 del IR-2 — Estado de Resultados (Fase 4 Bloque C) ──────
// El ISR estimado NO se incluye a propósito (se calcula sobre renta
// imponible fiscal, no utilidad contable) — el Excel deja la misma nota
// explícita que la pantalla, no lo omite en silencio.
export async function exportarAnexoB1(data: any, desde: string, hasta: string) {
  const filas: Record<string, any>[] = [];
  const seccion = (titulo: string, cuentas: any[], total: number) => {
    filas.push({ 'Casilla': titulo.toUpperCase(), 'Código': '', 'Cuenta': '', 'Monto': '' });
    cuentas.forEach((c: any) => filas.push({
      'Casilla': c.casillaIR2 ?? '— sin casilla —', 'Código': c.codigo, 'Cuenta': c.nombre, 'Monto': Number(c.saldo),
    }));
    filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': `Total ${titulo.toLowerCase()}`, 'Monto': Number(total) });
  };

  seccion('Ingresos', data?.ingresos?.cuentas ?? [], data?.ingresos?.total ?? 0);
  seccion('Costos', data?.costos?.cuentas ?? [], data?.costos?.total ?? 0);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'UTILIDAD BRUTA', 'Monto': Number(data?.resultados?.utilidadBruta ?? 0) });
  seccion('Gastos', data?.gastos?.cuentas ?? [], data?.gastos?.total ?? 0);
  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': 'UTILIDAD NETA', 'Monto': Number(data?.resultados?.utilidadNeta ?? 0) });

  filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': '', 'Monto': '' });
  filas.push({
    'Casilla': 'ISR', 'Código': '', 'Monto': '',
    'Cuenta': 'NO incluido — ' + (data?.isr?.motivo ?? 'se calcula sobre renta imponible fiscal, no sobre utilidad contable'),
  });

  const alertaVentas = data?.alertas?.ventasSinHistorialCosto;
  if (alertaVentas) {
    filas.push({ 'Casilla': '', 'Código': '', 'Cuenta': '', 'Monto': '' });
    filas.push({ 'Casilla': 'ALERTA — Ventas sin historial de costo', 'Código': '', 'Cuenta': alertaVentas.nota, 'Monto': Number(alertaVentas.montoAfectado ?? 0) });
    (alertaVentas.facturas ?? []).forEach((f: any) => filas.push({
      'Casilla': '', 'Código': f.folio, 'Cuenta': `${f.fecha} — ${f.lineasSinCosto} línea(s) sin costo`, 'Monto': Number(f.monto),
    }));
  }

  await exportarExcel(filas, `Anexo-B1-IR2-${desde}_a_${hasta}`);
}

// ── Exportar Anexo D del IR-2 — Costo de Venta (Fase 4 Bloque D) ────────────
// Inventario inicial/final y compras totales son datos reales; el reparto
// Local/Exterior e ITBIS Llevado al Costo el ERP no los calcula — el Excel
// los deja en cero con su motivo, igual que la pantalla.
export async function exportarAnexoD(data: any, anio: number) {
  const filas: Record<string, any>[] = [];

  filas.push({ 'Concepto': 'INVENTARIO INICIAL', 'Detalle': data?.inventarioInicial?.procedencia ?? '', 'Monto': Number(data?.inventarioInicial?.total ?? 0) });
  (data?.inventarioInicial?.cuentas ?? []).forEach((c: any) => filas.push({ 'Concepto': `  ${c.codigo} — ${c.nombre}`, 'Detalle': c.casillaIR2 ?? '', 'Monto': Number(c.saldo) }));

  filas.push({ 'Concepto': 'COMPRAS TOTALES DEL EJERCICIO', 'Detalle': data?.compras?.procedencia ?? '', 'Monto': Number(data?.compras?.totalPeriodo ?? 0) });
  filas.push({ 'Concepto': '  Con gasto de importación asociado (proxy, no oficial)', 'Detalle': '', 'Monto': Number(data?.compras?.conGastoImportacionAsociado ?? 0) });

  filas.push({ 'Concepto': 'INVENTARIO FINAL', 'Detalle': data?.inventarioFinal?.procedencia ?? '', 'Monto': Number(data?.inventarioFinal?.total ?? 0) });
  (data?.inventarioFinal?.cuentas ?? []).forEach((c: any) => filas.push({ 'Concepto': `  ${c.codigo} — ${c.nombre}`, 'Detalle': c.casillaIR2 ?? '', 'Monto': Number(c.saldo) }));

  filas.push({ 'Concepto': '', 'Detalle': '', 'Monto': '' });
  filas.push({ 'Concepto': 'COSTO DE VENTA CALCULADO', 'Detalle': data?.costoVentaCalculado?.formula ?? '', 'Monto': Number(data?.costoVentaCalculado?.valor ?? 0) });
  filas.push({ 'Concepto': '', 'Detalle': data?.costoVentaCalculado?.nota ?? '', 'Monto': '' });

  filas.push({ 'Concepto': '', 'Detalle': '', 'Monto': '' });
  filas.push({ 'Concepto': 'LÍNEAS DE LLENADO MANUAL — el ERP no las registra', 'Detalle': '', 'Monto': '' });
  (data?.lineasLlenadoManual ?? []).forEach((l: any) => filas.push({ 'Concepto': l.concepto, 'Detalle': l.motivo, 'Monto': 0 }));

  filas.push({ 'Concepto': '', 'Detalle': '', 'Monto': '' });
  filas.push({ 'Concepto': 'ADVERTENCIA', 'Detalle': data?.advertencias?.saldoAperturaInventario ?? '', 'Monto': '' });

  await exportarExcel(filas, `Anexo-D-IR2-${anio}`);
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
