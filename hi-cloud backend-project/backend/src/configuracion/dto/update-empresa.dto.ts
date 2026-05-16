import {
  IsString, IsOptional, IsEmail, IsUrl, IsObject,
  MaxLength, Matches, IsDateString, IsNumber, IsBoolean, Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateEmpresaDto {
  // ── Identificación fiscal ───────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$|^\d{11}$/, { message: 'RNC inválido: debe tener 9 u 11 dígitos numéricos' })
  rnc?: string;

  @IsOptional() @IsString() @MaxLength(300)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nombreComercial?: string;

  /** Tipo de sociedad: SRL, SA, EIRL, PERSONA_FISICA, ONG, OTRO */
  @IsOptional() @IsString() @MaxLength(50)
  tipoSociedad?: string;

  /** Sector económico */
  @IsOptional() @IsString() @MaxLength(100)
  sector?: string;

  /**
   * Régimen fiscal DGII: ORDINARIO | PST | RST
   * Nota: el campo en el DTO coincide con el nombre del form (regimenFiscal)
   * y con el nombre de la columna en la entidad.
   */
  @IsOptional() @IsString() @MaxLength(100)
  regimenFiscal?: string;

  @IsOptional() @IsString() @MaxLength(200)
  actividadEconomica?: string;

  @IsOptional() @IsDateString()
  fechaConstitucion?: string;

  // ── Representación legal ────────────────────────────────────────────────────

  @IsOptional() @IsString() @MaxLength(200)
  representanteLegal?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'Cédula inválida: debe tener exactamente 11 dígitos numéricos' })
  cedulaRepresentante?: string;

  // ── Ubicación y contacto ────────────────────────────────────────────────────

  @IsOptional() @IsString() @MaxLength(400)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(200)
  direccion2?: string;

  @IsOptional() @IsString() @MaxLength(100)
  ciudad?: string;

  @IsOptional() @IsString() @MaxLength(100)
  provincia?: string;

  @IsOptional() @IsString() @MaxLength(10)
  codigoPostal?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefonoSecundario?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsEmail({}, { message: 'Correo electrónico inválido' })
  email?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsUrl({ require_tld: false }, { message: 'URL inválida' })
  @MaxLength(300)
  sitioWeb?: string;

  // ── Branding ────────────────────────────────────────────────────────────────

  @IsOptional() @IsString() @MaxLength(300)
  logo?: string;

  @IsOptional() @IsString() @MaxLength(300)
  favicon?: string;

  // ── Sistema ─────────────────────────────────────────────────────────────────

  @IsOptional() @IsString() @MaxLength(30)
  moneda?: string;

  @IsOptional() @IsString() @MaxLength(50)
  zonaHoraria?: string;

  @IsOptional() @IsNumber() @Min(0)
  diasCreditoDefault?: number;

  @IsOptional() @IsNumber() @Min(0)
  limiteCreditoDefault?: number;

  @IsOptional() @IsBoolean()
  creditoHabilitado?: boolean;

  // ── JSONB de configuración flexible ─────────────────────────────────────────

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  configuracion?: Record<string, unknown>;
}
