#!/usr/bin/env node
/**
 * API falsa en :3000 para trabajar el frontend SIN backend.
 *
 *   npm run dev:mock     (en una terminal)
 *   npm run dev          (en otra)
 *
 * Para qué sirve: capturar una pantalla antes de pushearla, que es la regla de
 * la casa para cualquier cambio visual. Sin esto hay que levantar el backend
 * real, y eso NO se hace nunca contra la base de producción: `ScheduleModule
 * .forRoot()` no está condicionado y los crones de e-CF mandarían comprobantes
 * de verdad a la DGII.
 *
 * ── LAS TRES TRAMPAS, que costaron dos sesiones enteras ─────────────────────
 *
 * 1. CORS CON CREDENCIALES. `.env` trae
 *    `VITE_API_URL=http://localhost:3000/api/v1`, o sea que axios va
 *    CROSS-ORIGIN directo al :3000 y NO pasa por el proxy de Vite. Y el cliente
 *    va con `withCredentials: true`, así que `Access-Control-Allow-Origin: *`
 *    está PROHIBIDO por la especificación: hay que devolver el origen exacto y
 *    `Access-Control-Allow-Credentials: true`.
 *
 *    Cómo se manifiesta: el servidor registra la petición y responde 200, pero
 *    el navegador bloquea la respuesta. Axios ve un error de red SIN `response`,
 *    la hidratación de sesión falla, llama a `logout()` y acabas en /login una y
 *    otra vez creyendo que el problema es el login. Con `fetch()` a mano
 *    funciona —va por el proxy, mismo origen— lo que despista todavía más.
 *
 *    La misma regla vale para `Access-Control-Allow-Headers`: tampoco puede ser
 *    '*'. Y salta en cuanto hay `empresaId` en localStorage, porque entonces el
 *    interceptor añade `X-Empresa-ID`, eso obliga a un preflight OPTIONS y el
 *    síntoma vuelve idéntico. Por eso se hace eco de
 *    `Access-Control-Request-Headers`.
 *
 * 2. EL PREFIJO ES /api/v1, no /api.
 *
 * 3. GET /auth/2fa/status DEVUELVE `{ enabled }`. El panel de super admin está
 *    detrás de `SetupTwoFactorGate`, que mira exactamente ese campo: cualquier
 *    otra forma deja la pantalla de "configura el segundo factor".
 *
 * 4. TODA respuesta va envuelta en `{ data: ... }`, como hace el backend real —
 *    por eso el cliente escribe `r.data.data` por todas partes. Devolver el
 *    objeto pelado deja las pantallas VACÍAS sin un solo error en consola: la
 *    petición sale 200 y el componente recibe `undefined`.
 *
 * ── Y la sesión ────────────────────────────────────────────────────────────
 *
 * El token vive en cookie httpOnly, así que no se puede sembrar desde JS. Lo
 * que sí lee el store al arrancar es `localStorage.auth_user`. En la consola
 * del navegador, antes de entrar:
 *
 *   localStorage.setItem('auth_user', JSON.stringify({
 *     id: 1, nombre: 'Dev', email: 'dev@hicloudrd.com',
 *     role: 'super_admin', isActive: true,
 *   }));
 *
 * `role` decide a qué llegas: 'super_admin' para /super-admin, 'admin' para el
 * ERP normal. Después, recargar.
 *
 * Variables:
 *   ROL=admin     ERP normal (por defecto super_admin → panel de administración)
 *   ECF=over      el PlanBanner pinta "superaste los incluidos" (por defecto, el 80%)
 *   PRECIO=0      deja el precio del excedente sin configurar (el estado de hoy)
 *   PORT=3000
 *
 * Ejemplos:
 *   ROL=admin ECF=over npm run dev:mock
 *   PRECIO=0 npm run dev:mock
 */
import http from 'http';

const PORT   = Number(process.env.PORT   ?? 3000);
const PRECIO = Number(process.env.PRECIO ?? 3);

// El rol manda: /auth/me PISA lo que haya en localStorage.auth_user, porque la
// hidratación se queda con el usuario que devuelve el servidor. Así que para
// ver el ERP normal no basta con sembrar 'admin' en el navegador — hay que
// arrancar el mock con ROL=admin.
const ROL = process.env.ROL ?? 'super_admin';

const USER = {
  id: 1, nombre: 'Dev', email: 'dev@hicloudrd.com',
  role: ROL, isActive: true, temaSidebar: 'light',
};

const PLANES = [
  { clave: 'emprendedor', nombre: 'Emprendedor', precioMensual: 1700, activo: true },
  { clave: 'pyme',        nombre: 'Pyme',        precioMensual: 3500, activo: true },
  { clave: 'pro',         nombre: 'Pro',         precioMensual: 5200, activo: true },
  { clave: 'plus',        nombre: 'Plus',        precioMensual: 7600, activo: true },
];

const EXCEDENTES = [
  { empresaId: 44, empresa: 'Ventas Populares R&M', plan: 'plus', planNombre: 'Plus',
    ciclo: { inicio: '2026-07-05', fin: '2026-08-05' },
    emitidos: 6412, cupo: 6000, excedente: 412,
    precioUnitario: PRECIO, monto: +(412 * PRECIO).toFixed(2) },
  { empresaId: 52, empresa: 'REPUESTOS CRANCHA SRL', plan: 'pyme', planNombre: 'Pyme',
    ciclo: { inicio: '2026-07-05', fin: '2026-08-05' },
    emitidos: 1030, cupo: 1000, excedente: 30,
    precioUnitario: PRECIO, monto: +(30 * PRECIO).toFixed(2) },
];

/**
 * Rutas SIN el prefijo /api/v1. Lo que no esté aquí devuelve [] y sale como
 * "SIN MOCK" en el log: así se ve de un vistazo qué le falta a la pantalla.
 */
let publicado = false;

const RUTAS = {
  '/version':               () => ({ version: 'dev' }),
  // El backend real devuelve el usuario dentro de `user`, y la hidratación lo
  // busca como `r.data?.data?.user ?? r.data?.user ?? r.data`.
  '/auth/me':               () => ({ user: USER }),
  '/auth/stats-plataforma': () => ({ empresas: 11, facturas: 14628 }),
  // OJO: el campo es `enabled`. Ver la trampa 3 de arriba.
  '/auth/2fa/status':       () => ({ enabled: true }),

  '/admin/planes':               () => PLANES,
  '/admin/cobros/configuracion': () => ({
    precioEcfExcedente: PRECIO, actualizadoPor: 1, updatedAt: new Date().toISOString(),
  }),
  '/admin/metricas':             () => ({ empresas: 11, usuarios: 34, facturas: 14628, mrrDop: 52300 }),
  '/admin/contadores':           () => ({ solicitudesPendientes: 0, registrosPendientes: 0, comprobantesPendientes: 0 }),
  '/admin/configuracion-global': () => [],
  '/admin/empresas':             () => [],
  '/admin/usuarios':             () => [],
  '/admin/suscripciones':        () => [],
  '/admin/modulos':              () => [],
  '/admin/modulos/activaciones': () => [],
  '/admin/backups':              () => ({ items: [], total: 0 }),
  '/admin/registros-pendientes': () => [],
  '/admin/empresas-pendientes-aprobacion': () => [],
  '/auditoria/modulos':          () => [],
  '/suscripciones/admin/pruebas':     () => [],
  '/suscripciones/admin/solicitudes': () => [],
  '/suscripciones/planes':       () => PLANES,
  '/suscripciones/mi-plan':      () => ({ plan: 'plus', estado: 'activa', diasRestantes: 20 }),

  // ECF=80 (por defecto) pinta el aviso del 80% en el PlanBanner.
  // ECF=over pinta el de "superaste los incluidos".
  '/suscripciones/mis-limites':  () => {
    const cupo     = 6000;
    const emitidos = (process.env.ECF ?? '80') === 'over' ? 6412 : 4900;
    const suelto   = { usado: 0, limite: -1, ilimitado: true, porcentaje: 0, alerta: false, alertaRoja: false, bloqueado: false };
    return {
      plan: 'plus', planNombre: 'Plus',
      ingresos: {
        ingresosMes: 100000, limite: 6250000, ilimitado: false, porcentaje: 2,
        alerta80: false, alerta95: false, bloqueado: false, enPeriodoGracia: false,
        planNombre: 'Plus', planCodigo: 'plus',
      },
      facturas: suelto, productos: suelto, clientes: suelto, sucursales: suelto,
      usuarios: { usado: 4, limite: 10, ilimitado: false, porcentaje: 40, alerta: false, alertaRoja: false, bloqueado: false },
      ecf: {
        emitidos, cupo, ilimitado: false,
        porcentaje: Math.round((emitidos / cupo) * 100),
        excedente: Math.max(0, emitidos - cupo),
        alerta:   emitidos >= cupo * 0.8,
        excedida: emitidos > cupo,
        ciclo: { inicio: '2026-08-05', fin: '2026-09-05' }, cicloCerrado: false,
        plan: 'plus', planNombre: 'Plus',
      },
      modulos: ['*'],
    };
  },

  '/admin/pagos-suscripcion':                         () => [],
  '/admin/pagos-suscripcion/excedentes-ecf':          () => EXCEDENTES,
  '/admin/pagos-suscripcion/comprobantes-pendientes': () => [],
  '/admin/pagos-suscripcion/config-bancaria':         () => ({ banco: 'Popular', cuenta: '000', activo: true }),
  // ── Lo mínimo para abrir un formulario de venta (cotización, factura…) ────
  // Sin esto la ruta cae al `[]` de abajo y los selectores salen vacíos: la
  // pantalla se ve, pero no se puede capturar con datos dentro.
  '/clientes': () => ({
    data: [
      { id: 1, nombre: 'FERRETERÍA LA ECONÓMICA', rfc: '131234567', rncCompartido: false },
      { id: 2, nombre: 'DISTRIBUIDORA DEL ESTE',  rfc: '130987654', rncCompartido: false },
      { id: 3, nombre: 'ESCUELA BÁSICA LOS ALCARRIZOS #3', rfc: '401500123', razonSocial: 'DISTRITO EDUCATIVO 10-04', direccion: 'C/ Duarte 12', ciudad: 'Los Alcarrizos', rncCompartido: true },
      { id: 4, nombre: 'ESCUELA BÁSICA LOS ALCARRIZOS #7', rfc: '401500123', razonSocial: 'DISTRITO EDUCATIVO 10-04', direccion: 'C/ Mella 45', ciudad: 'Los Alcarrizos', rncCompartido: true },
    ],
    meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
  }),
  // ── Recibos de Cobro — un par REC/RDP agrupado (con pagoNumero vinculado),
  //    un REC revertido (isActive=false, marcado "Revertido") y un RDP puro
  //    de Cuentas por Cobrar (origen 'pago'), para capturar los tres casos
  //    del fix 2026-09-22 sin volver a duplicar el cobro en pantalla.
  '/recibos-cobro/resumen': () => ({
    hoy:   { total: 1750.70, cantidad: 1 },
    mes:   { total: 9403.79 },
    total: { total: 30903.79, cantidad: 3 },
  }),
  '/recibos-cobro': () => ({
    data: [
      { origen: 'recibo', id: 55, numero: 'REC-102', fecha: '2026-09-18', clienteId: 40, clienteNombre: 'Consumidor Final',
        metodoPago: 'efectivo', monto: 1750.70, concepto: 'Pago de factura FAC-9595', facturaFolio: 'FAC-9595',
        cajaDiariaId: null, nombreUsuario: 'Jean Contador', moneda: 'DOP', isActive: true, pagoNumero: 'RDP-00060' },
      { origen: 'recibo', id: 14, numero: 'REC-101', fecha: '2026-08-04', clienteId: 41, clienteNombre: 'GRUPO SUS SRL',
        metodoPago: 'efectivo', monto: 7500.00, concepto: 'Pago de factura FAC-7792', facturaFolio: 'FAC-7792',
        cajaDiariaId: null, nombreUsuario: 'Jean Contador', moneda: 'DOP', isActive: false, pagoNumero: 'RDP-00027' },
      { origen: 'pago', id: 99, numero: 'RDP-00099', fecha: '2026-08-01', clienteId: 42, clienteNombre: 'MERCADAL SAS',
        metodoPago: 'transferencia', monto: 21653.09, concepto: 'Cobro sobre factura FAC-6559', facturaFolio: 'FAC-6559',
        cajaDiariaId: null, nombreUsuario: 'Jean Contador', moneda: 'DOP', isActive: true, pagoNumero: null },
    ],
    meta: { total: 3, page: 1, limit: 10, totalPages: 1 },
  }),
  '/productos': () => ({
    data: [
      { id: 1, codigo: 'ACE-10W40', nombre: 'Aceite REPSOL 10W40', precio: 950,  porcentajeIva: 18, unidadMedida: 'UN' },
      { id: 2, codigo: 'FIL-17801', nombre: 'Filtro de aire 17801-23030', precio: 1250, porcentajeIva: 18, unidadMedida: 'UN' },
      { id: 3, codigo: 'SRV-MO',    nombre: 'Mano de obra', precio: 3500, porcentajeIva: 18, unidadMedida: 'HR' },
      { id: 4, codigo: 'LIB-001',   nombre: 'Manual técnico (exento)', precio: 800, porcentajeIva: 0, unidadMedida: 'UN' },
    ],
    meta: { total: 4, page: 1, limit: 5000, totalPages: 1 },
  }),
  '/clientes/rnc/401500123': () => ({
    rnc: '401500123', total: 2,
    clientes: [
      { id: 3, nombre: 'ESCUELA BÁSICA LOS ALCARRIZOS #3', razonSocial: 'DISTRITO EDUCATIVO 10-04', rfc: '401500123', direccion: 'C/ Duarte 12', ciudad: 'Los Alcarrizos', telefono: '809-555-0103' },
      { id: 4, nombre: 'ESCUELA BÁSICA LOS ALCARRIZOS #7', razonSocial: 'DISTRITO EDUCATIVO 10-04', rfc: '401500123', direccion: 'C/ Mella 45', ciudad: 'Los Alcarrizos', telefono: '809-555-0107' },
    ],
  }),
  // El POS pide su catalogo por aqui, no por /productos
  '/productos/catalogo-pos': () => ([
    { id: 1, codigo: 'ACE-10W40', nombre: 'Aceite REPSOL 10W40', precio: 950,  porcentajeIva: 18, unidadMedida: 'UN', stock: 50, categoria: 'Lubricantes' },
    { id: 2, codigo: 'FIL-17801', nombre: 'Filtro de aire',       precio: 1250, porcentajeIva: 18, unidadMedida: 'UN', stock: 30, categoria: 'Filtros' },
    { id: 4, codigo: 'LIB-001',   nombre: 'Manual tecnico',       precio: 800,  porcentajeIva: 0,  unidadMedida: 'UN', stock: 10, categoria: 'Otros' },
  ]),
  '/vendedores/mi-perfil': () => ({ id: 7, codigo: 'V01', nombre: 'JUAN PEREZ', activo: true }),
  '/sucursales': () => ([{ id: 1, nombre: 'Sucursal Principal', esPrincipal: true }]),
  '/balanza/patrones': () => ([]),
  '/vendedores': () => ({ data: [{ id: 7, codigo: 'V01', nombre: 'JUAN PÉREZ' }] }),
  '/auth/mis-sucursales': () => ([{ id: 1, nombre: 'Sucursal Principal' }]),
  // Mensajes: arranca SIN nada pendiente. Los PATCH (marcarVisto, etc.) los
  // acepta el handler generico de escrituras mas abajo.
  // ?solo=aviso devuelve el aviso operativo; sin query, la novedad.
  // /dev/publicar simula la publicacion del Super Admin: hasta que se llama,
  // no hay nada pendiente. Asi se captura el ANTES y el DESPUES del evento.
  '/mensajes/no-vistos': (q) => ({
    ids: !publicado ? []
       : q?.solo === 'aviso' ? ['mock-av-1']
       : ['mock-msg-1'],
  }),
  '/dev/publicar': () => { publicado = true;  return { ok: true }; },
  '/dev/retirar':  () => { publicado = false; return { ok: true }; },
  '/mensajes/no-leidos-count':     () => ({ count: 1 }),
  // Filtra por tab como el backend: sin esto el mismo mensaje sale en las dos
  // pestañas y el notificador lo cuenta dos veces.
  '/mensajes/bandeja': (q) => (q?.tab === 'principal' ? [
    {
      id: 'mock-av-1',
      titulo: 'Interrupción temporal del servicio',
      cuerpo: 'El sistema estuvo inaccesible entre 2:10 y 2:35 a. m. por mantenimiento del proveedor. Ya está restablecido.',
      tipo: 'aviso',
      fechaPublicacion: new Date().toISOString(),
      editadoEn: null, leidoEn: null, vistoEn: null, archivadoEn: null,
    },
  ] : [
    {
      id: 'mock-msg-1',
      titulo: 'Nueva función: Notificaciones en tiempo real',
      cuerpo: 'A partir de hoy recibirás avisos importantes de HiCloud directamente en la pantalla, sin tener que revisar la bandeja manualmente.',
      tipo: 'novedad',
      fechaPublicacion: new Date().toISOString(),
      editadoEn: null, leidoEn: null, vistoEn: null, archivadoEn: null,
    },
  ]),

  '/admin/pagos-suscripcion/resumen-cobros':          () => ([
    { empresaId: 44, nombre: 'Ventas Populares R&M', email: 'cliente@ejemplo.com',
      plan: 'plus', estadoSuscripcion: 'activa', modalidad: 'mensual', diaCorte: 5,
      venceSuscripcion: '2026-10-05', precioMensual: 7600, saldo: 0,
      ultimoPago: null, pendientesConfirmacion: 0 },
  ]),

  // ── Órdenes de Compra — para capturar el modal "Recibir Mercancía" sin
  //    tocar el backend real (RecibirMercanciaModal, compartido entre
  //    /compras y el POS). 101 = enviada (recepción completa), 102 =
  //    parcial (para ver "Completar recepción" con lo ya recibido).
  '/compras': () => ({
    data: [
      { id: 101, folio: 'COM-00101', fecha: '2026-09-08', estado: 'enviada',
        proveedor: { id: 1, nombre: 'VALDEZ GONZÁLEZ OUTSOURCING SRL', rnc: '131234567' },
        proveedorId: 1, subtotal: 800, itbis: 144, total: 944, moneda: 'DOP', tipoPago: 'credito' },
      { id: 102, folio: 'COM-00102', fecha: '2026-09-05', estado: 'recibida_parcial',
        proveedor: { id: 2, nombre: 'DISTRIBUIDORA DEL ESTE SRL', rnc: '130987654' },
        proveedorId: 2, subtotal: 1000, itbis: 180, total: 1180, moneda: 'DOP', tipoPago: 'credito' },
    ],
    meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
  }),
  '/compras/101': () => ({
    id: 101, folio: 'COM-00101', fecha: '2026-09-08', estado: 'enviada',
    proveedor: { id: 1, nombre: 'VALDEZ GONZÁLEZ OUTSOURCING SRL', rnc: '131234567' },
    proveedorId: 1, subtotal: 800, itbis: 144, total: 944, moneda: 'DOP', tipoPago: 'credito',
    detalles: [
      { id: 1001, productoId: 2, producto: { id: 2, nombre: 'PRODUCTO DE PRUEBA 2' },
        descripcion: 'PRODUCTO DE PRUEBA 2', precioUnitario: 400, cantidad: 2, cantidadTotal: 2,
        cantidadRecibida: null, porcentajeItbis: 18, subtotal: 800, importeItbis: 144, total: 944 },
    ],
  }),
  // Para probar el clic-a-Libro-Mayor desde Estado de Resultados/Balance
  // General sin backend: los mismos códigos que usa el mock de arriba.
  '/contabilidad/cuentas': () => ({
    data: [
      { id: 401, codigo: '4.1.1.01', nombre: 'Ventas de Bienes' },
      { id: 501, codigo: '5.1.1.01', nombre: 'Costo de Ventas de Bienes' },
      { id: 611, codigo: '6.1.1.01', nombre: 'Sueldos y Salarios' },
      { id: 612, codigo: '6.1.2.01', nombre: 'Alquiler' },
    ],
    meta: { total: 4, page: 1, limit: 5000, totalPages: 1 },
  }),
  // ── Asientos Contables — para capturar el fix del cajón de detalle
  //    (2026-09-21): la lista nunca trae líneas (por diseño, no se cargan
  //    10 asientos completos por página), el detalle sí las trae. Antes el
  //    cajón reusaba la fila de la lista → tabla de líneas siempre vacía.
  '/contabilidad/asientos': () => ({
    data: [
      { id: 999, numero: 'ASI-15680', fecha: '2026-09-21', descripcion: 'Venta según factura FAC-15514',
        tipoOrigen: 'factura', referenciaFolio: 'FAC-15514', totalDebe: 1749.75, totalHaber: 1749.75, estado: 'contabilizado' },
      { id: 998, numero: 'ASI-15679', fecha: '2026-09-21', descripcion: 'Venta según factura FAC-15513',
        tipoOrigen: 'factura', referenciaFolio: 'FAC-15513', totalDebe: 850, totalHaber: 850, estado: 'contabilizado' },
    ],
    meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
  }),
  '/contabilidad/asientos/999': () => ({
    id: 999, numero: 'ASI-15680', fecha: '2026-09-21', descripcion: 'Venta según factura FAC-15514',
    tipoOrigen: 'factura', referenciaFolio: 'FAC-15514', totalDebe: 1749.75, totalHaber: 1749.75, estado: 'contabilizado',
    lineas: [
      { id: 1, descripcion: 'Cobro efectivo FAC-15514', debe: 1749.75, haber: 0, cuentaContable: { codigo: '1.1.1.02', nombre: 'Caja General' } },
      { id: 2, descripcion: 'Ingreso por venta FAC-15514', debe: 0, haber: 1483.69, cuentaContable: { codigo: '4.1.1.01', nombre: 'Ventas de Bienes' } },
      { id: 3, descripcion: 'ITBIS débito fiscal FAC-15514', debe: 0, haber: 266.06, cuentaContable: { codigo: '2.1.2.01', nombre: 'ITBIS por Pagar' } },
    ],
  }),
  // ── Balance General v2 — una cuenta por sección, ACTIVO = PASIVO + PATRIMONIO
  //    cuadrado, para capturar el árbol y el banner de la ecuación contable.
  '/reportes-financieros/balance-general-detallado': (q) => {
    const nodo = (codigo, nombre, tipo, monto) => ({
      codigo, nombre, nivel: 1, tipo, esCuentaGrupo: false, monto, porcentajeVertical: 100, hijos: [],
    });
    return {
      fechaCorte: q?.fechaCorte ?? '2026-09-21',
      filtros: { compararCon: q?.compararCon ?? 'ninguno', nivelDetalle: q?.nivelDetalle ?? '2', ocultarCuentasEnCero: true },
      activo: { nodos: [nodo('1.1.1.02', 'Caja General', 'activo', 300000)], total: 300000 },
      pasivo: { nodos: [nodo('2.1.1.01', 'Proveedores', 'pasivo', 80000)], total: 80000 },
      patrimonio: {
        nodos: [nodo('3.1.1.01', 'Capital Social', 'patrimonio', 135000)],
        total: 220000,
        calculadas: {
          resultadoDelEjercicio: { desde: '2026-01-01', hasta: '2026-09-21', monto: 85000 },
          resultadosAcumulados:  { hasta: '2026-09-21', monto: 0 },
        },
      },
      diferenciaAsientosDescuadrados: { total: 0, cantidad: 0 },
      totales: { activos: 300000, pasivosPatrimonio: 300000, ecuacion: 0, cuadrado: true },
    };
  },

  // ── Balance de Comprobación — un renglón por naturaleza, cuadrado.
  '/reportes-financieros/balance-comprobacion': (q) => ({
    lineas: [
      { codigo: '1.1.1.02', nombre: 'Caja General', tipo: 'activo', naturaleza: 'deudora', nivel: 1, totalDebe: 300000, totalHaber: 0, saldoDeudor: 300000, saldoAcreedor: 0 },
      { codigo: '2.1.1.01', nombre: 'Proveedores', tipo: 'pasivo', naturaleza: 'acreedora', nivel: 1, totalDebe: 0, totalHaber: 80000, saldoDeudor: 0, saldoAcreedor: 80000 },
      { codigo: '3.1.1.01', nombre: 'Capital Social', tipo: 'patrimonio', naturaleza: 'acreedora', nivel: 1, totalDebe: 0, totalHaber: 220000, saldoDeudor: 0, saldoAcreedor: 220000 },
    ],
    totales: { debe: 300000, haber: 300000, deudor: 300000, acreedor: 300000, cuadra: true },
  }),

  // ── Estado de Resultados v2 — para capturar las 4 vistas de comparación
  //    sin backend. Bloques con 1-2 cuentas cada uno, cifras simples para
  //    verificar de un vistazo que Utilidad Bruta/Resultado Operacional/
  //    Ganancia del Período cuadran.
  '/reportes-financieros/estado-resultados-detallado': (q) => {
    const pct = (monto, base) => base !== 0 ? +((monto / base) * 100).toFixed(1) : 0;
    const periodo = (factor = 1) => {
      const totalIngresos = 500000 * factor;
      const bloque = (nombre, cuentas) => {
        const total = +cuentas.reduce((s, c) => s + c.monto, 0).toFixed(2);
        return {
          nombre, total, porcentajeIngresos: pct(total, totalIngresos),
          cuentas: cuentas.map(c => ({ ...c, porcentajeIngresos: pct(c.monto, totalIngresos) })),
        };
      };
      const ingresos      = bloque('Ingresos', [{ codigo: '4.1.1.01', nombre: 'Ventas de Bienes', monto: totalIngresos }]);
      const costoDeVentas = bloque('Costo de Ventas', [{ codigo: '5.1.1.01', nombre: 'Costo de Ventas de Bienes', monto: 200000 * factor }]);
      const utilidadBruta = ingresos.total - costoDeVentas.total;
      const gastos = bloque('Gastos', [
        { codigo: '6.1.1.01', nombre: 'Sueldos y Salarios', monto: 120000 * factor },
        { codigo: '6.1.2.01', nombre: 'Alquiler', monto: 30000 * factor },
      ]);
      const resultadoOperacional = utilidadBruta - gastos.total;
      const otrosIngresos = bloque('Otros Ingresos', [{ codigo: '4.2.1.03', nombre: 'Intereses Ganados', monto: 5000 * factor }]);
      const otrosGastos   = bloque('Otros Gastos', [{ codigo: '6.1.3.01', nombre: 'Comisiones Bancarias', monto: 2000 * factor }]);
      const gananciaPerdidaDelPeriodo = resultadoOperacional + otrosIngresos.total - otrosGastos.total;
      const linea = (nombre, monto) => ({ nombre, monto: +monto.toFixed(2), porcentajeIngresos: pct(monto, totalIngresos), porcentajeMargen: pct(monto, totalIngresos) });
      return {
        ingresos, costoDeVentas,
        utilidadBruta: linea('Utilidad Bruta', utilidadBruta),
        gastos,
        resultadoOperacional: linea('Resultado Operacional', resultadoOperacional),
        otrosIngresos, otrosGastos,
        gananciaPerdidaDelPeriodo: linea('Ganancia (Pérdida) del Período', gananciaPerdidaDelPeriodo),
      };
    };

    const desde = q?.desde ?? '2026-01-01';
    const hasta = q?.hasta ?? '2026-09-21';
    const comparacion = q?.comparacion ?? 'ninguna';
    const out = { desde, hasta, filtros: { comparacion, ocultarCuentasEnCero: true }, periodo: periodo(1) };

    if (comparacion === 'mes-vs-acumulado') {
      out.acumulado = { desde: `${hasta.slice(0, 4)}-01-01`, hasta, periodo: periodo(6) };
    } else if (comparacion === 'anio-anterior') {
      out.anioAnterior = {
        desde: `${Number(desde.slice(0, 4)) - 1}${desde.slice(4)}`,
        hasta: `${Number(hasta.slice(0, 4)) - 1}${hasta.slice(4)}`,
        periodo: periodo(0.8),
        diferencias: {},
      };
    } else if (comparacion === 'por-mes') {
      const anio = Number(hasta.slice(0, 4));
      const meses = Array.from({ length: 12 }, (_, i) => ({
        mes: i + 1, desde: `${anio}-${String(i + 1).padStart(2, '0')}-01`, hasta: `${anio}-${String(i + 1).padStart(2, '0')}-28`,
        periodo: periodo(i < 9 ? 0.5 + i * 0.05 : 0), // meses futuros del ejercicio en 0
      }));
      out.porMes = { anio, meses, total: periodo(6) };
    }
    return out;
  },

  // ── Flujo de Efectivo v2 — un solo período que CUADRA (Inicio + Cambio Neto
  //    = Final), con un movimiento en cada bloque para ver todas las líneas.
  '/reportes-financieros/flujo-efectivo-detallado': (q) => {
    const bloque = (nombre, lineas) => ({ nombre, lineas, total: +lineas.reduce((s, l) => s + l.monto, 0).toFixed(2) });
    const linea = (nombre, monto, cuentas = []) => ({ nombre, monto, cuentas });

    const operaciones = bloque('Flujo de Efectivo de las Operaciones', [
      linea('Resultado Neto', 85000),
      linea('Depreciaciones del período', 5000, [{ codigo: '6.2.1.03', nombre: 'Depreciación - Equipos', monto: 5000 }]),
      linea('Aumento en Cuentas por Cobrar', -12000, [{ codigo: '1.1.2.01', nombre: 'Clientes', monto: -12000 }]),
      linea('Aumento en Inventarios', -8000, [{ codigo: '1.1.3.01', nombre: 'Mercancías para la Venta', monto: -8000 }]),
      linea('Aumento en Cuentas por Pagar', 6000, [{ codigo: '2.1.1.01', nombre: 'Proveedores', monto: 6000 }]),
      linea('Aumento en Impuestos por Pagar', 3000, [{ codigo: '2.1.2.01', nombre: 'ITBIS por Pagar', monto: 3000 }]),
    ]);
    const inversiones = bloque('Efectivo Neto Generado por Inversiones', [
      linea('Aumento en Propiedades y Equipos', -30000, [{ codigo: '1.2.1.02', nombre: 'Equipos de Cómputo', monto: -30000 }]),
      linea('Aumento en Inversiones', 0),
    ]);
    const financiamientos = bloque('Flujo de Efectivo de los Financiamientos', [
      linea('Aumento en Préstamos', 50000, [{ codigo: '2.2.1.01', nombre: 'Préstamos Bancarios LP', monto: 50000 }]),
      linea('Aumento en Capital', 0),
    ]);
    const cambioNetoEfectivo = +(operaciones.total + inversiones.total + financiamientos.total).toFixed(2);
    const efectivoInicio = 100000;
    const efectivoFin = +(efectivoInicio + cambioNetoEfectivo).toFixed(2);

    const periodo = {
      resultadoNeto: 85000, operaciones, inversiones, financiamientos,
      cambioNetoEfectivo, efectivoInicio, efectivoFin, diferenciaCuadre: 0, cuadrado: true,
    };
    return {
      desde: q?.desde ?? '2026-01-01', hasta: q?.hasta ?? '2026-09-21',
      filtros: { comparacion: q?.comparacion ?? 'ninguna' }, periodo,
    };
  },

  '/compras/102': () => ({
    id: 102, folio: 'COM-00102', fecha: '2026-09-05', estado: 'recibida_parcial',
    proveedor: { id: 2, nombre: 'DISTRIBUIDORA DEL ESTE SRL', rnc: '130987654' },
    proveedorId: 2, subtotal: 1000, itbis: 180, total: 1180, moneda: 'DOP', tipoPago: 'credito',
    detalles: [
      { id: 1002, productoId: 1, producto: { id: 1, nombre: 'Aceite REPSOL 10W40' },
        descripcion: 'Aceite REPSOL 10W40', precioUnitario: 200, cantidad: 5, cantidadTotal: 5,
        cantidadRecibida: 3, porcentajeItbis: 18, subtotal: 1000, importeItbis: 180, total: 1180 },
    ],
  }),
};

const PREFIJO = /^\/api(\/v1)?/;

http.createServer((req, res) => {
  const ruta = req.url.replace(PREFIJO, '').split('?')[0];
  // La query se pasa a la ruta: algunos endpoints filtran por ella (bandeja?tab=)
  const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const hay  = Boolean(RUTAS[ruta]);
  console.log(`${req.method.padEnd(6)} ${ruta.padEnd(48)} ${hay ? 'ok' : 'SIN MOCK'}`);

  res.setHeader('Content-Type', 'application/json');
  // Con `withCredentials: true` el origen NO puede ser '*'. Ver la trampa 1.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Con credenciales, '*' tampoco vale aquí: hay que devolver la lista concreta.
  // Se hace eco de lo que el navegador pide. Salta en cuanto la petición lleva
  // una cabecera propia —`X-Empresa-ID`, que el interceptor añade en cuanto hay
  // `empresaId` en localStorage— porque eso obliga a un preflight OPTIONS que
  // sin esto se cae con el mismo "sin respuesta del servidor".
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ?? 'Content-Type,X-Empresa-ID',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // Las escrituras se aceptan sin hacer nada: sirve para ver el camino feliz de
  // un formulario sin tocar ninguna base de datos.
  if (req.method !== 'GET') { res.writeHead(200); return res.end(JSON.stringify({ data: { ok: true } })); }

  // El backend real envuelve TODA respuesta en `{ data: ... }` —de ahí que el
  // cliente haga `r.data.data` por todas partes—. Un mock que devuelva el
  // objeto pelado deja las pantallas vacías sin un solo error: la petición sale
  // 200, el componente recibe `undefined` y no pinta nada.
  res.writeHead(200);
  res.end(JSON.stringify({ data: hay ? RUTAS[ruta](query) : [] }));
}).listen(PORT, () => {
  console.log(`\n  API falsa en http://localhost:${PORT}  (prefijo /api/v1, precio ${PRECIO})`);
  console.log('  Siembra la sesión en la consola del navegador antes de entrar:\n');
  console.log(`    localStorage.setItem('auth_user', JSON.stringify(${JSON.stringify(USER)}))\n`);
});
