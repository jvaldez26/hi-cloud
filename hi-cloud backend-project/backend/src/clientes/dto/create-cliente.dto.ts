import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsInt, IsNumber,
  Matches, MaxLength, Length, Min, Max,
} from 'class-validator';
// Length se importa por otros campos (codigoPostal, rncReceptor)

export class CreateClienteDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  nombre!: string;

  /**
   * RNC (9 dígitos exactos) o Cédula (11 dígitos exactos).
   * República Dominicana no usa RFC (México) ni otros formatos.
   * Opcional para crear clientes básicos (ej. consumidor final desde POS).
   */
  @IsOptional()
  @IsString({ message: 'El RNC/Cédula debe ser texto' })
  @Matches(/^\d{9}$|^\d{11}$/, {
    message: 'RNC debe tener 9 dígitos o Cédula debe tener 11 dígitos',
  })
  rfc?: string;

  @IsOptional()
  @IsString({ message: 'La razón social debe ser texto' })
  @MaxLength(300, { message: 'La razón social no puede superar 300 caracteres' })
  razonSocial?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  @MaxLength(300, { message: 'La dirección no puede superar 300 caracteres' })
  direccion?: string;

  @IsOptional()
  @IsString({ message: 'La ciudad debe ser texto' })
  @MaxLength(100, { message: 'La ciudad no puede superar 100 caracteres' })
  ciudad?: string;

  @IsOptional()
  @IsString({ message: 'El estado/provincia debe ser texto' })
  @MaxLength(100, { message: 'El estado no puede superar 100 caracteres' })
  estado?: string;

  @IsOptional()
  @IsString({ message: 'El código postal debe ser texto' })
  @Length(5, 10, { message: 'El código postal debe tener entre 5 y 10 caracteres' })
  codigoPostal?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  telefono?: string;

  @IsOptional()
  @IsString({ message: 'El régimen fiscal debe ser texto' })
  @MaxLength(100, { message: 'El régimen fiscal no puede superar 100 caracteres' })
  regimenFiscal?: string;

  @IsOptional()
  @IsString({ message: 'El uso CFDI debe ser texto' })
  @MaxLength(50, { message: 'El uso CFDI no puede superar 50 caracteres' })
  usoCfdi?: string;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;

  @IsOptional()
  @IsString({ message: 'El RNC receptor debe ser texto' })
  @Length(9, 11, { message: 'El RNC receptor debe tener 9 u 11 dígitos' })
  rncReceptor?: string;

  @IsOptional()
  @IsString({ message: 'El sector debe ser texto' })
  @MaxLength(64, { message: 'El sector no puede superar 64 caracteres' })
  sector?: string;

  @IsOptional()
  @IsInt({ message: 'Los días de crédito deben ser un número entero' })
  @Min(0,   { message: 'Los días de crédito no pueden ser negativos' })
  @Max(365, { message: 'Los días de crédito no pueden superar 365' })
  diasCredito?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El límite de crédito debe ser un número' })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  limiteCredito?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  identificadorExtranjero?: string;
}
