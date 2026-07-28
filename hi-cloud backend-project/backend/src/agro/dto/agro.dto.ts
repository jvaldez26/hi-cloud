import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsPositive, IsString, Max, MaxLength, Min, IsIn,
} from 'class-validator';

const UNIDAD_AREA = ['tarea', 'manzana', 'hectarea', 'metro_cuadrado', 'acre', 'cuerda'];
const ESTADO_ANIMAL = ['activo', 'muerto', 'vendido', 'sacrificado', 'perdido', 'baja'];
const ESTADO_MAQUINARIA = ['operativo', 'mantenimiento', 'fuera_servicio'];
const ESTADO_LABOR = ['completada', 'pendiente', 'cancelada'];
const NUM2 = { maxDecimalPlaces: 2 } as const;

// ── Finca ─────────────────────────────────────────────────────────────────
export class CrearFincaDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(300) ubicacion?: string;
  @IsOptional() @IsString() @MaxLength(100) provincia?: string;
  @IsOptional() @IsString() @MaxLength(100) municipio?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) areaTotal?: number;
  @IsOptional() @IsIn(UNIDAD_AREA) unidadArea?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) @Type(() => Number) latitud?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) @Type(() => Number) longitud?: number;
  @IsOptional() @IsBoolean() tieneRiego?: boolean;
  @IsOptional() @IsString() @MaxLength(50) tipoRiego?: string;
  @IsOptional() @IsString() @MaxLength(100) fuenteAgua?: string;
  @IsOptional() @IsString() @MaxLength(200) encargado?: string;
  @IsOptional() @IsString() @MaxLength(20) encargadoTelefono?: string;
  @IsOptional() @IsString() notas?: string;
}

export class ActualizarFincaDto extends PartialType(CrearFincaDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Parcela ───────────────────────────────────────────────────────────────
export class CrearParcelaDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) fincaId?: number;
  @IsString() @IsNotEmpty() @MaxLength(100) nombre!: string;
  @IsOptional() @IsString() @MaxLength(50) codigo?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) area?: number;
  @IsOptional() @IsIn(UNIDAD_AREA) unidadArea?: string;
  @IsOptional() @IsString() @MaxLength(50) tipoSuelo?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(14) @Type(() => Number) phSuelo?: number;
  @IsOptional() @IsIn(['disponible', 'en_descanso']) estado?: string;
}

export class ActualizarParcelaDto extends PartialType(CrearParcelaDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Ciclo ─────────────────────────────────────────────────────────────────
export class CrearCicloDto {
  @IsInt() @IsPositive() @Type(() => Number) parcelaId!: number;
  @IsInt() @IsPositive() @Type(() => Number) cultivoId!: number;
  @IsDateString() fechaSiembra!: string;
  @IsOptional() @IsDateString() fechaEstimadaCosecha?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) areaSembrada?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) cantidadSemilla?: number;
  @IsOptional() @IsString() @MaxLength(30) unidadSemilla?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) rendimientoEstimado?: number;
  @IsOptional() @IsString() @MaxLength(30) unidadCosecha?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoSemilla?: number;
  @IsOptional() @IsString() notas?: string;
}

export class ActualizarCicloDto extends PartialType(CrearCicloDto) {}

export class CerrarCicloDto {
  @IsOptional() @IsDateString() fechaCosechaReal?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) ingresoVentas?: number;
}

// ── Labor ─────────────────────────────────────────────────────────────────
export class CrearLaborDto {
  @IsInt() @IsPositive() @Type(() => Number) cicloId!: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) parcelaId?: number;
  @IsString() @IsNotEmpty() @MaxLength(50) tipo!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsDateString() fecha!: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) cantidadTrabajadores?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) horasTrabajadas?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoManoObra?: number;
  @IsOptional() @IsString() @MaxLength(100) usoMaquinaria?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoMaquinaria?: number;
  @IsOptional() @IsIn(ESTADO_LABOR) estado?: string;
  @IsOptional() @IsString() @MaxLength(200) responsable?: string;
  @IsOptional() @IsString() notas?: string;
}

export class ActualizarLaborDto extends PartialType(CrearLaborDto) {}

// ── Aplicación de insumo ──────────────────────────────────────────────────
export class CrearAplicacionDto {
  @IsInt() @IsPositive() @Type(() => Number) cicloId!: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) laborId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString() @IsNotEmpty() @MaxLength(200) insumoNombre!: string;
  @IsOptional() @IsString() @MaxLength(50) tipo?: string;
  @IsNumber(NUM2) @IsPositive() @Type(() => Number) cantidad!: number;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoUnitario?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoTotal?: number;
  @IsDateString() fecha!: string;
  @IsOptional() @IsString() @MaxLength(50) dosisPorArea?: string;
  @IsOptional() @IsString() @MaxLength(50) metodoAplicacion?: string;
  @IsOptional() @IsString() @MaxLength(100) loteInsumo?: string;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) periodoCarencia?: number;
  @IsOptional() @IsString() @MaxLength(200) responsable?: string;
  @IsOptional() @IsString() notas?: string;
}

// ── Cosecha ───────────────────────────────────────────────────────────────
export class CrearCosechaDto {
  @IsInt() @IsPositive() @Type(() => Number) cicloId!: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) parcelaId?: number;
  @IsDateString() fecha!: string;
  @IsNumber(NUM2) @IsPositive() @Type(() => Number) cantidad!: number;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
  @IsOptional() @IsString() @MaxLength(50) calidad?: string;
  @IsOptional() @IsString() @MaxLength(50) destino?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) cantidadTrabajadores?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoManoObra?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsOptional() @IsString() notas?: string;
}

// ── Cultivo ───────────────────────────────────────────────────────────────
export class CrearCultivoDto {
  @IsString() @IsNotEmpty() @MaxLength(100) nombre!: string;
  @IsOptional() @IsString() @MaxLength(100) variedad?: string;
  @IsOptional() @IsString() @MaxLength(50) tipo?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) diasCicloPromedio?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) rendimientoEsperado?: number;
  @IsOptional() @IsString() @MaxLength(30) unidadRendimiento?: string;
  @IsOptional() @IsString() @MaxLength(50) unidadPorArea?: string;
}

export class ActualizarCultivoDto extends PartialType(CrearCultivoDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Animal (Ganadería) ────────────────────────────────────────────────────
export class CrearAnimalDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) fincaId?: number;
  @IsOptional() @IsString() @MaxLength(50) numero?: string;
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
  @IsString() @IsNotEmpty() @MaxLength(50) tipo!: string;
  @IsOptional() @IsString() @MaxLength(100) raza?: string;
  @IsOptional() @IsString() @MaxLength(10) sexo?: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) pesoNacimiento?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) pesoActual?: number;
  @IsOptional() @IsString() @MaxLength(50) color?: string;
  @IsOptional() @IsString() @MaxLength(50) origen?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) madreId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) padreId?: number;
  @IsOptional() @IsString() @MaxLength(50) proposito?: string;
  @IsOptional() @IsIn(ESTADO_ANIMAL) estado?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoAdquisicion?: number;
  @IsOptional() @IsString() notas?: string;
}

export class ActualizarAnimalDto extends PartialType(CrearAnimalDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) motivoBaja?: string;
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}

// ── Evento Animal ─────────────────────────────────────────────────────────
export class CrearEventoAnimalDto {
  @IsString() @IsNotEmpty() @MaxLength(50) tipo!: string;
  @IsDateString() fecha!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) peso?: number;
  @IsOptional() @IsString() @MaxLength(200) producto?: string;
  @IsOptional() @IsString() @MaxLength(50) dosis?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costo?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) cantidadProduccion?: number;
  @IsOptional() @IsString() @MaxLength(20) unidadProduccion?: string;
  @IsOptional() @IsString() @MaxLength(200) responsable?: string;
  @IsOptional() @IsDateString() proximaFecha?: string;
  @IsOptional() @IsString() notas?: string;
}

// ── Insumo ────────────────────────────────────────────────────────────────
export class CrearInsumoDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(50) tipo?: string;
  @IsOptional() @IsString() @MaxLength(100) marca?: string;
  @IsOptional() @IsString() @MaxLength(100) presentacion?: string;
  @IsOptional() @IsString() @MaxLength(30) unidad?: string;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) stockActual?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) stockMinimo?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoUnitario?: number;
  @IsOptional() @IsBoolean() requiereReceta?: boolean;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) periodoCarencia?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
}

export class ActualizarInsumoDto extends PartialType(CrearInsumoDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Maquinaria ────────────────────────────────────────────────────────────
export class CrearMaquinariaDto {
  @IsString() @IsNotEmpty() @MaxLength(200) nombre!: string;
  @IsOptional() @IsString() @MaxLength(50) tipo?: string;
  @IsOptional() @IsString() @MaxLength(100) marca?: string;
  @IsOptional() @IsString() @MaxLength(100) modelo?: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) @Type(() => Number) anio?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) costoHora?: number;
  @IsOptional() @IsNumber(NUM2) @Min(0) @Type(() => Number) horasUso?: number;
  @IsOptional() @IsDateString() ultimoMantenimiento?: string;
  @IsOptional() @IsDateString() proximoMantenimiento?: string;
  @IsOptional() @IsIn(ESTADO_MAQUINARIA) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

export class ActualizarMaquinariaDto extends PartialType(CrearMaquinariaDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
