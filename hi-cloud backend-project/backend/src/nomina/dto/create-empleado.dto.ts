import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsDateString,
  IsNumber, IsPositive, IsEnum, Min, MaxLength, Matches,
} from 'class-validator';
import { EstadoEmpleado, TipoContrato, TipoPago, Sexo } from '../entities/empleado.entity';

export class CreateEmpleadoDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'Cédula debe tener 11 dígitos' })
  cedula: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  nombre: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  apellido: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsDateString()
  fechaNacimiento: string;

  @IsDateString()
  fechaIngreso: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  cargo: string;

  @IsOptional() @IsString() @MaxLength(100)
  departamento?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salarioBase: number;

  @IsEnum(TipoPago)
  tipoPago: TipoPago;

  @IsEnum(TipoContrato)
  tipoContrato: TipoContrato;

  @IsOptional() @IsEnum(Sexo)
  sexo?: Sexo;

  @IsOptional() @IsString() @MaxLength(100)
  banco?: string;

  @IsOptional() @IsString() @MaxLength(30)
  cuentaBancaria?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otrasDeduccionesFixed?: number;

  @IsOptional() @IsString() @MaxLength(200)
  lugarTrabajo?: string;

  @IsOptional() @IsString()
  notas?: string;
}
