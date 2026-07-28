/**
 * DTOs del módulo Prestamista.
 *
 * El módulo entero recibía `@Body() body: any` en sus 17 endpoints, sin una sola
 * validación: entraban montos negativos, cero, texto donde iban números y campos
 * de más. En un módulo que desembolsa y cobra dinero eso es la raíz de varios
 * defectos (un pago de monto 0 creaba un recibo vacío; un monto negativo restaba
 * saldo).
 *
 * El ValidationPipe global ya está en modo whitelist + forbidNonWhitelisted, así
 * que declarar el DTO además descarta cualquier campo no listado aquí.
 *
 * Los importes son DECIMAL en Postgres y llegan como string: por eso todos los
 * numéricos usan @Type(() => Number).
 */
import {
  IsInt, IsPositive, IsNumber, IsOptional, IsString, IsNotEmpty,
  IsDateString, MaxLength, Min, Max, IsIn, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Monto de dinero: > 0 y con dos decimales como máximo. */
const MONTO = { maxDecimalPlaces: 2 } as const;

export class RegistrarPagoDto {
  @IsInt() @IsPositive() @Type(() => Number)
  prestamoId!: number;

  /** M3: un pago de 0 o negativo no es un pago. */
  @IsNumber(MONTO, { message: 'El monto pagado debe ser un número con hasta 2 decimales' })
  @IsPositive({ message: 'El monto pagado debe ser mayor que cero' })
  @Type(() => Number)
  montoPagado!: number;

  @IsOptional() @IsString() @MaxLength(50)
  metodoPago?: string;

  @IsOptional() @IsString() @MaxLength(100)
  referencia?: string;

  @IsOptional() @IsString() @MaxLength(200)
  cobradorNombre?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class CrearSolicitudDto {
  @IsInt() @IsPositive() @Type(() => Number)
  deudorId!: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  productoId?: number;

  @IsNumber(MONTO) @IsPositive({ message: 'El monto solicitado debe ser mayor que cero' })
  @Type(() => Number)
  montoSolicitado!: number;

  @IsInt() @Min(1, { message: 'El plazo debe ser de al menos 1 mes' }) @Type(() => Number)
  plazoMeses!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsString() @MaxLength(500)
  proposito?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class DecidirSolicitudDto {
  @IsIn(['aprobada', 'rechazada'], { message: "La decisión debe ser 'aprobada' o 'rechazada'" })
  decision!: 'aprobada' | 'rechazada';

  @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;

  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoAprobado?: number;
}

export class CrearPrestamoDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  solicitudId?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  deudorId?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  productoId?: number;

  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoPrincipal?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMeses?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeMora?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  diasGracia?: number;

  @IsOptional() @IsDateString({}, { message: 'La fecha de desembolso debe ser una fecha válida' })
  fechaDesembolso?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class RefinanciarDto {
  @IsInt() @IsPositive() @Type(() => Number)
  prestamoOriginalId!: number;

  /** Si se omite, el servicio lo calcula desde los saldos menos lo condonado. */
  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoNuevo?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMeses?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  /** Condonaciones: nunca negativas (restarían deuda al revés). */
  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  moraCondonada?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  interesCondonado?: number;

  @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class CancelarPrestamoDto {
  @IsString() @IsNotEmpty({ message: 'Indica el motivo de la cancelación' })
  @MaxLength(500)
  motivo!: string;
}

export class SimularPrestamoDto {
  @IsOptional() @IsNumber(MONTO) @IsPositive() @Type(() => Number)
  montoPrincipal?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMeses?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeMora?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  diasGracia?: number;

  @IsOptional() @IsDateString()
  fechaDesembolso?: string;
}

export class ActualizarSolicitudDto {
  @IsOptional() @IsString() @MaxLength(500)
  observaciones?: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  oficialId?: number;

  @IsOptional() @IsString() @MaxLength(200)
  oficialNombre?: string;
}

export class CrearDeudorDto {
  @IsString() @IsNotEmpty({ message: 'El nombre del deudor es requerido' }) @MaxLength(200)
  nombre!: string;

  @IsOptional() @IsString() @MaxLength(200)
  apellidos?: string;

  @IsOptional() @IsString() @MaxLength(20)
  cedula?: string;

  @IsOptional() @IsString() @MaxLength(20)
  rnc?: string;

  @IsOptional() @IsDateString()
  fechaNacimiento?: string;

  @IsOptional() @IsIn(['M', 'F', 'masculino', 'femenino', 'otro']) @MaxLength(10)
  sexo?: string;

  @IsOptional() @IsString() @MaxLength(20)
  estadoCivil?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefonoTrabajo?: string;

  @IsOptional() @IsString() @MaxLength(100)
  email?: string;

  @IsOptional() @IsString()
  direccion?: string;

  @IsOptional() @IsString()
  direccionTrabajo?: string;

  @IsOptional() @IsString() @MaxLength(100)
  ocupacion?: string;

  @IsOptional() @IsString() @MaxLength(200)
  empresaLabora?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  ingresoMensual?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  tiempoEmpleoMeses?: number;

  @IsOptional() @IsString() @MaxLength(200)
  referenciaNombre1?: string;

  @IsOptional() @IsString() @MaxLength(20)
  referenciaTelefono1?: string;

  @IsOptional() @IsString() @MaxLength(200)
  referenciaNombre2?: string;

  @IsOptional() @IsString() @MaxLength(20)
  referenciaTelefono2?: string;

  @IsOptional() @IsInt() @Min(0) @Max(1000) @Type(() => Number)
  scoreCredito?: number;

  @IsOptional() @IsIn(['bajo', 'medio', 'alto', 'muy_alto'])
  nivelRiesgo?: string;

  @IsOptional() @IsIn(['activo', 'inactivo', 'moroso'])
  estado?: string;

  @IsOptional() @IsString()
  notas?: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  clienteId?: number;

  @IsOptional() @IsString()
  foto?: string;
}

export class ActualizarDeudorDto extends CrearDeudorDto {
  @IsOptional() @IsBoolean()
  enListaNegra?: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  motivoListaNegra?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RegistrarGestionDto {
  @IsInt() @IsPositive() @Type(() => Number)
  prestamoId!: number;

  @IsString() @IsNotEmpty({ message: 'La descripción de la gestión es requerida' }) @MaxLength(500)
  descripcion!: string;

  @IsOptional() @IsIn(['llamada', 'visita', 'mensaje', 'carta', 'acuerdo', 'legal', 'otro'])
  tipo?: string;

  @IsOptional() @IsIn(['exitoso', 'sin_respuesta', 'negado', 'promesa_pago', 'pago_parcial'])
  resultado?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  montoPrometido?: number;

  @IsOptional() @IsDateString()
  fechaPromesaPago?: string;

  @IsOptional() @IsDateString()
  proximaGestion?: string;

  @IsOptional() @IsString() @MaxLength(200)
  cobradorNombre?: string;
}

export class CrearGarantiaDto {
  @IsInt() @IsPositive() @Type(() => Number)
  deudorId!: number;

  @IsString() @IsNotEmpty() @MaxLength(50)
  tipo!: string;

  @IsString() @IsNotEmpty() @MaxLength(500)
  descripcion!: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  prestamoId?: number;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  solicitudId?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorTasado?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorRealizacion?: number;

  @IsOptional()
  detalles?: Record<string, unknown>;

  @IsOptional()
  documentosUrls?: string[];

  @IsOptional()
  fotosUrls?: string[];

  @IsOptional() @IsString() @MaxLength(200)
  ubicacion?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;
}

export class ActualizarGarantiaDto {
  @IsOptional() @IsString() @MaxLength(50)
  tipo?: string;

  @IsOptional() @IsString() @MaxLength(500)
  descripcion?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorTasado?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorRealizacion?: number;

  @IsOptional() @IsIn(['activa', 'liberada', 'ejecutada'])
  estado?: string;

  @IsOptional() @IsString() @MaxLength(200)
  ubicacion?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notas?: string;

  @IsOptional()
  detalles?: Record<string, unknown>;
}

export class CrearProductoPrestamoDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  nombre!: string;

  @IsNumber({ maxDecimalPlaces: 4 }) @IsPositive({ message: 'La tasa de interés mensual debe ser mayor que cero' })
  @Type(() => Number)
  tasaInteresMensual!: number;

  @IsOptional() @IsString() @MaxLength(300)
  descripcion?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  montoMinimo?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  montoMaximo?: number;

  @IsOptional() @IsIn(['mensual', 'anual'])
  tipoTasa?: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMinimoMeses?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMaximoMeses?: number;

  @IsOptional() @IsIn(['mensual', 'quincenal', 'semanal', 'unico'])
  frecuenciaPago?: string;

  @IsOptional() @IsIn(['frances', 'aleman', 'americano'])
  metodoAmortizacion?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeMora?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  cargoCierre?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeCargoCierre?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  diasGracia?: number;

  @IsOptional() @IsBoolean()
  requiereGarantia?: boolean;

  @IsOptional() @IsBoolean()
  requiereGarante?: boolean;
}

export class ActualizarProductoPrestamoDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  nombre?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  tasaInteresMensual?: number;

  @IsOptional() @IsString() @MaxLength(300)
  descripcion?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  montoMinimo?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  montoMaximo?: number;

  @IsOptional() @IsIn(['mensual', 'anual'])
  tipoTasa?: string;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMinimoMeses?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  plazoMaximoMeses?: number;

  @IsOptional() @IsIn(['mensual', 'quincenal', 'semanal', 'unico'])
  frecuenciaPago?: string;

  @IsOptional() @IsIn(['frances', 'aleman', 'americano'])
  metodoAmortizacion?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeMora?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  cargoCierre?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  porcentajeCargoCierre?: number;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  diasGracia?: number;

  @IsOptional() @IsBoolean()
  requiereGarantia?: boolean;

  @IsOptional() @IsBoolean()
  requiereGarante?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CrearVehiculoDto {
  @IsOptional() @IsString() @MaxLength(20)
  placa?: string;

  @IsOptional() @IsString() @MaxLength(50)
  chasis?: string;

  @IsOptional() @IsString() @MaxLength(50)
  motor?: string;

  @IsOptional() @IsString() @MaxLength(100)
  marca?: string;

  @IsOptional() @IsString() @MaxLength(100)
  modelo?: string;

  @IsOptional() @IsInt() @Min(1900) @Max(2100) @Type(() => Number)
  anio?: number;

  @IsOptional() @IsString() @MaxLength(50)
  color?: string;

  @IsOptional() @IsString() @MaxLength(50)
  tipoVehiculo?: string;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorMercado?: number;

  @IsOptional() @IsNumber(MONTO) @Min(0) @Type(() => Number)
  valorFactura?: number;

  @IsOptional() @IsString() @MaxLength(200)
  aseguradora?: string;

  @IsOptional() @IsString() @MaxLength(100)
  polizaSeguro?: string;

  @IsOptional() @IsDateString()
  fechaVencePoliza?: string;

  @IsOptional() @IsBoolean()
  activo?: boolean;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  sucursalId?: number;
}

export class ActualizarVehiculoDto extends CrearVehiculoDto {}
