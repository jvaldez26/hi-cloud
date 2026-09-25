/**
 * Dataset de ejemplo — UN solo negocio ficticio ("Ferretería El Progreso")
 * repartido entre todos los widgets del dashboard, para que el conjunto se
 * vea coherente (mismos clientes, mismo proveedor, misma curva de ventas
 * con estacionalidad leve) en vez de números sueltos e inconsistentes por
 * tarjeta. Puramente estático — no toca el backend ni la base de datos; es
 * de presentación, mientras useModoEjemplo() diga que esta empresa todavía
 * no tiene movimientos reales.
 *
 * Cada export tiene la MISMA forma que la respuesta real de su endpoint —
 * así el widget que lo consume no necesita una rama de mapeo aparte, solo
 * sustituye el `data`/`filas` que vendría de la consulta.
 */

const MESES_NUM = Array.from({ length: 12 }, (_, i) => i + 1);

// Estacionalidad leve: floja en Feb (post-diciembre), sube hacia fin de año
// (Navidad/Nochebuena) — un patrón reconocible sin ser una montaña rusa.
const FACTOR_ESTACIONAL = [0.78, 0.70, 0.82, 0.86, 0.90, 0.88, 0.93, 0.96, 0.91, 1.00, 1.12, 1.28];
const BASE_VENTA_MENSUAL = 72_000;

const redondear = (n: number) => Math.round(n / 100) * 100;

export const EJEMPLO_VENTAS_MENSUALES = FACTOR_ESTACIONAL.map(f => redondear(BASE_VENTA_MENSUAL * f));
// Costo + gastos operativos ≈ 58% de lo vendido cada mes — mismo negocio, no un número aparte por gráfica.
export const EJEMPLO_GASTOS_MENSUALES = EJEMPLO_VENTAS_MENSUALES.map(v => redondear(v * 0.58));

const anioActual = new Date().getFullYear();

// ── Ingresos & Gastos (año fiscal) ──────────────────────────────────────────
export const EJEMPLO_INGRESOS_GASTOS_ANUAL = {
  anio: anioActual,
  meses: MESES_NUM.map((mes, i) => ({
    mes, anio: anioActual,
    ingresos: EJEMPLO_VENTAS_MENSUALES[i],
    gastos:   EJEMPLO_GASTOS_MENSUALES[i],
  })),
};

// ── Antigüedad de saldos — cartera sana con algo vencido, no perfecta ───────
export const EJEMPLO_ANTIGUEDAD_COBRAR = {
  corriente: 38500, dias_0_30: 16800, dias_31_60: 8200, dias_61_90: 3600, dias_90_plus: 2100,
  total: 38500 + 16800 + 8200 + 3600 + 2100,
};
export const EJEMPLO_ANTIGUEDAD_PAGAR = {
  corriente: 24000, dias_0_30: 9800, dias_31_60: 4500, dias_61_90: 1600, dias_90_plus: 700,
  total: 24000 + 9800 + 4500 + 1600 + 700,
};

// ── Resumen de Gastos del mes ───────────────────────────────────────────────
export const EJEMPLO_RESUMEN_GASTOS_CATEGORIAS = [
  { categoria: 'Alquiler de local',   monto: 18000 },
  { categoria: 'Nómina',              monto: 12500 },
  { categoria: 'Servicios públicos',  monto: 6200 },
  { categoria: 'Mantenimiento',       monto: 2100 },
];
export const EJEMPLO_RESUMEN_GASTOS_TOTAL = EJEMPLO_RESUMEN_GASTOS_CATEGORIAS.reduce((s, g) => s + g.monto, 0);
export const EJEMPLO_RESUMEN_GASTOS_TOTAL_MES_ANTERIOR = 36200;
export const EJEMPLO_RESUMEN_GASTOS_CAMBIO_PORCENTAJE =
  +(((EJEMPLO_RESUMEN_GASTOS_TOTAL - EJEMPLO_RESUMEN_GASTOS_TOTAL_MES_ANTERIOR) / EJEMPLO_RESUMEN_GASTOS_TOTAL_MES_ANTERIOR) * 100).toFixed(1);

// ── e-CF por estado DGII ────────────────────────────────────────────────────
export const EJEMPLO_ECF_ESTADO = {
  grafica: [
    { label: 'Aceptado',    value: 42 },
    { label: 'En proceso',  value: 3 },
    { label: 'Rechazado',   value: 1 },
  ],
};

// ── Ventas por vendedor (mes) ────────────────────────────────────────────────
export const EJEMPLO_VENTAS_POR_VENDEDOR = [
  { nombre: 'Carlos Méndez',  total: 27000 },
  { nombre: 'Ana Rodríguez',  total: 20800 },
  { nombre: 'Luis Fernández', total: 13900 },
];

// ── Ventas mensuales (tendencia 12 meses) ───────────────────────────────────
export const EJEMPLO_VENTAS_TENDENCIA = MESES_NUM.map((mes, i) => ({
  periodo:  `${anioActual}-${String(mes).padStart(2, '0')}`,
  total:    EJEMPLO_VENTAS_MENSUALES[i],
  cantidad: 18 + Math.round(i * 1.3),
}));

// ── Top clientes / productos (año) ──────────────────────────────────────────
export const EJEMPLO_TOP_CLIENTES = [
  { nombre: 'Ferretería San José',     total: 68000, facturas: 14 },
  { nombre: 'Constructora Vega SRL',   total: 52000, facturas: 6 },
  { nombre: 'Colmado Hermanos Pérez',  total: 34500, facturas: 22 },
  { nombre: 'Taller Mecánico Ramírez', total: 21000, facturas: 9 },
  { nombre: 'Supermercado La Familia', total: 15800, facturas: 11 },
];

export const EJEMPLO_TOP_PRODUCTOS = [
  { nombre: 'Cemento Gris 42.5kg',       ingresos: 45000, cantidadVendida: 900 },
  { nombre: 'Varilla 3/8" 6m',           ingresos: 32000, cantidadVendida: 1280 },
  { nombre: 'Pintura Látex Blanca 1gal', ingresos: 24500, cantidadVendida: 350 },
  { nombre: 'Bloque de Concreto 6"',     ingresos: 18200, cantidadVendida: 2600 },
  { nombre: 'Tubo PVC 4" 6m',            ingresos: 12800, cantidadVendida: 640 },
];

/**
 * Reparte un total del mes entre sus días con una curva simple (más
 * movimiento a mitad y fin de mes, como cualquier negocio con clientes que
 * cobran quincena) — la MISMA forma para ventas y compras, no un random
 * independiente por gráfica. Recibe `dias` en vez de traerlo fijo porque el
 * widget la llama con el largo REAL del mes en curso (28-31) — un ejemplo
 * de 22 ó 30 días en un mes de 31 dejaría una cola de ceros que se ve como
 * "el negocio cerró a fin de mes", no como el patrón que se quiso mostrar.
 */
export function ejemploDetallePorDia(totalMes: number, dias: number) {
  const pesos = Array.from({ length: dias }, (_, d) =>
    1 + 0.6 * Math.sin((d / dias) * Math.PI * 2) + (d % 14 === 13 ? 0.8 : 0));
  const sumaPesos = pesos.reduce((s, p) => s + p, 0);
  return pesos.map((p, i) => ({
    dia:      i + 1,
    total:    redondear((totalMes * p) / sumaPesos),
    cantidad: Math.max(1, Math.round(p * 2)),
  }));
}

export const EJEMPLO_VENTA_MES_ACTUAL  = EJEMPLO_VENTAS_MENSUALES[EJEMPLO_VENTAS_MENSUALES.length - 1];
export const EJEMPLO_COMPRA_MES_ACTUAL = redondear(EJEMPLO_GASTOS_MENSUALES[EJEMPLO_GASTOS_MENSUALES.length - 1] * 0.7);

// ── Compras por proveedor (año) ─────────────────────────────────────────────
export const EJEMPLO_COMPRAS_POR_PROVEEDOR = {
  total: 42000,
  proveedores: [
    { nombre: 'Distribuidora El Progreso SRL', total: 22000, cantidadCompras: 5 },
    { nombre: 'Importadora Central SRL',       total: 14000, cantidadCompras: 3 },
    { nombre: 'Materiales Vega SRL',           total: 6000,  cantidadCompras: 2 },
  ],
};

// ── Valor de inventario por categoría (hoy) ─────────────────────────────────
export const EJEMPLO_INVENTARIO_VALOR = {
  resumen: { valorTotal: 186000, totalUnidades: 4200 },
  grafica: [
    { label: 'Materiales de construcción', value: 82000 },
    { label: 'Pinturas y acabados',        value: 41000 },
    { label: 'Plomería',                    value: 28000 },
    { label: 'Ferretería general',          value: 22000 },
    { label: 'Otros',                       value: 13000 },
  ],
};

// ── Horas y días pico (últimos 3 meses) ─────────────────────────────────────
export const EJEMPLO_HORAS_PICO = [
  { dia: 'Lun', hora: '09:00', cantidad: 8 },  { dia: 'Lun', hora: '15:00', cantidad: 6 },
  { dia: 'Mar', hora: '09:00', cantidad: 7 },  { dia: 'Mié', hora: '10:00', cantidad: 9 },
  { dia: 'Jue', hora: '16:00', cantidad: 10 }, { dia: 'Vie', hora: '10:00', cantidad: 9 },
  { dia: 'Vie', hora: '17:00', cantidad: 14 }, { dia: 'Sáb', hora: '10:00', cantidad: 16 },
  { dia: 'Sáb', hora: '11:00', cantidad: 12 }, { dia: 'Dom', hora: '10:00', cantidad: 4 },
];

const haceDias = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

// ── Cuentas de banco + actividad reciente (dashboard, columna izquierda) ───
export const EJEMPLO_BANCOS = [
  { id: 'ej-b1', nombre: 'Cuenta Corriente BHD León',      tipo: 'corriente', moneda: 'DOP', saldo: 142000 },
  { id: 'ej-b2', nombre: 'Cuenta de Ahorros Banreservas',  tipo: 'ahorros',   moneda: 'DOP', saldo: 38500 },
  { id: 'ej-b3', nombre: 'Caja Chica',                     tipo: 'efectivo',  moneda: 'DOP', saldo: 5200 },
];
export const EJEMPLO_BALANCE_BANCOS = EJEMPLO_BANCOS.reduce((s, b) => s + b.saldo, 0);

export const EJEMPLO_ACTIVIDAD_HOY = [
  { descripcion: 'Cobro — Ferretería San José',            monto: 8200, tipo: 'ingreso', hora: '10:15' },
  { descripcion: 'Compra — Distribuidora El Progreso SRL', monto: 3100, tipo: 'gasto',   hora: '13:40' },
];
export const EJEMPLO_ACTIVIDAD_SEMANA = [
  { descripcion: 'Cobro — Constructora Vega SRL',   monto: 15400, tipo: 'ingreso', fecha: haceDias(2) },
  { descripcion: 'Pago — Importadora Central SRL',  monto: 6200,  tipo: 'gasto',   fecha: haceDias(4) },
  { descripcion: 'Cobro — Colmado Hermanos Pérez',  monto: 4100,  tipo: 'ingreso', fecha: haceDias(6) },
];

// ── Facturas pendientes de cobro (dashboard, columna derecha) ──────────────
export const EJEMPLO_FACTURAS_PENDIENTES = [
  { id: 'ej-f1', cliente: { nombre: 'Ferretería San José' },    folio: 'B0100000123', fecha: haceDias(3), total: 18500 },
  { id: 'ej-f2', cliente: { nombre: 'Constructora Vega SRL' },  folio: 'B0100000124', fecha: haceDias(6), total: 32000 },
  { id: 'ej-f3', cliente: { nombre: 'Colmado Hermanos Pérez' }, folio: 'B0100000125', fecha: haceDias(9), total: 9800 },
];
