import {
  IsIn, IsNotEmpty, IsUUID, IsOptional, IsString, IsEmail, IsInt,
  IsNumber, IsBoolean, Min, Max, MaxLength, Length, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Datos del formulario de "Crear" en el Directorio de HiCloud Xlink — el
 * mismo que usan Proveedores/Clientes, prellenado con nombre/RNC de la
 * contraparte. El RNC/rfc NUNCA viaja aquí: lo fija el backend desde la
 * empresa de `xlinkId` (ver XlinkService.vincular), nunca lo que mande el
 * cliente — evita que alguien vincule un RNC distinto al de la contraparte.
 */
export class VincularXlinkDatosDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MaxLength(200)
  nombre!: string;

  // ── Proveedor ──────────────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional() @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email?: string;

  @IsOptional() @IsString() @MaxLength(300)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(100)
  contacto?: string;

  @IsOptional() @IsString() @MaxLength(100)
  categoria?: string;

  @IsOptional() @IsInt() @Min(0)
  diasPago?: number;

  @IsOptional() @IsString() @MaxLength(100)
  banco?: string;

  @IsOptional() @IsString() @MaxLength(30)
  cuentaBancaria?: string;

  @IsOptional() @IsBoolean()
  sincronizarArticulosXlink?: boolean;

  // ── Cliente ────────────────────────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(300)
  razonSocial?: string;

  @IsOptional() @IsString() @Length(9, 11)
  rncReceptor?: string;

  @IsOptional() @IsString() @MaxLength(30)
  identificadorExtranjero?: string;

  @IsOptional() @IsString() @MaxLength(100)
  regimenFiscal?: string;

  @IsOptional() @IsString() @MaxLength(100)
  ciudad?: string;

  @IsOptional() @IsString() @MaxLength(100)
  estado?: string;

  @IsOptional() @IsString() @Length(5, 10)
  codigoPostal?: string;

  @IsOptional() @IsString() @MaxLength(64)
  sector?: string;

  @IsOptional() @IsInt() @Min(0) @Max(365)
  diasCredito?: number;

  @IsOptional() @IsNumber() @Min(0)
  limiteCredito?: number;

  @IsOptional() @IsString()
  notas?: string;
}

export class VincularXlinkDto {
  @IsUUID()
  xlinkId!: string;

  @IsNotEmpty()
  @IsIn(['proveedor', 'cliente'])
  rol!: 'proveedor' | 'cliente';

  /**
   * Presente SOLO cuando viene del formulario "Crear" del Directorio (en vez
   * del botón "Vincular" de un clic). Su sola presencia es lo que activa el
   * nuevo comportamiento: si aparece una coincidencia por RNC que antes se
   * vinculaba en silencio, en cambio se devuelve `requiere_confirmacion` en
   * vez de vincular a ciegas — el frontend ofrece "¿Vincularlo?" y, si el
   * usuario confirma, repite la llamada SIN `datos` (el camino de siempre).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => VincularXlinkDatosDto)
  datos?: VincularXlinkDatosDto;
}
