import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionCuentaContable } from '../entities/configuracion-cuenta-contable.entity';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { TenantService } from '../../tenant/tenant.service';
import { COD } from '../constants/cod-cuentas.constants';

/**
 * Catálogo de conceptos configurables (2026-09-19) — cada entrada es una
 * cuenta que el motor de asientos usaba hardcodeada. `default` es EXACTAMENTE
 * el valor que el motor ya usa hoy (COD.* o el literal fijo) — así una
 * empresa sin configuración se comporta igual que antes de esta pantalla
 * existir. `grupo` es solo para organizar la UI (Ventas, Cobros, Compras...).
 *
 * Los 4 conceptos COBRO_* son nuevos: no existían como cuentas propias antes
 * de esta tarea — el motor decidía Caja vs Bancos con un ternario binario
 * (efectivo → Caja, cualquier otra cosa → Bancos, el "peor caso conocido"
 * señalado por el usuario). El default de los 4 es COD.BANCOS, así que hasta
 * que alguien configure algo distinto, el comportamiento no cambia.
 */
export interface ConceptoContable {
  concepto: string;
  label: string;
  grupo: string;
  default: string;
}

export const CONCEPTOS_CONTABLES: ConceptoContable[] = [
  // ── Ventas ──
  { concepto: 'CLIENTES',                label: 'Clientes (CxC)',                          grupo: 'Ventas', default: COD.CLIENTES },
  { concepto: 'VENTAS',                  label: 'Ventas',                                   grupo: 'Ventas', default: COD.VENTAS },
  { concepto: 'ITBIS_POR_PAGAR',         label: 'ITBIS por Pagar (débito fiscal)',          grupo: 'Ventas', default: COD.ITBIS_POR_PAGAR },
  { concepto: 'COSTO_VENTAS',            label: 'Costo de Ventas',                          grupo: 'Ventas', default: COD.COSTO_VENTAS },
  { concepto: 'INVENTARIO',              label: 'Inventario',                               grupo: 'Ventas', default: COD.INVENTARIO },
  { concepto: 'RETENCION_ITBIS_VENTA',   label: 'ITBIS retenido a recuperar (cliente retiene)', grupo: 'Ventas', default: '1.1.4.02' },
  { concepto: 'RETENCION_ISR_VENTA',     label: 'ISR retenido a recuperar (cliente retiene)',   grupo: 'Ventas', default: '1.1.4.03' },
  // ── Cobros ──
  { concepto: 'CAJA',                    label: 'Caja (cobro en efectivo)',                 grupo: 'Cobros', default: COD.CAJA },
  { concepto: 'BANCOS',                  label: 'Bancos (contrapartida por defecto)',       grupo: 'Cobros', default: COD.BANCOS },
  { concepto: 'COBRO_TARJETA',           label: 'Cobro con tarjeta de crédito/débito',      grupo: 'Cobros', default: COD.BANCOS },
  { concepto: 'COBRO_TRANSFERENCIA',     label: 'Cobro por transferencia bancaria',         grupo: 'Cobros', default: COD.BANCOS },
  { concepto: 'COBRO_CHEQUE',            label: 'Cobro con cheque',                         grupo: 'Cobros', default: COD.BANCOS },
  { concepto: 'COBRO_OTRO',              label: 'Cobro por otro método',                    grupo: 'Cobros', default: COD.BANCOS },
  { concepto: 'ANTICIPOS_CLIENTES',      label: 'Anticipos de Clientes',                    grupo: 'Cobros', default: COD.ANTICIPOS_CLIENTES },
  { concepto: 'GANANCIA_CAMBIARIA',      label: 'Ganancia cambiaria',                       grupo: 'Cobros', default: COD.GANANCIA_CAMBIARIA },
  { concepto: 'PERDIDA_CAMBIARIA',       label: 'Pérdida cambiaria',                        grupo: 'Cobros', default: COD.PERDIDA_CAMBIARIA },
  // ── Compras ──
  { concepto: 'ITBIS_CREDITO',           label: 'ITBIS Crédito Fiscal (compras)',           grupo: 'Compras', default: COD.ITBIS_CREDITO },
  { concepto: 'PROVEEDORES',             label: 'Proveedores (CxP)',                        grupo: 'Compras', default: COD.PROVEEDORES },
  { concepto: 'ITBIS_RET_POR_PAGAR',     label: 'ITBIS retenido por enterar a DGII (E41)',  grupo: 'Compras', default: COD.ITBIS_RET_POR_PAGAR },
  { concepto: 'ISR_RET_POR_PAGAR',       label: 'ISR retenido por enterar a DGII (E41)',    grupo: 'Compras', default: COD.ISR_RET_POR_PAGAR },
  { concepto: 'GASTOS_IMPORT_X_APLICAR', label: 'Gastos de importación por aplicar',        grupo: 'Compras', default: COD.GASTOS_IMPORT_X_APLICAR },
  { concepto: 'GASTO_DEFAULT',           label: 'Gasto (categoría sin cuenta propia)',      grupo: 'Compras', default: '6.1.2.04' },
  { concepto: 'MANTENIMIENTO_GASTO',     label: 'Gasto de mantenimiento',                   grupo: 'Compras', default: '6.1.2.04' },
  // ── Nómina ──
  { concepto: 'SUELDOS',                 label: 'Gasto de Sueldos',                         grupo: 'Nómina', default: COD.SUELDOS },
  { concepto: 'TSS_PATRONAL',            label: 'Gasto TSS Patronal',                       grupo: 'Nómina', default: COD.TSS_PATRONAL },
  { concepto: 'SUELDOS_X_PAGAR',         label: 'Sueldos por Pagar (neto)',                 grupo: 'Nómina', default: COD.SUELDOS_X_PAGAR },
  { concepto: 'TSS_X_PAGAR',             label: 'TSS por Pagar',                            grupo: 'Nómina', default: COD.TSS_X_PAGAR },
  { concepto: 'ISR_X_PAGAR',             label: 'ISR por Pagar (retenido de nómina)',       grupo: 'Nómina', default: COD.ISR_X_PAGAR },
  // ── Bancos (Tesorería) ──
  // Depósito/retiro MANUAL en Tesorería (sin CxC/CxP de por medio, p. ej. un
  // aporte de capital o un gasto bancario) — antes no generaba NINGÚN
  // asiento: el movimiento quedaba en movimientos_bancarios sin llegar
  // nunca al mayor contable. La contrapartida es un selector por documento
  // (no hay una cuenta "correcta" universal para "de dónde vino este
  // depósito" o "a qué se fue este retiro"); estos 2 defaults son solo el
  // valor pre-seleccionado, siempre editable.
  { concepto: 'DEPOSITO_OTRO_INGRESO',   label: 'Depósito bancario (origen no especificado)', grupo: 'Bancos', default: '4.2.1.02' },
  { concepto: 'RETIRO_OTRO_GASTO',       label: 'Retiro bancario (destino no especificado)',  grupo: 'Bancos', default: '6.1.2.09' },
  // Una transferencia entre 2 cuentas bancarias PROPIAS no genera asiento —
  // ambos lados son la misma cuenta contable "Bancos" (el detalle de cuál
  // banco físico se movió lo sigue Tesorería en movimientos_bancarios, no
  // el mayor contable). Sin efecto en el balance, sin efecto en este catálogo.
  // ── Activos Fijos ──
  // Alta de un activo: Debe = cuenta del activo (por categoría, CategoriaActivo.
  // cuentaActivoCodigo — este default solo aplica si la categoría no tiene una
  // propia), Haber = contrapartida elegida por el selector del formulario
  // (Bancos por default — la misma compra puede ser de contado o a crédito).
  { concepto: 'ACTIVO_FIJO_DEFAULT',     label: 'Activo Fijo (categoría sin cuenta propia)', grupo: 'Activos Fijos', default: '1.2.1.01' },
  // ── Préstamos ──
  { concepto: 'PRESTAMO_CARTERA',        label: 'Cartera de Crédito',                       grupo: 'Préstamos', default: '1.1.2.10' },
  { concepto: 'PRESTAMO_INTERESES',      label: 'Ingreso por Intereses',                    grupo: 'Préstamos', default: '4.1.2.01' },
  { concepto: 'PRESTAMO_MORA',           label: 'Ingreso por Mora',                         grupo: 'Préstamos', default: '4.1.2.02' },
];

const CONCEPTOS_POR_CLAVE = new Map(CONCEPTOS_CONTABLES.map(c => [c.concepto, c]));

interface EntradaCache { mapa: Record<string, string>; expira: number; }

@Injectable()
export class ConfiguracionContableService {
  private readonly logger = new Logger(ConfiguracionContableService.name);
  // Cache en memoria por empresa — una consulta por asiento sería inaceptable
  // (ver instrucción original). TTL corto + invalidación explícita en cada
  // escritura: nunca hace falta esperar el TTL para ver un cambio propio.
  private readonly cache = new Map<number, EntradaCache>();
  private readonly TTL_MS = 60_000;

  constructor(
    @InjectRepository(ConfiguracionCuentaContable)
    private configRepository: Repository<ConfiguracionCuentaContable>,
    @InjectRepository(CuentaContable)
    private cuentaRepository: Repository<CuentaContable>,
    private tenantService: TenantService,
  ) {}

  /** Devuelve { concepto: cuentaCodigo } con TODOS los conceptos del catálogo — configurado o default. Cacheado por empresa. */
  async obtenerMapa(empresaId: number): Promise<Record<string, string>> {
    const cacheado = this.cache.get(empresaId);
    if (cacheado && cacheado.expira > Date.now()) return cacheado.mapa;

    const filas = await this.configRepository.find({ where: { empresaId, isActive: true } });
    const porConcepto = new Map(filas.map(f => [f.concepto, f.cuentaCodigo]));

    const mapa: Record<string, string> = {};
    for (const c of CONCEPTOS_CONTABLES) {
      mapa[c.concepto] = porConcepto.get(c.concepto) ?? c.default;
    }
    this.cache.set(empresaId, { mapa, expira: Date.now() + this.TTL_MS });
    return mapa;
  }

  /** Un solo concepto, con el mismo cache que obtenerMapa (nunca una query aparte). */
  async resolverCuenta(empresaId: number, concepto: string): Promise<string> {
    const mapa = await this.obtenerMapa(empresaId);
    return mapa[concepto] ?? CONCEPTOS_POR_CLAVE.get(concepto)?.default ?? concepto;
  }

  private invalidar(empresaId: number): void {
    this.cache.delete(empresaId);
  }

  /**
   * Lista el catálogo completo con el valor vigente (configurado o default),
   * y valida cada cuenta contra el catálogo real — "si una cuenta configurada
   * se desactiva o no existe, la pantalla debe avisarlo antes" (el motor ya
   * reporta a Sentry en tiempo de asiento desde P3, pero acá se adelanta).
   */
  async listar() {
    const eid = this.tenantService.getEmpresaId();
    const configuradas = await this.configRepository.find({ where: { empresaId: eid, isActive: true } });
    const porConcepto = new Map(configuradas.map(f => [f.concepto, f]));

    const codigos = CONCEPTOS_CONTABLES.map(c => porConcepto.get(c.concepto)?.cuentaCodigo ?? c.default);
    const cuentas = await this.cuentaRepository.find({
      where: codigos.map(codigo => ({ codigo, empresaId: eid, isActive: true } as any)),
    });
    const cuentasPorCodigo = new Map(cuentas.map(c => [c.codigo, c]));

    return CONCEPTOS_CONTABLES.map(c => {
      const fila = porConcepto.get(c.concepto);
      const valorActual = fila?.cuentaCodigo ?? c.default;
      const cuenta = cuentasPorCodigo.get(valorActual);
      return {
        concepto:    c.concepto,
        label:       c.label,
        grupo:       c.grupo,
        default:     c.default,
        valorActual,
        esDefault:   !fila,
        cuenta:      cuenta ? { id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre } : null,
        // La cuenta configurada/default ya no existe, está inactiva, o no
        // permite movimientos — el próximo asiento que la necesite fallará
        // (el motor lo reporta a Sentry), avisarlo acá antes de que pase.
        advertencia: !cuenta
          ? `La cuenta ${valorActual} no existe o está inactiva para esta empresa`
          : !cuenta.permiteMovimientos
            ? `La cuenta ${valorActual} (${cuenta.nombre}) es de agrupación — no permite movimientos`
            : undefined,
      };
    });
  }

  /** Sobreescribe un concepto para la empresa. Valida contra el catálogo real, igual que el selector por documento (P3: permiteMovimientos, misma empresa). */
  async actualizar(concepto: string, cuentaCodigo: string): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    if (!CONCEPTOS_POR_CLAVE.has(concepto)) {
      throw new BadRequestException(`Concepto contable desconocido: ${concepto}`);
    }
    const cuenta = await this.cuentaRepository.findOne({ where: { codigo: cuentaCodigo, empresaId, isActive: true } as any });
    if (!cuenta) {
      throw new BadRequestException(`La cuenta ${cuentaCodigo} no existe o está inactiva para esta empresa`);
    }
    if (!cuenta.permiteMovimientos) {
      throw new BadRequestException(`La cuenta ${cuentaCodigo} (${cuenta.nombre}) es de agrupación — no permite movimientos`);
    }

    const existente = await this.configRepository.findOne({ where: { empresaId, concepto, isActive: true } as any });
    if (existente) {
      await this.configRepository.update(existente.id, { cuentaCodigo });
    } else {
      await this.configRepository.save(this.configRepository.create({ empresaId, concepto, cuentaCodigo }));
    }
    this.invalidar(empresaId);
    this.logger.log(`Configuración contable: empresa #${empresaId} — ${concepto} → ${cuentaCodigo}`);
  }

  /** Vuelve un concepto a su default (borra la fila, si existe). */
  async restaurarDefault(concepto: string): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    const existente = await this.configRepository.findOne({ where: { empresaId, concepto, isActive: true } as any });
    if (existente) {
      await this.configRepository.update(existente.id, { isActive: false });
      this.invalidar(empresaId);
    }
  }
}
