// ── Auth ─────────────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'admin' | 'contador' | 'vendedor' | 'viewer' | 'empleado';

export interface AuthUser {
  id:              number;
  nombre:          string;
  apellido?:       string;  // presente en respuestas del backend
  email:           string;
  role:            UserRole;
  tourCompletado?: boolean;
  provider?:       string;  // 'LOCAL' | 'GOOGLE' — para mostrar candado en email
  temaSidebar?:    string;  // preferencia de color del sidebar, por usuario
}

export interface EmpresaItem {
  empresaId:   number;
  nombre:      string;
  rnc?:        string;
  rol:         string;
  isPrincipal: boolean;
  plan?:       string;
}

export interface LoginResponse {
  accessToken:   string;
  user:          AuthUser;
  empresaActual?: number | null;
  empresas?:     EmpresaItem[];
}

// ── API Wrappers ──────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success:   boolean;
  data:      T;
  timestamp: string;
}

export interface Meta {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

export interface PaginatedData<T> {
  data: T[];
  meta: Meta;
}

// ── Clientes ──────────────────────────────────────────────────────────────────
export interface Cliente {
  id:             number;
  /** Nombre interno del cliente. Distingue sucursales que comparten RNC. */
  nombre:         string;
  /** Razón social registrada del RNC ante DGII. Es la que se declara en el e-CF. */
  razonSocial?:   string;
  rfc:            string;
  rncReceptor?:   string;
  /** true si otro cliente activo de la empresa usa el mismo RNC */
  rncCompartido?: boolean;
  email?:         string;
  telefono?:      string;
  direccion?:     string;
  ciudad?:        string;
  regimenFiscal?: string;
  sector?:        string;
  diasCredito?:   number;
  limiteCredito?: number;
  notas?:         string;
  isActive:       boolean;
  createdAt:      string;
}

// ── Productos ─────────────────────────────────────────────────────────────────
export interface Producto {
  id:              number;
  tipo?:           string;   // 'producto' | 'servicio'
  codigo:          string;
  nombre:          string;
  descripcion?:    string;
  unidadMedida:    string;
  precio:          number;
  precio2?:        number | null;
  precio3?:        number | null;
  costo?:          number | null;
  porcentajeIva:   number;
  stock:           number;
  stockMinimo:     number;
  stockMaximo?:    number;
  categoria?:        string;
  imagenUrl?:        string;
  isActive:          boolean;
  permiteDecimales?: boolean;
  // Balanzas etiquetadoras
  plu?:      number | null;
  esPesable?: boolean;
}

// ── Facturas ──────────────────────────────────────────────────────────────────
export type FacturaEstado = 'borrador' | 'emitida' | 'pagada' | 'cancelada';

export interface FacturaDetalle {
  productoId:    number;
  descripcion:   string;
  cantidad:      number;
  precioUnitario: number;
  porcentajeIva?: number;
}

export interface Factura {
  id:                  number;
  folio:               string;
  fecha:               string;
  estado:              FacturaEstado;
  clienteId:           number;
  cliente:             Cliente;
  subtotal:            number;
  iva:                 number;
  total:               number;
  tipoNcf?:            string;
  notas?:              string;
  isActive:            boolean;
  createdAt:           string;
  anulacionPendiente?: boolean;
  /** Por qué esta factura quedó emitida sin comprobante fiscal. */
  ecfError?:           string | null;
  emailEstado?:        string | null;
  emailDestino?:       string | null;
  emailError?:         string | null;
  ecfErrorAt?:         string | null;
}

// ── Compras ───────────────────────────────────────────────────────────────────
export type CompraEstado = 'borrador' | 'enviada' | 'recibida' | 'pagada' | 'cancelada';

export interface Proveedor {
  id:        number;
  nombre:    string;
  rnc:       string;
  telefono?: string;
  email?:    string;
  isActive:  boolean;
}

export interface Compra {
  id:         number;
  folio:      string;
  fecha:      string;
  estado:     CompraEstado;
  proveedorId: number;
  proveedor:  Proveedor;
  subtotal:   number;
  itbis:      number;
  total:      number;
  isActive:   boolean;
  createdAt:  string;
}

// ── CxC / CxP ─────────────────────────────────────────────────────────────────
export type EstadoCuenta = 'pendiente' | 'pagada_parcial' | 'pagada' | 'vencida' | 'anulada';
export type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'otro';

export interface CuentaPorCobrar {
  id:              number;
  facturaId:       number;
  factura:         Factura;
  clienteId:       number;
  cliente:         Cliente;
  montoOriginal:   number;
  montoPagado:     number;
  montoPendiente:  number;
  fechaEmision:    string;
  fechaVencimiento: string;
  estado:          EstadoCuenta;
}

export interface CuentaPorPagar {
  id:              number;
  compraId:        number;
  compra:          Compra;
  proveedorId:     number;
  proveedor:       Proveedor;
  montoOriginal:   number;
  montoPagado:     number;
  montoPendiente:  number;
  fechaEmision:    string;
  fechaVencimiento: string;
  estado:          EstadoCuenta;
}

// ── Inventario ────────────────────────────────────────────────────────────────
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste' | 'devolucion';

export interface MovimientoInventario {
  id:              number;
  tipo:            TipoMovimiento;
  productoId:      number;
  producto:        Producto;
  cantidad:        number;
  cantidadAnterior: number;
  cantidadNueva:   number;
  motivo?:         string;
  referencia?:     string;
  createdAt:       string;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
export interface KPIs {
  ventas: { hoy: number; semana: number; mes: number; anio: number };
  compras: { mes: number };
  alertas: { facturasPendientes: number; ecfPendientes: number; productosStockBajo: number };
  balanceMes: { ingresos: number; gastos: number; balance: number };
  topClientes:  Array<{ label: string; value: number }>;
  topProductos: Array<{ label: string; value: number }>;
}
