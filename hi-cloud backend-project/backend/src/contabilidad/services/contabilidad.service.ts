import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { generarNumeroSecuencial } from '../../common/utils/generar-numero.util';
import {
  CuentaContable,
  TipoCuenta,
  NaturalezaCuenta,
  AnexoIR2,
  TIPOS_POR_ANEXO_IR2,
  ClasificacionResultado,
} from '../entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from '../entities/cuenta-anexo-ir2.entity';
import { sugerirTipoGasto606, sugerirRequiereNCF } from '../../declaraciones/dgii.constants';
import { COD } from './asientos-automaticos.service';
import {
  AsientoContable,
  EstadoAsiento,
} from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { CreateCuentaContableDto, EtiquetaAnexoIR2Dto } from '../dto/create-cuenta-contable.dto';
import { UpdateCuentaContableDto } from '../dto/update-cuenta-contable.dto';
import { CreateAsientoDto } from '../dto/create-asiento.dto';
import { FiltroContabilidadDto } from '../dto/filtro-contabilidad.dto';
import { TenantService } from '../../tenant/tenant.service';

// ── Plan de Cuentas estándar dominicano ─────────────────────────────────────
interface SeedCuenta {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
  nivel: number;
  permiteMovimientos: boolean;
  // Etiquetas fiscales (Fase 2 del catálogo fiscal dominicano) — se
  // calculan en etiquetarFiscalmente(), no se escriben a mano aquí abajo.
  tipoGasto606?: string;
  /**
   * FASE 4 Bloque A — una cuenta puede aportar a varios anexos del IR-2 a
   * la vez (dejó de ser un solo AnexoIR2). seedPlanCuentas/onModuleInit
   * insertan una fila en cuenta_anexo_ir2 por cada elemento.
   */
  anexos?: { anexoIR2: AnexoIR2; casillaIR2?: string }[];
  requiereNCF?: boolean;
  // P3 Bloque 4 — se calcula en marcarCuentaSistema(), no se escribe a mano aquí abajo.
  esCuentaSistema?: boolean;
  /**
   * Estado de Resultados — solo se escribe a mano en las cuentas madre que
   * SÍ deben marcarse explícitamente (el resto hereda, ver
   * clasificacion-resultado.util.ts en reportes-financieros). Enriquecimiento
   * del catálogo (2026-09-21).
   */
  clasificacionResultado?: ClasificacionResultado;
}

const D = NaturalezaCuenta.DEUDORA;
const A = NaturalezaCuenta.ACREEDORA;

const PLAN_CUENTAS_BASE: SeedCuenta[] = [
  // ── CLASE 1 — ACTIVOS ──────────────────────────────────────────────────────
  { codigo: '1',          nombre: 'ACTIVOS',                           tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '1.1',        nombre: 'Activo Corriente',                  tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '1.1.1',      nombre: 'Efectivo y Equivalentes',           tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.1.01',   nombre: 'Caja Chica',                        tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.1.02',   nombre: 'Caja General',                      tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.1.03',   nombre: 'Bancos',                            tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2',      nombre: 'Cuentas por Cobrar',                tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.2.01',   nombre: 'Clientes',                          tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2.02',   nombre: 'Documentos por Cobrar',             tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3',      nombre: 'Inventarios',                       tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.3.01',   nombre: 'Mercancías para la Venta',          tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3.02',   nombre: 'Inventario de Producción en Proceso', tipo: TipoCuenta.ACTIVO,   naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3.03',   nombre: 'Inventario de Productos Terminados', tipo: TipoCuenta.ACTIVO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3.04',   nombre: 'Inventario de Materia Prima',       tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.4',      nombre: 'Impuestos Anticipados',             tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.4.01',   nombre: 'ITBIS Crédito Fiscal (Compras)',    tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2',        nombre: 'Activo No Corriente',               tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '1.2.1',      nombre: 'Propiedades, Planta y Equipo',      tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.2.1.01',   nombre: 'Muebles y Enseres',                 tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.02',   nombre: 'Equipos de Cómputo',                tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.03',   nombre: 'Vehículos',                         tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── CLASE 2 — PASIVOS ──────────────────────────────────────────────────────
  { codigo: '2',          nombre: 'PASIVOS',                           tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '2.1',        nombre: 'Pasivo Corriente',                  tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '2.1.1',      nombre: 'Cuentas por Pagar Comerciales',     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.1.01',   nombre: 'Proveedores',                       tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2',      nombre: 'Impuestos por Pagar',               tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.2.01',   nombre: 'ITBIS por Pagar (Ventas)',          tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.02',   nombre: 'ISR por Pagar',                     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.03',   nombre: 'Retenciones por Pagar',             tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3',      nombre: 'Obligaciones Laborales',            tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.3.01',   nombre: 'Sueldos por Pagar',                 tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.02',   nombre: 'TSS por Pagar',                     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.4',      nombre: 'Otras Cuentas por Pagar CP',        tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.5',      nombre: 'Anticipos de Clientes',             tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.5.01',   nombre: 'Anticipos Recibidos de Clientes',   tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  // Cuenta transitoria para costos de importación — se salda cuando llega la factura del agente aduanal
  { codigo: '2.1.6',      nombre: 'Cuentas Transitorias Corrientes',   tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.6.01',   nombre: 'Gastos de Importación por Aplicar', tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.2',        nombre: 'Pasivo No Corriente',               tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '2.2.1.01',   nombre: 'Préstamos Bancarios LP',            tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 3 — PATRIMONIO ───────────────────────────────────────────────────
  { codigo: '3',          nombre: 'PATRIMONIO',                        tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '3.1',        nombre: 'Capital Social',                    tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 2, permiteMovimientos: false },
  // '3.1.1' nunca se sembró como su propia fila — '3.1.1.01' quedaba huérfana
  // (cuentaPadreId se resuelve por prefijo de código). Mismo defecto que
  // '2.2.1' (ver más abajo) y '3.2.1'/'4.2.1' (aquí mismo) — se agrega el
  // grupo, el código de la cuenta existente NO cambia.
  { codigo: '3.1.1',      nombre: 'Aportes de Capital',                tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '3.1.1.01',   nombre: 'Capital Suscrito y Pagado',         tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2',        nombre: 'Resultados',                        tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '3.2.1',      nombre: 'Resultados Acumulados',             tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '3.2.1.01',   nombre: 'Utilidades Acumuladas',             tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2.1.02',   nombre: 'Resultado del Ejercicio',           tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 4 — INGRESOS ─────────────────────────────────────────────────────
  { codigo: '4',          nombre: 'INGRESOS',                          tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '4.1',        nombre: 'Ingresos Operacionales',            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '4.1.1',      nombre: 'Ventas',                            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '4.1.1.01',   nombre: 'Ventas de Bienes',                  tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.1.02',   nombre: 'Ventas de Servicios',               tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2',        nombre: 'Ingresos No Operacionales',         tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false, clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL },
  { codigo: '4.2.1',      nombre: 'Ingresos Financieros y Otros',      tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '4.2.1.01',   nombre: 'Ingresos Financieros',              tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2.1.02',   nombre: 'Otros Ingresos',                    tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 5 — COSTOS ───────────────────────────────────────────────────────
  { codigo: '5',          nombre: 'COSTOS',                            tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '5.1',        nombre: 'Costo de Ventas',                   tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '5.1.1',      nombre: 'Costo de Ventas Directos',          tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '5.1.1.01',   nombre: 'Costo de Ventas de Bienes',         tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '5.1.1.02',   nombre: 'Costo de Producción',               tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── CLASE 6 — GASTOS ───────────────────────────────────────────────────────
  { codigo: '6',          nombre: 'GASTOS',                            tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '6.1',        nombre: 'Gastos Operacionales',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '6.1.1',      nombre: 'Gastos de Personal',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.1.01',   nombre: 'Sueldos y Salarios',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.02',   nombre: 'TSS Patronal',                      tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.03',   nombre: 'Bonificaciones y Comisiones',       tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2',      nombre: 'Gastos Generales y Administración', tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.2.01',   nombre: 'Alquiler de Local',                 tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.02',   nombre: 'Servicios Públicos',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.03',   nombre: 'Comunicaciones',                    tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.04',   nombre: 'Materiales de Oficina',             tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.05',   nombre: 'Depreciación y Amortización',       tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.06',   nombre: 'ITBIS no Recuperable',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.2',        nombre: 'Gastos Operacionales Otros',        tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '6.2.1',      nombre: 'Gastos de Depreciación',            tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.2.1.01',   nombre: 'Gasto de Depreciación Activos',     tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.2',      nombre: 'Depreciación Acumulada',            tipo: TipoCuenta.ACTIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '1.2.2.01',   nombre: 'Deprec. Acumulada Activos Fijos',   tipo: TipoCuenta.ACTIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3',      nombre: 'Gastos Financieros',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false, clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL },
  { codigo: '6.1.3.01',   nombre: 'Intereses Bancarios',               tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.02',   nombre: 'Comisiones Bancarias',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── Cuentas que cierran códigos huérfanos del motor de asientos
  // automáticos (seguimiento post-P3, 2026-09-19) — el motor ya las
  // referencia por código desde antes de este catálogo (COD.* y literales
  // sueltos en asientos-automaticos.service.ts); nunca se habían sembrado,
  // así que esos asientos se descartaban en silencio ("cuenta no
  // encontrada", reportado a Sentry pero nunca corregido en el catálogo).
  { codigo: '1.1.2.10',   nombre: 'Cartera de Crédito (Préstamos Otorgados)', tipo: TipoCuenta.ACTIVO,   naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.4.02',   nombre: 'ITBIS Retenido a Recuperar (E41)',         tipo: TipoCuenta.ACTIVO,   naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.4.03',   nombre: 'ISR Retenido a Recuperar (E41)',           tipo: TipoCuenta.ACTIVO,   naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.04',   nombre: 'ISR Retenido por Pagar (E41)',             tipo: TipoCuenta.PASIVO,   naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.2',      nombre: 'Ingresos por Préstamos',                  tipo: TipoCuenta.INGRESO,  naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '4.1.2.01',   nombre: 'Intereses de Préstamos Otorgados',        tipo: TipoCuenta.INGRESO,  naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.2.02',   nombre: 'Mora de Préstamos Otorgados',             tipo: TipoCuenta.INGRESO,  naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.3',      nombre: 'Diferencial Cambiario (Ingreso)',         tipo: TipoCuenta.INGRESO,  naturaleza: A, nivel: 3, permiteMovimientos: false, clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL },
  { codigo: '4.1.3.01',   nombre: 'Ganancia en Diferencial Cambiario',       tipo: TipoCuenta.INGRESO,  naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.5',      nombre: 'Diferencial Cambiario (Gasto)',           tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 3, permiteMovimientos: false, clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL },
  { codigo: '6.1.5.01',   nombre: 'Pérdida en Diferencial Cambiario',        tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── Cuentas que cierran el mapeo CATEGORIA_LABELS de Gastos (selector de
  // cuenta contable, tarea 2026-09-19) — gastos.service.ts calcula la cuenta
  // de cada categoría desde CATEGORIA_LABELS (gasto.entity.ts) pero nunca la
  // pasaba al motor: todo gasto, sin importar su categoría, caía en
  // 6.1.2.04. De las 13 categorías, 5 apuntaban a un código que no existía
  // en el catálogo (Mantenimiento, Seguros, Otros, Gasto Menor, Impuestos)
  // y 2 apuntaban a un código que YA es de otra cuenta real (Transporte
  // reusaba 6.1.2.05 "Depreciación y Amortización"; Marketing reusaba
  // 6.1.2.06 "ITBIS no Recuperable") — esas 2 se reasignan a códigos nuevos
  // (.11/.12) en vez de robarle el código a una cuenta que ya existe y está
  // etiquetada. Los otros 5 solo necesitaban sembrarse — sus códigos
  // (.07-.10, 6.1.4.01) estaban libres.
  { codigo: '6.1.2.07',   nombre: 'Mantenimiento',                          tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.08',   nombre: 'Seguros',                                tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.09',   nombre: 'Otros Gastos',                           tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.10',   nombre: 'Gasto Menor',                            tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.11',   nombre: 'Transporte',                             tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.12',   nombre: 'Marketing y Publicidad',                 tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.4',      nombre: 'Impuestos y Tasas',                      tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.4.01',   nombre: 'Impuestos y Tasas',                      tipo: TipoCuenta.GASTO,    naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── Enriquecimiento del catálogo (2026-09-21) — conceptos de un catálogo
  // de referencia de otro ERP, reubicados dentro de la jerarquía 1.x.x.xx ya
  // existente de HiCloud. NINGÚN código existente se toca — solo se agregan
  // cuentas nuevas (y, arriba, se les puso clasificacionResultado a 4
  // cuentas madre YA existentes: 4.1.3, 4.2, 6.1.3, 6.1.5). Ver el reporte
  // del commit para el detalle de qué ya existía y qué quedó "sin anexo
  // claro" (gasto/costo sin keyword en sugerirTipoGasto606 — no se fuerza
  // ningún 606 a ciegas, mismo criterio del resto del seed).

  // ── 1.1.2 Cuentas por Cobrar — nuevas ──────────────────────────────────
  { codigo: '1.1.2.03',   nombre: 'CxC Empleados',                     tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2.04',   nombre: 'CxC Accionistas',                   tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2.05',   nombre: 'CxC Otros',                         tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  // Contra-cuenta de activo — naturaleza ACREEDORA a propósito (reduce Cuentas por Cobrar).
  { codigo: '1.1.2.06',   nombre: 'Provisión para Cuentas Incobrables', tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2.07',   nombre: 'Adelantos a Proveedores',           tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.1.3 Inventarios — nuevas ──────────────────────────────────────────
  { codigo: '1.1.3.05',   nombre: 'Compras en Tránsito',               tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3.06',   nombre: 'Inventario en Tránsito',            tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.1.4 Impuestos Anticipados — nueva ─────────────────────────────────
  // Distinta de ITBIS/ISR Retenido a Recuperar (1.1.4.02/.03, ya existentes,
  // que son retenciones que TERCEROS le hicieron a la empresa): esta es el
  // ISR que la EMPRESA adelanta por cuenta propia (pagos a cuenta/anticipos).
  { codigo: '1.1.4.04',   nombre: 'Anticipos de ISR',                  tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.1.5 Inversiones Temporales — grupo nuevo ──────────────────────────
  { codigo: '1.1.5',      nombre: 'Inversiones Temporales',            tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.5.01',   nombre: 'Inversiones a Corto Plazo',         tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.1.6 Gastos Pagados por Anticipado — grupo nuevo ───────────────────
  { codigo: '1.1.6',      nombre: 'Gastos Pagados por Anticipado',     tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.6.01',   nombre: 'Seguros Pagados por Anticipado',    tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.6.02',   nombre: 'Publicidad Pagada por Anticipado',  tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.2.1 Propiedades, Planta y Equipo — nuevas ─────────────────────────
  // "Vehículos" (1.2.1.03) y "Muebles y Enseres" (1.2.1.01) ya existían de
  // forma genérica — se dejan tal cual, estas son específicas adicionales.
  { codigo: '1.2.1.04',   nombre: 'Terrenos',                          tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.05',   nombre: 'Edificios',                         tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.06',   nombre: 'Equipos',                           tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.07',   nombre: 'Vehículos Livianos',                tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.08',   nombre: 'Vehículos Pesados',                 tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.09',   nombre: 'Mejoras a Propiedad Arrendada',     tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.10',   nombre: 'Otros Activos Fijos',               tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 1.2.2 Depreciación Acumulada — por clase, todas ACREEDORA (contra de activo) ──
  // Terrenos no se deprecia — sin contra propia. Muebles y Enseres ya tiene
  // su contra genérica en 1.2.2.01, no se duplica.
  { codigo: '1.2.2.02',   nombre: 'Depreciación Acumulada - Edificios',                     tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.2.03',   nombre: 'Depreciación Acumulada - Equipos',                       tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.2.04',   nombre: 'Depreciación Acumulada - Vehículos Livianos',            tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.2.05',   nombre: 'Depreciación Acumulada - Vehículos Pesados',             tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.2.06',   nombre: 'Depreciación Acumulada - Mejoras a Propiedad Arrendada', tipo: TipoCuenta.ACTIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 1.2.3 Inversiones a Largo Plazo — grupo nuevo ───────────────────────
  { codigo: '1.2.3',      nombre: 'Inversiones a Largo Plazo',         tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.2.3.01',   nombre: 'Inversiones a Largo Plazo',         tipo: TipoCuenta.ACTIVO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 2.1.1 Cuentas por Pagar Comerciales — nueva ─────────────────────────
  { codigo: '2.1.1.02',   nombre: 'Tarjeta de Crédito',                tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 2.1.2 Impuestos por Pagar — retenciones ISR POR CONCEPTO ────────────
  // Nunca con la tasa en el nombre — una tasa que cambia no debe obligar a
  // renombrar la cuenta. "Retenciones por Pagar" (2.1.2.03, genérica) se
  // deja tal cual; estas son las específicas por concepto.
  { codigo: '2.1.2.05',   nombre: 'Retención ISR Honorarios por Pagar',        tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.06',   nombre: 'Retención ISR Alquileres por Pagar',        tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.07',   nombre: 'Retención ISR Servicios Técnicos por Pagar', tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.08',   nombre: 'Retención ISR Pagos al Exterior por Pagar', tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.09',   nombre: 'Retención ISR Otras por Pagar',             tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.10',   nombre: 'ISC por Pagar',                            tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 2.1.3 Obligaciones Laborales — nuevas ───────────────────────────────
  // "Sueldos por Pagar" (2.1.3.01) y "TSS por Pagar" (2.1.3.02, genérica) se
  // dejan tal cual — Nómina por Pagar del pedido es la misma .01 existente.
  { codigo: '2.1.3.03',   nombre: 'Bonificaciones por Pagar',          tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.04',   nombre: 'Preaviso y Cesantía por Pagar',     tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.05',   nombre: 'TSS Retención Empleado por Pagar',  tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.06',   nombre: 'TSS Aporte Empleador por Pagar',    tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.07',   nombre: 'INFOTEP por Pagar',                 tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.08',   nombre: 'Propina Legal por Pagar',           tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 2.1.4 Otras Cuentas por Pagar CP — antes sin hijas ──────────────────
  { codigo: '2.1.4.01',   nombre: 'Dividendos por Pagar',              tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.4.02',   nombre: 'Intereses por Pagar',               tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 2.2.1 Préstamos y Financiamientos LP — el grupo nunca se sembró ────
  // '2.2.1.01 Préstamos Bancarios LP' ya existía pero quedaba sin madre real
  // (cuentaPadreId se resuelve por prefijo de código — 2.2.1 nunca fue su
  // propia fila). Se agrega el grupo; el código de la cuenta existente NO
  // cambia, solo empieza a colgar de un padre real.
  { codigo: '2.2.1',      nombre: 'Préstamos y Financiamientos LP',    tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.2.1.02',   nombre: 'Préstamos de Accionistas',          tipo: TipoCuenta.PASIVO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 3.2 Resultados — nuevas ──────────────────────────────────────────────
  // "Utilidades Acumuladas" (3.2.1.01) ya cubre "Utilidades retenidas".
  { codigo: '3.2.1.03',   nombre: 'Reserva Legal',                     tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2.1.04',   nombre: 'Saldos de Apertura',                tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 4.1.1 Ventas — contraingresos y descuento recibido ─────────────────
  // Descuentos/Devoluciones en Ventas son CONTRAINGRESO — naturaleza DEUDORA
  // a propósito (reducen Ventas, que es acreedora). Tipo sigue siendo
  // "ingreso": es lo que hace que aporten a B1 y entren en Ingresos del
  // Estado de Resultados con signo contrario, no un tipo "costo" ni "gasto".
  { codigo: '4.1.1.03',   nombre: 'Descuentos en Ventas',              tipo: TipoCuenta.INGRESO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.1.04',   nombre: 'Devoluciones en Ventas',            tipo: TipoCuenta.INGRESO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.1.05',   nombre: 'Descuentos por Pronto Pago Recibidos', tipo: TipoCuenta.INGRESO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 4.2.1 Ingresos No Operacionales — nuevas (heredan no_operacional de 4.2) ──
  { codigo: '4.2.1.03',   nombre: 'Intereses Ganados',                 tipo: TipoCuenta.INGRESO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2.1.04',   nombre: 'Ganancia en Venta de Activos',      tipo: TipoCuenta.INGRESO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── 5.1.1 Costo de Ventas Directos — nuevas ─────────────────────────────
  { codigo: '5.1.1.03',   nombre: 'Fletes en Compras',                 tipo: TipoCuenta.COSTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '5.1.1.04',   nombre: 'Mermas y Ajustes de Inventario',    tipo: TipoCuenta.COSTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.1 Gastos de Personal — nuevas ───────────────────────────────────
  // SFS/AFP llevan el nombre completo del aporte a propósito — además de
  // ser más claro para el contador, es lo que hace que sugerirTipoGasto606
  // los reconozca ("seguro familiar", "pension") en vez de quedar sin 606.
  { codigo: '6.1.1.04',   nombre: 'Horas Extras',                                    tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.05',   nombre: 'Vacaciones',                                      tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.06',   nombre: 'Regalía Pascual',                                 tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.07',   nombre: 'SFS Patronal (Seguro Familiar de Salud)',         tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.08',   nombre: 'AFP Patronal (Fondo de Pensiones)',               tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.09',   nombre: 'INFOTEP',                                         tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.10',   nombre: 'Seguro Médico',                                   tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.11',   nombre: 'Preaviso y Cesantía',                             tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.12',   nombre: 'Uniformes',                                       tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.13',   nombre: 'Capacitación',                                    tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.2 Gastos Generales y Administración — nuevas ────────────────────
  // "Comisiones de Tarjetas" se nombra sin la palabra "comisión" a propósito
  // — con ella, sugerirTipoGasto606 la etiquetaría con el código '01' de
  // NÓMINA (matchea el keyword genérico "comision"), un 606 genuinamente
  // incorrecto. Mejor sin anexo automático (se revisa a mano) que uno
  // equivocado.
  { codigo: '6.1.2.13',   nombre: 'Suministros',                       tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.14',   nombre: 'Limpieza',                          tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.15',   nombre: 'Honorarios Contables',              tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.16',   nombre: 'Honorarios Legales',                tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.17',   nombre: 'Honorarios Técnicos',                tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.18',   nombre: 'Cargos por Procesamiento de Tarjetas', tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.19',   nombre: 'ISC',                               tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.20',   nombre: 'Gasto de Cuentas Incobrables',      tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.3 Gastos Financieros — nuevas (heredan no_operacional) ─────────
  // "Gastos Bancarios" (no "Cargos Bancarios") a propósito — matchea el
  // keyword real ("gasto bancario"/"gastos bancarios") de sugerirTipoGasto606.
  { codigo: '6.1.3.03',   nombre: 'Gastos Bancarios',                  tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.04',   nombre: 'Impuesto a Cheques y Transferencias', tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.05',   nombre: 'Intereses de Préstamos',            tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.06',   nombre: 'Intereses de Tarjetas de Crédito',  tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.6 Gastos de Mercadeo — grupo nuevo ──────────────────────────────
  // "Marketing y Publicidad" (6.1.2.12, genérica) se deja tal cual.
  { codigo: '6.1.6',      nombre: 'Gastos de Mercadeo',                tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.6.01',   nombre: 'Publicidad Digital',                tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.6.02',   nombre: 'Publicidad Tradicional',            tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.6.03',   nombre: 'Promociones',                       tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.6.04',   nombre: 'Redes Sociales',                    tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.6.05',   nombre: 'Representación',                    tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.6.06',   nombre: 'Viajes',                            tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.7 Impuesto Sobre la Renta — grupo nuevo ─────────────────────────
  // Se deja OPERACIONAL (no marcado) — el pedido lo listó dentro de "Gastos",
  // no en la sección explícita de "No operacionales".
  { codigo: '6.1.7',      nombre: 'Impuesto Sobre la Renta',           tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.7.01',   nombre: 'Impuesto Sobre la Renta',           tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.1.8 Otros Gastos No Operacionales — grupo nuevo, marcado explícito ──
  { codigo: '6.1.8',      nombre: 'Otros Gastos No Operacionales',     tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 3, permiteMovimientos: false, clasificacionResultado: ClasificacionResultado.NO_OPERACIONAL },
  { codigo: '6.1.8.01',   nombre: 'Pérdida por Venta de Activos',      tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.8.02',   nombre: 'Redondeos',                         tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── 6.2.1 Gastos de Depreciación — por clase ────────────────────────────
  // Muebles y Enseres se queda con la genérica existente (6.2.1.01), no se duplica.
  { codigo: '6.2.1.02',   nombre: 'Depreciación - Edificios',                       tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.2.1.03',   nombre: 'Depreciación - Equipos',                         tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.2.1.04',   nombre: 'Depreciación - Vehículos Livianos',              tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.2.1.05',   nombre: 'Depreciación - Vehículos Pesados',               tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.2.1.06',   nombre: 'Depreciación - Mejoras a Propiedad Arrendada',   tipo: TipoCuenta.GASTO, naturaleza: D, nivel: 4, permiteMovimientos: true },
];

// ── Etiquetas fiscales del seed (Fase 2 — catálogo fiscal dominicano) ──────
//
// Solo se pone lo que se puede responder con confianza (diagnóstico de
// Fase 2, 2026-09-19 — 35 empresas, 100% del catálogo idéntico a este
// seed):
//   - tipoGasto606/requiereNCF: cuentas de movimiento de tipo gasto o
//     costo, vía los diccionarios de dgii.constants.ts. "ITBIS no
//     Recuperable" no calza en ninguno de los dos a propósito — es la
//     única cuenta genuinamente ambigua del seed; Jean la confirma con su
//     contador antes de la Fase 3.
//   - anexos: activo/pasivo/patrimonio → 'A1' (Balance); ingreso → 'B1'
//     (Resultados); costo/gasto → 'B1' o 'D' pero SOLO si la cuenta ya
//     tiene un tipoGasto606 confiable (si no lo tiene, tampoco se afirma
//     su anexo — mismo criterio de "sin dictamen, sin etiqueta").
//   - CASO DE REFERENCIA, no una excepción — las 4 cuentas de Inventario
//     (1.1.3.01 a 1.1.3.04): el Anexo A1 (Balance) necesita su saldo de
//     cierre y el Anexo D (Costo de Venta) necesita su Inventario
//     Inicial/Final — la MISMA cuenta alimenta ambos anexos a la vez.
//     Hasta Fase 3 `anexoIR2` era una sola columna por cuenta y forzar
//     'A1' perdía su lugar en D (y viceversa), así que se dejaban sin
//     ninguna etiqueta. FASE 4 Bloque A convierte esto en una relación
//     (`anexos: []`, ver cuenta-anexo-ir2.entity.ts) — estas 4 cuentas
//     ahora llevan ambos anexos, con la casilla D que les corresponde.
//   - casillaIR2 solo se puebla donde es una traducción directa del
//     nombre de la cuenta (las 4 de Inventario, en D) — en todo lo demás
//     sigue sin poblarse: no hay números de casilla de DGII verificados
//     para el resto (Fase 3 solo confirmó casillas del Anexo B-1/D vía la
//     tabla CORRESPONDENCIA_606_IR2, no una por cada cuenta del catálogo).
const CASILLA_D_POR_CUENTA_INVENTARIO: Record<string, string> = {
  '1.1.3.01': 'inv_mercancias',
  '1.1.3.02': 'inv_produccion_proceso',
  '1.1.3.03': 'inv_productos_terminados',
  '1.1.3.04': 'inv_materia_prima',
};

function etiquetarFiscalmente(c: SeedCuenta): SeedCuenta {
  if (!c.permiteMovimientos) return c; // las de agrupación no se etiquetan

  const etiquetas: Partial<SeedCuenta> = {};
  const anexos: { anexoIR2: AnexoIR2; casillaIR2?: string }[] = [];

  if (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO) {
    const sugerido606 = sugerirTipoGasto606(c.nombre);
    if (sugerido606) etiquetas.tipoGasto606 = sugerido606;
    const sugeridoNCF = sugerirRequiereNCF(c.nombre);
    if (sugeridoNCF !== null) etiquetas.requiereNCF = sugeridoNCF;
  }

  const casillaDInventario = CASILLA_D_POR_CUENTA_INVENTARIO[c.codigo];
  if (c.tipo === TipoCuenta.ACTIVO || c.tipo === TipoCuenta.PASIVO || c.tipo === TipoCuenta.PATRIMONIO) {
    anexos.push({ anexoIR2: AnexoIR2.A1 });
    if (casillaDInventario) anexos.push({ anexoIR2: AnexoIR2.D, casillaIR2: casillaDInventario });
  } else if (c.tipo === TipoCuenta.INGRESO) {
    anexos.push({ anexoIR2: AnexoIR2.B1 });
  } else if (c.tipo === TipoCuenta.COSTO) {
    if (etiquetas.tipoGasto606) anexos.push({ anexoIR2: AnexoIR2.D });
  } else if (c.tipo === TipoCuenta.GASTO) {
    if (etiquetas.tipoGasto606) anexos.push({ anexoIR2: AnexoIR2.B1 });
  }

  if (anexos.length) etiquetas.anexos = anexos;
  return { ...c, ...etiquetas };
}

// ── Cuentas del sistema (P3 Bloque 4, ampliado 2026-09-19) ──────────────
// Códigos que el motor de asientos automáticos referencia por CÓDIGO, no
// por id — si un contador les cambia el código, ese tipo de asiento deja
// de encontrar la cuenta y muere en silencio para toda la empresa.
// Object.values(COD) cubre los 20 valores de COD.*, de los cuales 3
// (GANANCIA_CAMBIARIA, PERDIDA_CAMBIARIA, ISR_RET_POR_PAGAR) recién se
// sembraron arriba en esta misma actualización — antes no existían en
// absoluto. Los otros 5 (Cartera de Crédito, ITBIS/ISR retenido a
// recuperar, intereses/mora de préstamos) el motor los referencia por
// LITERAL directo, no vía COD — mismo riesgo exacto, así que se agregan
// a mano en vez de dejarlos fuera solo porque no tienen su propia
// constante nombrada.
const CODIGOS_SISTEMA = new Set<string>([
  ...Object.values(COD),
  '1.1.4.02', '1.1.4.03', '1.1.2.10', '4.1.2.01', '4.1.2.02',
]);

function marcarCuentaSistema(c: SeedCuenta): SeedCuenta {
  return CODIGOS_SISTEMA.has(c.codigo) ? { ...c, esCuentaSistema: true } : c;
}

// Exportado solo para testearlo directamente (contabilidad-plan-cuentas-etiquetas.spec.ts)
// — ningún otro módulo lo consume, el seed sigue siendo interno a este servicio.
export const PLAN_CUENTAS: SeedCuenta[] =
  PLAN_CUENTAS_BASE.map(etiquetarFiscalmente).map(marcarCuentaSistema);

@Injectable()
export class ContabilidadService implements OnModuleInit {
  private readonly logger = new Logger(ContabilidadService.name);

  constructor(
    @InjectRepository(CuentaContable)
    private cuentaRepository:  Repository<CuentaContable>,
    @InjectRepository(CuentaAnexoIR2)
    private anexoRepository:   Repository<CuentaAnexoIR2>,
    @InjectRepository(AsientoContable)
    private asientoRepository: Repository<AsientoContable>,
    @InjectRepository(AsientoLinea)
    private lineaRepository:   Repository<AsientoLinea>,
    private tenantService:     TenantService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // P3 Bloque 5 — antes el try/catch absorbía la ForbiddenException de
  // getEmpresaId() y devolvía undefined, que en cada `if (this.eid)
  // where.empresaId = this.eid` de este archivo se traduce en "no filtres
  // por empresa": sin contexto de tenant, cualquier consulta se volvía
  // cross-tenant en vez de fallar. Mismo fix ya aplicado en
  // balance-comprobacion.service.ts (commit 3b7de56a) — fallar cerrado.
  private get eid(): number {
    return this.tenantService.getEmpresaId();
  }

  /**
   * FASE 4 Bloque A — inserta las filas de cuenta_anexo_ir2 de una cuenta
   * recién sembrada. Solo se llama justo después de crear la cuenta (nunca
   * sobre una que ya existía — seedPlanCuentas la salta con `omitidas++`
   * antes de llegar aquí), así que no hace falta borrar nada primero.
   */
  private async guardarAnexosSeed(
    cuentaContableId: number,
    empresaId: number | undefined,
    anexos: { anexoIR2: AnexoIR2; casillaIR2?: string }[] | undefined,
  ): Promise<void> {
    for (const a of anexos ?? []) {
      await this.anexoRepository.save(
        this.anexoRepository.create({ cuentaContableId, empresaId, anexoIR2: a.anexoIR2, casillaIR2: a.casillaIR2 }),
      );
    }
  }

  /**
   * Siembra el Plan de Cuentas dominicano para una empresa específica.
   * Idempotente: solo agrega cuentas que no existan por (codigo, empresaId).
   * Retorna estadísticas { agregadas, omitidas }.
   */
  async seedPlanCuentas(
    empresaId: number,
    soloCodigosNuevos?: string[],
  ): Promise<{ agregadas: number; omitidas: number }> {
    let agregadas = 0;
    let omitidas = 0;

    const cuentas = soloCodigosNuevos
      ? PLAN_CUENTAS.filter((c) => soloCodigosNuevos.includes(c.codigo))
      : PLAN_CUENTAS;

    // Procesar por niveles para respetar FK padre→hijo
    for (let nivel = 1; nivel <= 4; nivel++) {
      for (const c of cuentas.filter((x) => x.nivel === nivel)) {
        const existe = await this.cuentaRepository.findOne({
          where: { codigo: c.codigo, empresaId } as any,
        });
        if (existe) {
          omitidas++;
          continue;
        }

        const codigoPadre = c.codigo.split('.').slice(0, -1).join('.');
        let cuentaPadreId: number | undefined;
        if (codigoPadre) {
          const padre = await this.cuentaRepository.findOne({
            where: { codigo: codigoPadre, empresaId } as any,
          });
          cuentaPadreId = padre?.id;
        }

        const { anexos, ...cuentaSeed } = c;
        // NUNCA castear el argumento de create() a `any` — resuelve el
        // overload equivocado (el que devuelve un arreglo) y `guardada`
        // deja de tener `.id` en tiempo de compilación sin que tsc avise
        // en el `await this.cuentaRepository.save(...)` de encima (trampa
        // ya documentada esta misma sesión, ver memoria del proyecto).
        const guardada: CuentaContable = await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...cuentaSeed, empresaId, cuentaPadreId }),
        );
        await this.guardarAnexosSeed(guardada.id, empresaId, anexos);
        agregadas++;
        this.logger.log(
          `[seedPlanCuentas] empresa=${empresaId} cuenta=${c.codigo} agregada`,
        );
      }
    }

    this.logger.log(
      `[seedPlanCuentas] empresa=${empresaId}: ${agregadas} agregadas, ${omitidas} omitidas`,
    );
    return { agregadas, omitidas };
  }

  /**
   * Sincroniza el plan de cuentas para todas las empresas activas (o una sola si se especifica).
   * Idempotente — solo agrega cuentas faltantes sin tocar las existentes.
   */
  async sincronizarPlanCuentasTodas(soloEmpresaId?: number): Promise<{
    procesadas: number;
    cuentasAgregadas: number;
    errores: string[];
  }> {
    const errores: string[] = [];
    let procesadas = 0;
    let cuentasAgregadas = 0;

    let empresaIds: number[];
    if (soloEmpresaId) {
      empresaIds = [soloEmpresaId];
    } else {
      const rows = await this.dataSource.query(
        `SELECT id FROM empresa WHERE "isActive" = true ORDER BY id`,
      ) as { id: number }[];
      empresaIds = rows.map((r) => r.id);
    }

    this.logger.log(
      `[sincronizarPlanCuentas] iniciando para ${empresaIds.length} empresa(s)`,
    );

    for (const empId of empresaIds) {
      try {
        const { agregadas } = await this.seedPlanCuentas(empId);
        cuentasAgregadas += agregadas;
        procesadas++;
      } catch (err: any) {
        const msg = `empresa ${empId}: ${err?.message ?? 'error desconocido'}`;
        this.logger.error(`[sincronizarPlanCuentas] ${msg}`);
        errores.push(msg);
      }
    }

    this.logger.log(
      `[sincronizarPlanCuentas] completado: ${procesadas} empresas, ${cuentasAgregadas} cuentas nuevas, ${errores.length} errores`,
    );
    return { procesadas, cuentasAgregadas, errores };
  }

  // ──────────────────────────────────────────────────────────────────
  // Seed — Plan de Cuentas dominicano
  // ──────────────────────────────────────────────────────────────────

  async onModuleInit() {
    // Si SEED_PLAN_CUENTAS_RUN=true, sincronizar cuentas faltantes en todas las empresas activas
    if (process.env.SEED_PLAN_CUENTAS_RUN === 'true') {
      this.logger.log(
        '[onModuleInit] SEED_PLAN_CUENTAS_RUN=true — iniciando re-sembrado del plan de cuentas...',
      );
      try {
        const result = await this.sincronizarPlanCuentasTodas();
        this.logger.log(
          `[onModuleInit] re-sembrado completado: ${result.procesadas} empresas, ${result.cuentasAgregadas} cuentas agregadas`,
        );
      } catch (err: any) {
        this.logger.error(`[onModuleInit] re-sembrado falló: ${err?.message}`);
      }
      return;
    }

    // Comportamiento legacy: sembrar una sola vez si no hay ninguna cuenta en absoluto
    const total = await this.cuentaRepository.count();
    if (total > 0) return;

    // Insertar por niveles para respetar la FK padre→hijo (solo si no hay ninguna cuenta)
    for (let nivel = 1; nivel <= 4; nivel++) {
      for (const c of PLAN_CUENTAS.filter((x) => x.nivel === nivel)) {
        const codigoPadre = c.codigo.split('.').slice(0, -1).join('.');
        let cuentaPadreId: number | undefined;

        if (codigoPadre) {
          const padre = await this.cuentaRepository.findOne({
            where: { codigo: codigoPadre },
          });
          cuentaPadreId = padre?.id;
        }

        const { anexos, ...cuentaSeed } = c;
        const guardada: CuentaContable = await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...cuentaSeed, cuentaPadreId }),
        );
        await this.guardarAnexosSeed(guardada.id, guardada.empresaId, anexos);
      }
    }

    this.logger.log(`Plan de Cuentas dominicano sembrado: ${PLAN_CUENTAS.length} cuentas`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Plan de Cuentas — CRUD
  // ──────────────────────────────────────────────────────────────────

  /**
   * UI — filtros por clasificación y estado (2026-09-21). "Clasificación"
   * son los 6 valores de TipoCuenta que YA existe en el modelo — no se
   * inventa ninguna categoría nueva, la URL solo usa nombres en español
   * plural (más legibles al compartir un link) que se traducen aquí.
   * "capital" en la URL es TipoCuenta.PATRIMONIO — el enum del modelo dice
   * "patrimonio", nunca "capital"; se usa el nombre coloquial solo en la
   * URL/UI, jamás como valor real.
   */
  private static readonly CLASIFICACION_A_TIPO: Record<string, TipoCuenta> = {
    activos:  TipoCuenta.ACTIVO,
    pasivos:  TipoCuenta.PASIVO,
    capital:  TipoCuenta.PATRIMONIO,
    ingresos: TipoCuenta.INGRESO,
    costos:   TipoCuenta.COSTO,
    gastos:   TipoCuenta.GASTO,
  };

  /**
   * Query base del catálogo — un solo QueryBuilder que arma tanto la lista
   * (paginada por el cliente, como siempre) como los conteos de los chips,
   * para que ambos respondan exactamente a los mismos filtros. `estado`
   * "grupo" no es un booleano propio del modelo (no existía "cuenta grupo"
   * como campo) — se deriva, tal como pidió el punto 1 del encargo, de
   * permiteMovimientos=false Y que tenga al menos una hija; una cuenta de
   * agrupación recién creada sin hijas todavía no agrupa nada.
   */
  private construirQueryCuentas(filtros: {
    search?: string; clasificacion?: string; estado?: string; soloMovimientos?: boolean;
  }) {
    // this.eid PRIMERO — fail-closed: si no hay contexto de tenant, lanza
    // ForbiddenException antes de tocar el repositorio, no después.
    const eid = this.eid;
    const qb = this.cuentaRepository.createQueryBuilder('c')
      .leftJoinAndSelect('c.cuentaPadre', 'padre');
    if (eid) qb.andWhere('c.empresaId = :eid', { eid });
    if (filtros.soloMovimientos) qb.andWhere('c.permiteMovimientos = true');
    if (filtros.search?.trim()) {
      qb.andWhere('(c.codigo ILIKE :search OR c.nombre ILIKE :search)', { search: `%${filtros.search.trim()}%` });
    }

    const tipo = filtros.clasificacion ? ContabilidadService.CLASIFICACION_A_TIPO[filtros.clasificacion] : undefined;
    if (tipo) qb.andWhere('c.tipo = :tipo', { tipo });

    // Sin estado (compatibilidad con callers que no lo mandan) o "activas":
    // mismo comportamiento de siempre, isActive=true. "todas" es la única
    // forma explícita de ver también las inactivas.
    if (!filtros.estado || filtros.estado === 'activas') {
      qb.andWhere('c.isActive = true');
    } else if (filtros.estado === 'inactivas') {
      qb.andWhere('c.isActive = false');
    } else if (filtros.estado === 'grupo') {
      qb.andWhere('c.permiteMovimientos = false')
        .andWhere('EXISTS (SELECT 1 FROM cuentas_contables hijo WHERE hijo."cuentaPadreId" = c.id AND hijo."isActive" = true)');
    }
    // 'todas': sin filtro de isActive.

    return qb;
  }

  /**
   * Conteos de los chips — SIEMPRE respetan `search` (y soloMovimientos si
   * se pidió), pero NUNCA la clasificación/estado ya elegidos: cada grupo de
   * chips cuenta como si el otro grupo estuviera en "Todas", que es el
   * criterio estándar de conteos "faceted" (como los contadores de Gmail) y
   * evita que un chip desaparezca o quede en 0 por su propia selección.
   */
  private async contarCuentas(filtros: { search?: string; soloMovimientos?: boolean }) {
    const eid = this.eid; // fail-closed, una sola lectura para las 11 queries de abajo
    const base = () => {
      const qb = this.cuentaRepository.createQueryBuilder('c');
      if (eid) qb.andWhere('c.empresaId = :eid', { eid });
      if (filtros.soloMovimientos) qb.andWhere('c.permiteMovimientos = true');
      if (filtros.search?.trim()) {
        qb.andWhere('(c.codigo ILIKE :search OR c.nombre ILIKE :search)', { search: `%${filtros.search.trim()}%` });
      }
      return qb;
    };

    const [
      todasClasif, activo, pasivo, patrimonio, ingreso, costo, gasto,
      todasEstado, activas, inactivas, grupo,
    ] = await Promise.all([
      base().getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.ACTIVO }).getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.PASIVO }).getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.PATRIMONIO }).getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.INGRESO }).getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.COSTO }).getCount(),
      base().andWhere('c.tipo = :t', { t: TipoCuenta.GASTO }).getCount(),
      base().getCount(),
      base().andWhere('c.isActive = true').getCount(),
      base().andWhere('c.isActive = false').getCount(),
      base()
        .andWhere('c.permiteMovimientos = false')
        .andWhere('EXISTS (SELECT 1 FROM cuentas_contables hijo WHERE hijo."cuentaPadreId" = c.id AND hijo."isActive" = true)')
        .getCount(),
    ]);

    return {
      clasificacion: { todas: todasClasif, activos: activo, pasivos: pasivo, capital: patrimonio, ingresos: ingreso, costos: costo, gastos: gasto },
      estado: { todas: todasEstado, activas, inactivas, grupo },
    };
  }

  async getCuentas(opciones: {
    soloMovimientos?: boolean; search?: string; clasificacion?: string; estado?: string;
  } = {}) {
    const [cuentas, conteos] = await Promise.all([
      this.construirQueryCuentas(opciones).orderBy('c.codigo', 'ASC').getMany(),
      this.contarCuentas({ search: opciones.search, soloMovimientos: opciones.soloMovimientos }),
    ]);
    return { data: await this.attachAnexos(cuentas), conteos };
  }

  /**
   * FASE 4 Bloque A — trae, en una sola consulta, las filas de
   * cuenta_anexo_ir2 de un lote de cuentas y las adjunta como
   * `anexosIR2: { anexoIR2, casillaIR2 }[]` en cada una. Sustituye a la
   * columna única `anexoIR2` que existía hasta Fase 3 — una cuenta puede
   * aparecer en más de un anexo del IR-2 a la vez (ver
   * cuenta-anexo-ir2.entity.ts).
   */
  private async attachAnexos<T extends CuentaContable>(
    cuentas: T[],
  ): Promise<(T & { anexosIR2: { anexoIR2: AnexoIR2; casillaIR2?: string }[] })[]> {
    if (cuentas.length === 0) return [];
    const where: any = { cuentaContableId: In(cuentas.map((c) => c.id)), isActive: true };
    if (this.eid) where.empresaId = this.eid;
    const filas = await this.anexoRepository.find({ where });
    const porCuenta = new Map<number, { anexoIR2: AnexoIR2; casillaIR2?: string }[]>();
    for (const f of filas) {
      const arr = porCuenta.get(f.cuentaContableId) ?? [];
      arr.push({ anexoIR2: f.anexoIR2, casillaIR2: f.casillaIR2 });
      porCuenta.set(f.cuentaContableId, arr);
    }
    return cuentas.map((c) => ({ ...c, anexosIR2: porCuenta.get(c.id) ?? [] }));
  }

  /**
   * Cuentas de movimiento a las que les falta al menos una etiqueta fiscal
   * que SÍ les aplica — la lista de trabajo del contador (Fase 2 del
   * catálogo fiscal dominicano). Mismo criterio "OR por campo aplicable"
   * que la columna "606 / IR-2" de PlanCuentasPage.tsx en el frontend:
   *   - gasto/costo sin tipoGasto606 → aparece (aunque ya tenga anexos).
   *   - cualquier tipo sin NINGÚN anexo → aparece (aunque ya tenga tipoGasto606).
   * Una cuenta de activo/pasivo/patrimonio/ingreso nunca puede deberle
   * tipoGasto606 (no le aplica), así que para esas el único gate real es
   * tener al menos un anexo — que es justo lo que hasta Fase 3 dejaban
   * vacío, a propósito, las 4 cuentas de Inventario y "ITBIS no Recuperable".
   */
  async getCuentasSinEtiquetar() {
    const where: any = { isActive: true, permiteMovimientos: true };
    if (this.eid) where.empresaId = this.eid;
    const cuentas = await this.cuentaRepository.find({ where, order: { codigo: 'ASC' } });
    const conAnexos = await this.attachAnexos(cuentas);
    return conAnexos.filter((c) => {
      const leFaltaGasto606 = (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO) && !c.tipoGasto606;
      const leFaltaAnexo = c.anexosIR2.length === 0;
      return leFaltaGasto606 || leFaltaAnexo;
    });
  }

  async findCuentaById(id: number) {
    const where: any = { id, isActive: true };
    if (this.eid) where.empresaId = this.eid;
    const c = await this.cuentaRepository.findOne({ where });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    const [conAnexos] = await this.attachAnexos([c]);
    return conAnexos;
  }

  async createCuenta(dto: CreateCuentaContableDto) {
    const where: any = { codigo: dto.codigo };
    if (this.eid) where.empresaId = this.eid;
    const existe = await this.cuentaRepository.findOne({ where });
    if (existe) throw new ConflictException(`Código ${dto.codigo} ya existe`);
    await this.validarPadreYEtiquetas(dto);
    const eid = this.eid;
    const { etiquetasAnexoIR2, ...restoDto } = dto;
    const guardada = await this.cuentaRepository.save(
      this.cuentaRepository.create({ ...restoDto, ...(eid ? { empresaId: eid } : {}) }),
    );
    await this.reemplazarAnexos(guardada.id, eid, etiquetasAnexoIR2);
    return this.findCuentaById(guardada.id);
  }

  async updateCuenta(id: number, dto: UpdateCuentaContableDto) {
    const actual = await this.findCuentaById(id);
    // P3 Bloque 4: el código de una cuenta del sistema es lo que el motor
    // de asientos automáticos usa para encontrarla (COD.* en
    // asientos-automaticos.service.ts) — cambiarlo la vuelve invisible
    // para ese motor sin que nadie lo note hasta que falte un asiento. El
    // nombre y la descripción siguen editables sin restricción.
    if (actual.esCuentaSistema && dto.codigo !== undefined && dto.codigo !== actual.codigo) {
      throw new BadRequestException(
        `"${actual.nombre}" es una cuenta del sistema — su código no se puede modificar (el motor de asientos automáticos la usa para contabilizar facturas, compras, cobros u otros documentos)`,
      );
    }
    await this.validarPadreYEtiquetas(dto, actual, id);
    const { etiquetasAnexoIR2, ...restoDto } = dto;
    if (Object.keys(restoDto).length > 0) await this.cuentaRepository.update(id, restoDto);
    // undefined = el PATCH no tocó los anexos, se dejan como estaban;
    // [] (arreglo vacío) SÍ es una instrucción explícita de vaciarlos.
    if (etiquetasAnexoIR2 !== undefined) {
      await this.reemplazarAnexos(id, this.eid ?? actual.empresaId, etiquetasAnexoIR2);
    }
    return this.findCuentaById(id);
  }

  /**
   * FASE 4 Bloque A — reemplaza TODA la lista de anexos IR-2 de una cuenta
   * (desactiva las filas activas existentes e inserta las nuevas). Nunca
   * hace un borrado físico — mismo criterio "isActive=false" que el resto
   * del catálogo — para no romper una FK si algún día se auditan estas
   * filas históricamente.
   */
  private async reemplazarAnexos(
    cuentaContableId: number,
    empresaId: number | undefined,
    anexos: EtiquetaAnexoIR2Dto[] | undefined,
  ): Promise<void> {
    await this.anexoRepository.update({ cuentaContableId }, { isActive: false });
    for (const a of anexos ?? []) {
      await this.anexoRepository.save(
        this.anexoRepository.create({ cuentaContableId, empresaId, anexoIR2: a.anexoIR2, casillaIR2: a.casillaIR2 }),
      );
    }
  }

  /**
   * Validaciones de integridad del catálogo — antes no existían y se podían
   * crear cuentas huérfanas o incoherentes con su padre.
   *
   * 1. Si viene cuentaPadreId: debe existir (en el tenant), no puede ser la
   *    propia cuenta, y el tipo/naturaleza de la cuenta deben coincidir con
   *    los del padre (una subcuenta de "Gastos" no puede ser tipo ingreso).
   * 2. Etiquetas fiscales (Fase 1 del catálogo fiscal dominicano) — todas
   *    solo en cuentas de movimiento (permiteMovimientos=true); la
   *    restricción de TIPO difiere por etiqueta:
   *      - tipoGasto606/requiereNCF: solo gasto o costo (el 606 declara
   *        compras y gastos, no partidas de balance).
   *      - etiquetasAnexoIR2 (FASE 4 Bloque A): cualquier tipo, pero cada
   *        elemento coherente con TIPOS_POR_ANEXO_IR2 — A1 (Balance) exige
   *        activo/pasivo/patrimonio, B1 (Resultados) exige ingreso/costo/
   *        gasto, D (Costo de Venta) exige activo o costo. Una cuenta no
   *        puede repetir el mismo anexo dos veces. No se valida que la
   *        cuenta "activo" sea específicamente Inventario y no, por
   *        ejemplo, Caja — adivinar semántica de cuenta queda fuera de
   *        esta fase, igual que hoy no se valida qué código 606 exacto
   *        corresponde a cada gasto.
   *
   * Las etiquetas se validan sobre el estado EFECTIVO resultante (dto
   * fusionado sobre cuentaActual), no solo sobre los campos que el dto
   * toca: en un updateCuenta que solo cambia "tipo", los anexos que ya
   * estaban guardados y quedan incoherentes con el tipo nuevo también se
   * rechazan, aunque ese dto ni mencione etiquetasAnexoIR2 — para eso se
   * consultan los anexos ya guardados cuando el dto no los toca.
   */
  private async validarPadreYEtiquetas(
    dto: Partial<CreateCuentaContableDto>,
    cuentaActual?: CuentaContable,
    idActual?: number,
  ): Promise<void> {
    if (dto.cuentaPadreId !== undefined && dto.cuentaPadreId !== null) {
      if (idActual !== undefined && dto.cuentaPadreId === idActual) {
        throw new BadRequestException('Una cuenta no puede ser su propio padre');
      }
      const where: any = { id: dto.cuentaPadreId, isActive: true };
      if (this.eid) where.empresaId = this.eid;
      const padre = await this.cuentaRepository.findOne({ where });
      if (!padre) {
        throw new NotFoundException(`Cuenta padre #${dto.cuentaPadreId} no existe`);
      }

      const tipoEfectivo = dto.tipo ?? cuentaActual?.tipo;
      if (tipoEfectivo && padre.tipo !== tipoEfectivo) {
        throw new BadRequestException(
          `El tipo de la cuenta (${tipoEfectivo}) no coincide con el de la cuenta padre "${padre.nombre}" (${padre.tipo})`,
        );
      }

      const naturalezaEfectiva = dto.naturaleza ?? cuentaActual?.naturaleza;
      if (naturalezaEfectiva && padre.naturaleza !== naturalezaEfectiva) {
        throw new BadRequestException(
          `La naturaleza de la cuenta (${naturalezaEfectiva}) no coincide con la de la cuenta padre "${padre.nombre}" (${padre.naturaleza})`,
        );
      }
    }

    // Se valida el estado EFECTIVO resultante (dto fusionado sobre lo ya
    // guardado), no solo los campos que el dto toca — así, cambiar el tipo
    // de una cuenta que YA tenía una etiqueta fiscal también se valida,
    // aunque el dto de ese update ni mencione la etiqueta.
    const tipoEfectivo               = dto.tipo ?? cuentaActual?.tipo;
    const permiteMovimientosEfectivo = dto.permiteMovimientos ?? cuentaActual?.permiteMovimientos;
    const tipoGasto606Efectivo = dto.tipoGasto606 !== undefined ? dto.tipoGasto606 : cuentaActual?.tipoGasto606;
    const requiereNCFEfectivo  = dto.requiereNCF  !== undefined ? dto.requiereNCF  : cuentaActual?.requiereNCF;

    let anexosEfectivos: EtiquetaAnexoIR2Dto[];
    if (dto.etiquetasAnexoIR2 !== undefined) {
      anexosEfectivos = dto.etiquetasAnexoIR2;
    } else if (idActual !== undefined) {
      const where: any = { cuentaContableId: idActual, isActive: true };
      if (this.eid) where.empresaId = this.eid;
      anexosEfectivos = await this.anexoRepository.find({ where });
    } else {
      anexosEfectivos = [];
    }

    const tieneGasto606OContribuyente =
      (tipoGasto606Efectivo !== undefined && tipoGasto606Efectivo !== null) ||
      (requiereNCFEfectivo  !== undefined && requiereNCFEfectivo  !== null);

    if ((tieneGasto606OContribuyente || anexosEfectivos.length > 0) && !permiteMovimientosEfectivo) {
      throw new BadRequestException(
        'Las etiquetas fiscales solo se pueden asignar a cuentas de movimiento, no de agrupación',
      );
    }

    if (tieneGasto606OContribuyente) {
      if (tipoEfectivo !== TipoCuenta.GASTO && tipoEfectivo !== TipoCuenta.COSTO) {
        throw new BadRequestException(
          'tipoGasto606 y requiereNCF solo se pueden asignar a cuentas de tipo gasto o costo — el 606 declara compras y gastos, no partidas de balance',
        );
      }
    }

    const anexosVistos = new Set<AnexoIR2>();
    for (const a of anexosEfectivos) {
      if (anexosVistos.has(a.anexoIR2)) {
        throw new BadRequestException(
          `El anexo ${a.anexoIR2} está repetido — una cuenta no puede aparecer dos veces en el mismo anexo`,
        );
      }
      anexosVistos.add(a.anexoIR2);
      if (tipoEfectivo) {
        const tiposValidos = TIPOS_POR_ANEXO_IR2[a.anexoIR2];
        if (!tiposValidos.includes(tipoEfectivo)) {
          throw new BadRequestException(
            `El anexo ${a.anexoIR2} no aplica a cuentas de tipo ${tipoEfectivo} (válido: ${tiposValidos.join(', ')})`,
          );
        }
      }
    }
  }

  async removeCuenta(id: number) {
    const c = await this.findCuentaById(id);
    // P3 Bloque 4: desactivarla la vuelve invisible para findOne/find (que
    // ya filtran isActive=true) — el motor de asientos automáticos
    // dejaría de encontrarla igual que si le hubieran cambiado el código.
    if (c.esCuentaSistema) {
      throw new BadRequestException(
        `"${c.nombre}" es una cuenta del sistema — no se puede desactivar (el motor de asientos automáticos depende de ella)`,
      );
    }
    const tieneLineas = await this.lineaRepository.count({ where: { cuentaContableId: id } });
    if (tieneLineas > 0) throw new BadRequestException('No se puede eliminar una cuenta con movimientos');
    await this.cuentaRepository.update(id, { isActive: false });
    await this.anexoRepository.update({ cuentaContableId: id }, { isActive: false });
    return { message: `Cuenta "${c.nombre}" eliminada` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Asientos — CRUD
  // ──────────────────────────────────────────────────────────────────

  private async generarNumero(empresaId?: number): Promise<string> {
    return generarNumeroSecuencial(
      this.dataSource,
      'asientos_contables',
      'numero',
      '^ASI-[0-9]+$',
      'ASI-',
      5,
      empresaId ?? 0,
    );
  }

  async createAsiento(dto: CreateAsientoDto, userId: number) {
    const totalDebe  = dto.lineas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = dto.lineas.reduce((s, l) => s + l.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new BadRequestException(
        `El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}`,
      );
    }

    for (const linea of dto.lineas) {
      const cuenta = await this.cuentaRepository.findOne({
        where: { id: linea.cuentaContableId, isActive: true },
      });
      if (!cuenta) throw new NotFoundException(`Cuenta #${linea.cuentaContableId} no encontrada`);
      if (!cuenta.permiteMovimientos) {
        throw new BadRequestException(`La cuenta "${cuenta.nombre}" no permite movimientos directos`);
      }
    }

    const numero  = await this.generarNumero(this.eid);
    const asiento = this.asientoRepository.create({
      numero,
      fecha:         new Date(dto.fecha),
      descripcion:   dto.descripcion,
      referenciaFolio: dto.referenciaFolio,
      totalDebe:     Number(totalDebe.toFixed(2)),
      totalHaber:    Number(totalHaber.toFixed(2)),
      estado:        EstadoAsiento.BORRADOR,
      userId,
    });

    const saved = await this.asientoRepository.save(asiento);

    const lineas = this.lineaRepository.create(
      dto.lineas.map((l) => ({ ...l, asientoId: saved.id })),
    );
    await this.lineaRepository.save(lineas);

    return this.findAsientoById(saved.id);
  }

  async getAsientos(filtro: FiltroContabilidadDto) {
    const { limit = 10, page = 1, fechaDesde, fechaHasta, tipoOrigen, estado } = filtro;

    const qb = this.asientoRepository
      .createQueryBuilder('a')
      .where('a.isActive = :active', { active: true });

    // P3 Bloque 5: string 'YYYY-MM-DD' crudo al QueryBuilder — new Date(string)
    // lo parsea como medianoche UTC, que en RD (UTC-4) cae en el día anterior
    // a partir de las 8pm; comparar contra la columna `a.fecha` (type: 'date')
    // corría el filtro un día para cualquier fechaDesde/fechaHasta cercano al
    // límite. Mismo fix que getLibroMayor() más abajo en este archivo.
    qb.andWhere('a.empresaId = :eid', { eid: this.eid });
    if (fechaDesde) qb.andWhere('a.fecha >= :desde', { desde: fechaDesde });
    if (fechaHasta) qb.andWhere('a.fecha <= :hasta', { hasta: fechaHasta });
    if (tipoOrigen) qb.andWhere('a.tipoOrigen = :tipo', { tipo: tipoOrigen });
    if (estado)     qb.andWhere('a.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('a.fecha', 'DESC')
      .addOrderBy('a.numero', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findAsientoById(id: number) {
    const a = await this.asientoRepository.findOne({
      where: { id, isActive: true },
      relations: ['lineas', 'lineas.cuentaContable', 'user'],
    });
    if (!a) throw new NotFoundException(`Asiento #${id} no encontrado`);
    return a;
  }

  async contabilizar(id: number) {
    const asiento = await this.findAsientoById(id);
    if (asiento.estado !== EstadoAsiento.BORRADOR) {
      throw new BadRequestException(`Solo se pueden contabilizar asientos en estado BORRADOR`);
    }
    await this.asientoRepository.update(id, { estado: EstadoAsiento.CONTABILIZADO });
    return this.findAsientoById(id);
  }

  async anularAsiento(id: number) {
    const asiento = await this.findAsientoById(id);
    if (asiento.estado === EstadoAsiento.ANULADO) {
      throw new BadRequestException('El asiento ya está anulado');
    }
    await this.asientoRepository.update(id, { estado: EstadoAsiento.ANULADO });
    return this.findAsientoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Libros y Estados Financieros
  // ──────────────────────────────────────────────────────────────────

  // getBalanceComprobacion()/getBalanceGeneral()/getEstadoResultados() —
  // eliminados (P3 Bloque 5). Ningún frontend los llamaba
  // (contabilidadApi.balanceComprobacion/balanceGeneral/estadoResultados
  // no tenían un solo caller en pages/ ni components/): un segundo motor
  // de cálculo vivo, duplicando lo que reportes-financieros.service.ts ya
  // hace y sí consumen BalanceComprobacionPage.tsx/ReportesFinancierosPage.tsx,
  // es una fuente futura de divergencia — dos implementaciones del mismo
  // balance que un día dejan de coincidir sin que nadie lo note.

  async getLibroDiario(filtro: FiltroContabilidadDto) {
    const asientos = await this.getAsientos({
      ...filtro,
      estado: EstadoAsiento.CONTABILIZADO,
    });
    return asientos;
  }

  async getLibroMayor(cuentaId: number, fechaDesde?: string, fechaHasta?: string) {
    const cuenta = await this.findCuentaById(cuentaId);

    const qb = this.lineaRepository
      .createQueryBuilder('l')
      .innerJoin('l.asiento', 'a', 'a.estado = :est AND a.isActive = true', {
        est: EstadoAsiento.CONTABILIZADO,
      })
      .select(['l.id', 'l.descripcion', 'l.debe', 'l.haber', 'a.fecha', 'a.numero', 'a.descripcion'])
      .addSelect('a.fecha', 'fecha')
      .addSelect('a.numero', 'asientoNumero')
      .where('l.cuentaContableId = :id AND l.isActive = true', { id: cuentaId });

    // P3 Bloque 5: string 'YYYY-MM-DD' crudo — ver el comentario en
    // getAsientos() más arriba sobre por qué new Date(string) corre el
    // filtro un día para el servidor en UTC.
    if (fechaDesde) qb.andWhere('a.fecha >= :desde', { desde: fechaDesde });
    if (fechaHasta) qb.andWhere('a.fecha <= :hasta', { hasta: fechaHasta });

    const lineas = await qb.orderBy('a.fecha', 'ASC').getMany();

    let saldoAcumulado = 0;
    const movimientos = lineas.map((l) => {
      const diff = cuenta.naturaleza === NaturalezaCuenta.DEUDORA
        ? Number(l.debe) - Number(l.haber)
        : Number(l.haber) - Number(l.debe);
      saldoAcumulado += diff;
      return {
        descripcion: l.descripcion,
        debe:        Number(l.debe),
        haber:       Number(l.haber),
        saldo:       Number(saldoAcumulado.toFixed(2)),
      };
    });

    return {
      cuenta: { codigo: cuenta.codigo, nombre: cuenta.nombre, tipo: cuenta.tipo },
      movimientos,
      saldoFinal: Number(saldoAcumulado.toFixed(2)),
    };
  }
}
