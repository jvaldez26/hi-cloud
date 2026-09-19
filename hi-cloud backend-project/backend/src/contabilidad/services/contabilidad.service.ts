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
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../../common/utils/generar-numero.util';
import {
  CuentaContable,
  TipoCuenta,
  NaturalezaCuenta,
  AnexoIR2,
  TIPOS_POR_ANEXO_IR2,
} from '../entities/cuenta-contable.entity';
import { sugerirTipoGasto606, sugerirRequiereNCF } from '../../declaraciones/dgii.constants';
import { COD } from './asientos-automaticos.service';
import {
  AsientoContable,
  EstadoAsiento,
} from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { CreateCuentaContableDto } from '../dto/create-cuenta-contable.dto';
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
  anexoIR2?: AnexoIR2;
  requiereNCF?: boolean;
  // P3 Bloque 4 — se calcula en marcarCuentaSistema(), no se escribe a mano aquí abajo.
  esCuentaSistema?: boolean;
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
  { codigo: '3.1.1.01',   nombre: 'Capital Suscrito y Pagado',         tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2',        nombre: 'Resultados',                        tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '3.2.1.01',   nombre: 'Utilidades Acumuladas',             tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2.1.02',   nombre: 'Resultado del Ejercicio',           tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 4 — INGRESOS ─────────────────────────────────────────────────────
  { codigo: '4',          nombre: 'INGRESOS',                          tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '4.1',        nombre: 'Ingresos Operacionales',            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '4.1.1',      nombre: 'Ventas',                            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '4.1.1.01',   nombre: 'Ventas de Bienes',                  tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.1.02',   nombre: 'Ventas de Servicios',               tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2',        nombre: 'Ingresos No Operacionales',         tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false },
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
  { codigo: '6.1.3',      nombre: 'Gastos Financieros',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.3.01',   nombre: 'Intereses Bancarios',               tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.02',   nombre: 'Comisiones Bancarias',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
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
//   - anexoIR2: activo/pasivo/patrimonio → 'A1' (Balance); ingreso → 'B1'
//     (Resultados); costo/gasto → 'B1' o 'D' pero SOLO si la cuenta ya
//     tiene un tipoGasto606 confiable (si no lo tiene, tampoco se afirma
//     su anexo — mismo criterio de "sin dictamen, sin etiqueta").
//   - EXCEPCIÓN deliberada — las 4 cuentas de Inventario (1.1.3.01 a
//     1.1.3.04): el Anexo A1 (Balance) necesita su saldo de cierre y el
//     Anexo D (Costo de Venta) necesita su Inventario Inicial/Final — la
//     MISMA cuenta alimenta ambos anexos, pero anexoIR2 es una sola
//     columna por cuenta. Forzar 'A1' perdería su lugar en D, y viceversa.
//     Se dejan SIN anexoIR2 en vez de elegir una de las dos en silencio —
//     ver el reporte de Fase 2 para la discusión completa.
//   - casillaIR2: no se puebla en ningún caso — no hay números de casilla
//     de DGII verificados todavía (ese es el propio gate ya acordado de la
//     Fase 3, no una omisión de esta fase).
const CUENTAS_INVENTARIO_DUAL_A1_D = new Set(['1.1.3.01', '1.1.3.02', '1.1.3.03', '1.1.3.04']);

function etiquetarFiscalmente(c: SeedCuenta): SeedCuenta {
  if (!c.permiteMovimientos) return c; // las de agrupación no se etiquetan

  const etiquetas: Partial<SeedCuenta> = {};

  if (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO) {
    const sugerido606 = sugerirTipoGasto606(c.nombre);
    if (sugerido606) etiquetas.tipoGasto606 = sugerido606;
    const sugeridoNCF = sugerirRequiereNCF(c.nombre);
    if (sugeridoNCF !== null) etiquetas.requiereNCF = sugeridoNCF;
  }

  if (c.tipo === TipoCuenta.ACTIVO || c.tipo === TipoCuenta.PASIVO || c.tipo === TipoCuenta.PATRIMONIO) {
    if (!CUENTAS_INVENTARIO_DUAL_A1_D.has(c.codigo)) etiquetas.anexoIR2 = AnexoIR2.A1;
  } else if (c.tipo === TipoCuenta.INGRESO) {
    etiquetas.anexoIR2 = AnexoIR2.B1;
  } else if (c.tipo === TipoCuenta.COSTO) {
    if (etiquetas.tipoGasto606) etiquetas.anexoIR2 = AnexoIR2.D;
  } else if (c.tipo === TipoCuenta.GASTO) {
    if (etiquetas.tipoGasto606) etiquetas.anexoIR2 = AnexoIR2.B1;
  }

  return { ...c, ...etiquetas };
}

// ── Cuentas del sistema (P3 Bloque 4) ───────────────────────────────────
// Códigos que el motor de asientos automáticos referencia por CÓDIGO, no
// por id (COD.* en asientos-automaticos.service.ts) — si un contador les
// cambia el código, ese tipo de asiento deja de encontrar la cuenta y
// muere en silencio para toda la empresa. 3 de los 20 valores de COD.*
// (GANANCIA_CAMBIARIA, PERDIDA_CAMBIARIA, ISR_RET_POR_PAGAR) no existen
// en este seed en absoluto — Set() los ignora sin más, no hay nada que
// marcar para un código que no está en PLAN_CUENTAS_BASE.
const CODIGOS_SISTEMA = new Set<string>(Object.values(COD));

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

        await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...c, empresaId, cuentaPadreId }),
        );
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

        await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...c, cuentaPadreId }),
        );
      }
    }

    this.logger.log(`Plan de Cuentas dominicano sembrado: ${PLAN_CUENTAS.length} cuentas`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Plan de Cuentas — CRUD
  // ──────────────────────────────────────────────────────────────────

  async getCuentas(soloMovimientos = false) {
    const where: Record<string, unknown> = { isActive: true };
    if (soloMovimientos) where['permiteMovimientos'] = true;
    if (this.eid) where['empresaId'] = this.eid;
    return this.cuentaRepository.find({ where, order: { codigo: 'ASC' } });
  }

  /**
   * Cuentas de movimiento a las que les falta al menos una etiqueta fiscal
   * que SÍ les aplica — la lista de trabajo del contador (Fase 2 del
   * catálogo fiscal dominicano). Mismo criterio "OR por campo aplicable"
   * que la columna "606 / IR-2" de PlanCuentasPage.tsx en el frontend:
   *   - gasto/costo sin tipoGasto606 → aparece (aunque ya tenga anexoIR2).
   *   - cualquier tipo sin anexoIR2 → aparece (aunque ya tenga tipoGasto606).
   * Una cuenta de activo/pasivo/patrimonio/ingreso nunca puede deberle
   * tipoGasto606 (no le aplica), así que para esas el único gate real es
   * anexoIR2 — que es justo la columna que hoy dejan vacía, a propósito,
   * el Anexo D de las 4 cuentas de Inventario y "ITBIS no Recuperable".
   */
  async getCuentasSinEtiquetar() {
    const where: any = { isActive: true, permiteMovimientos: true };
    if (this.eid) where.empresaId = this.eid;
    const cuentas = await this.cuentaRepository.find({ where, order: { codigo: 'ASC' } });
    return cuentas.filter((c) => {
      const leFaltaGasto606 = (c.tipo === TipoCuenta.GASTO || c.tipo === TipoCuenta.COSTO) && !c.tipoGasto606;
      const leFaltaAnexo = !c.anexoIR2;
      return leFaltaGasto606 || leFaltaAnexo;
    });
  }

  async findCuentaById(id: number) {
    const where: any = { id, isActive: true };
    if (this.eid) where.empresaId = this.eid;
    const c = await this.cuentaRepository.findOne({ where });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return c;
  }

  async createCuenta(dto: CreateCuentaContableDto) {
    const where: any = { codigo: dto.codigo };
    if (this.eid) where.empresaId = this.eid;
    const existe = await this.cuentaRepository.findOne({ where });
    if (existe) throw new ConflictException(`Código ${dto.codigo} ya existe`);
    await this.validarPadreYEtiquetas(dto);
    const eid = this.eid;
    return this.cuentaRepository.save(this.cuentaRepository.create({ ...dto, ...(eid ? { empresaId: eid } : {}) }));
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
    await this.cuentaRepository.update(id, dto);
    return this.findCuentaById(id);
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
   *      - anexoIR2/casillaIR2: cualquier tipo, pero coherente con
   *        TIPOS_POR_ANEXO_IR2 — A1 (Balance) exige activo/pasivo/
   *        patrimonio, B1 (Resultados) exige ingreso/costo/gasto, D (Costo
   *        de Venta) exige activo o costo. No se valida que la cuenta
   *        "activo" sea específicamente Inventario y no, por ejemplo, Caja
   *        — adivinar semántica de cuenta queda fuera de esta fase, igual
   *        que hoy no se valida qué código 606 exacto corresponde a cada
   *        gasto.
   *
   * Las etiquetas se validan sobre el estado EFECTIVO resultante (dto
   * fusionado sobre cuentaActual), no solo sobre los campos que el dto
   * toca: en un updateCuenta que solo cambia "tipo", una etiqueta que ya
   * estaba guardada y queda incoherente con el tipo nuevo también se
   * rechaza, aunque ese dto ni mencione la etiqueta.
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
    const anexoEfectivo        = dto.anexoIR2     !== undefined ? dto.anexoIR2     : cuentaActual?.anexoIR2;
    const casillaEfectiva      = dto.casillaIR2   !== undefined ? dto.casillaIR2   : cuentaActual?.casillaIR2;

    const tieneGasto606OContribuyente =
      (tipoGasto606Efectivo !== undefined && tipoGasto606Efectivo !== null) ||
      (requiereNCFEfectivo  !== undefined && requiereNCFEfectivo  !== null);
    const tieneAnexo =
      (anexoEfectivo   !== undefined && anexoEfectivo   !== null) ||
      (casillaEfectiva !== undefined && casillaEfectiva !== null);

    if (tieneGasto606OContribuyente || tieneAnexo) {
      if (!permiteMovimientosEfectivo) {
        throw new BadRequestException(
          'Las etiquetas fiscales solo se pueden asignar a cuentas de movimiento, no de agrupación',
        );
      }
    }

    if (tieneGasto606OContribuyente) {
      if (tipoEfectivo !== TipoCuenta.GASTO && tipoEfectivo !== TipoCuenta.COSTO) {
        throw new BadRequestException(
          'tipoGasto606 y requiereNCF solo se pueden asignar a cuentas de tipo gasto o costo — el 606 declara compras y gastos, no partidas de balance',
        );
      }
    }

    if (tieneAnexo) {
      if ((casillaEfectiva !== undefined && casillaEfectiva !== null) && !anexoEfectivo) {
        throw new BadRequestException('casillaIR2 requiere anexoIR2');
      }
      if (anexoEfectivo && tipoEfectivo) {
        const tiposValidos = TIPOS_POR_ANEXO_IR2[anexoEfectivo];
        if (!tiposValidos.includes(tipoEfectivo)) {
          throw new BadRequestException(
            `El anexo ${anexoEfectivo} no aplica a cuentas de tipo ${tipoEfectivo} (válido: ${tiposValidos.join(', ')})`,
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
