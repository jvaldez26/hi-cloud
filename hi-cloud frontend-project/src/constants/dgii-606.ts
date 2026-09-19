// Catálogo oficial DGII para el Formato 606 (tipos de bienes/servicios y
// formas de pago) — mismo listado que ya usaba GastosPage.tsx, ahora
// compartido para que CompraFormInner.tsx no tenga que repetirlo.

export const TIPOS_BIENES_606 = [
  { value: '01', label: '01 — Gastos de personal' },
  { value: '02', label: '02 — Trabajo, suministros y servicios' },
  { value: '03', label: '03 — Arrendamientos' },
  { value: '04', label: '04 — Gastos de activos fijos' },
  { value: '05', label: '05 — Gastos de representación' },
  { value: '06', label: '06 — Otras deducciones admitidas' },
  { value: '07', label: '07 — Gastos financieros' },
  { value: '08', label: '08 — Gastos extraordinarios' },
  { value: '09', label: '09 — Compras y gastos del costo de venta' },
  { value: '10', label: '10 — Adquisiciones de activos' },
  { value: '11', label: '11 — Gastos de seguros' },
];

export const FORMAS_PAGO_606 = [
  { value: '01', label: '01 — Efectivo' },
  { value: '02', label: '02 — Cheque / Transferencia / Depósito' },
  { value: '03', label: '03 — Tarjeta de Débito / Crédito' },
  { value: '04', label: '04 — Compra a crédito' },
  { value: '05', label: '05 — Permuta' },
  { value: '06', label: '06 — Nota de crédito' },
  { value: '07', label: '07 — Mixto' },
];
