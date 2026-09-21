import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaContable } from '../contabilidad/entities/cuenta-contable.entity';
import { TenantService } from '../tenant/tenant.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { SaldosCuentasService } from './saldos-cuentas.service';
import {
  CuentaCatalogo, NodoBalanceGeneral,
  calcularSaldosAgregados, calcularTotalRaices, construirNodos,
} from './balance-general-arbol.util';

export type NivelDetalle = 1 | 2 | 3 | 'todos';
export type CompararCon  = 'ninguno' | 'mismo-mes-anio-anterior' | 'cierre-anio-anterior' | 'fecha-manual';

export interface FiltrosBalanceGeneralDetallado {
  fechaCorte:            string;
  compararCon?:          CompararCon;
  fechaComparacion?:     string;  // requerida solo si compararCon === 'fecha-manual'
  nivelDetalle?:         NivelDetalle;
  ocultarCuentasEnCero?: boolean;
}

interface FiltrosNormalizados {
  fechaCorte:            string;
  compararCon:           CompararCon;
  fechaComparacion?:     string;
  nivelDetalle:          NivelDetalle;
  ocultarCuentasEnCero:  boolean;
}

interface SeccionBalance {
  nodos:          NodoBalanceGeneral[];
  total:          number;
  comparado?:     number;
  diferencia?:    number;
  diferenciaPct?: number | null;
}

export interface BalanceGeneralDetallado {
  fechaCorte: string;
  filtros: {
    compararCon:           CompararCon;
    fechaComparacion?:     string;
    nivelDetalle:          NivelDetalle;
    ocultarCuentasEnCero:  boolean;
  };
  activo:     SeccionBalance;
  pasivo:     SeccionBalance;
  patrimonio: SeccionBalance & {
    calculadas: {
      resultadoDelEjercicio: { desde: string; hasta: string; monto: number; comparado?: number };
      resultadosAcumulados:  { hasta: string; monto: number; comparado?: number };
    };
  };
  diferenciaAsientosDescuadrados: { total: number; cantidad: number };
  totales: {
    activos:           number;
    pasivosPatrimonio: number;
    ecuacion:          number;
    cuadrado:          boolean;
  };
}

const NIVELES_VALIDOS: NivelDetalle[] = [1, 2, 3, 'todos'];
const COMPARAR_CON_VALIDOS: CompararCon[] = ['ninguno', 'mismo-mes-anio-anterior', 'cierre-anio-anterior', 'fecha-manual'];

@Injectable()
export class BalanceGeneralDetalladoService {
  constructor(
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    private readonly tenantSvc: TenantService,
    private readonly saldosCuentasService: SaldosCuentasService,
  ) {}

  /** FALLA CERRADO — igual convención que ReportesFinancierosService. */
  private get eid(): number {
    const id = this.tenantSvc.getEmpresaIdOrNull();
    if (!id) throw new TenantContextMissingException('CuentaContable', 'BalanceGeneralDetalladoService');
    return id;
  }

  // ─── Filtros ────────────────────────────────────────────────────────────────

  normalizarFiltros(filtros: FiltrosBalanceGeneralDetallado): FiltrosNormalizados {
    if (!filtros.fechaCorte) throw new BadRequestException('fechaCorte es requerida');

    const compararCon = filtros.compararCon ?? 'ninguno';
    if (!COMPARAR_CON_VALIDOS.includes(compararCon)) {
      throw new BadRequestException(`compararCon inválido: ${compararCon}`);
    }
    if (compararCon === 'fecha-manual' && !filtros.fechaComparacion) {
      throw new BadRequestException('fechaComparacion es requerida cuando compararCon=fecha-manual');
    }

    const nivelDetalleRaw = filtros.nivelDetalle ?? 2;
    // Query params llegan como string ('1'|'2'|'3'|'todos') — normalizar antes de validar.
    const nivelDetalle: NivelDetalle = nivelDetalleRaw === 'todos'
      ? 'todos'
      : (Number(nivelDetalleRaw) as NivelDetalle);
    if (!NIVELES_VALIDOS.includes(nivelDetalle)) {
      throw new BadRequestException(`nivelDetalle inválido: ${nivelDetalleRaw}`);
    }

    return {
      fechaCorte: filtros.fechaCorte,
      compararCon,
      fechaComparacion: filtros.fechaComparacion,
      nivelDetalle,
      ocultarCuentasEnCero: filtros.ocultarCuentasEnCero ?? true,
    };
  }

  /** Resuelve la fecha de comparación real a partir de compararCon. */
  resolverFechaComparacion(fechaCorte: string, compararCon: CompararCon, fechaManual?: string): string {
    const [y, m, d] = fechaCorte.split('-').map(Number);
    switch (compararCon) {
      case 'cierre-anio-anterior':
        return `${y - 1}-12-31`;
      case 'mismo-mes-anio-anterior': {
        const anioAnt = y - 1;
        const ultimoDiaMes = new Date(anioAnt, m, 0).getDate(); // día 0 del mes siguiente = último día de m
        const dia = Math.min(d, ultimoDiaMes);
        return `${anioAnt}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      }
      case 'fecha-manual':
        return fechaManual!;
      default:
        throw new BadRequestException(`compararCon inválido: ${compararCon}`);
    }
  }

  // ─── Resultado neto (para las líneas calculadas de Patrimonio) ──────────────
  // Misma fórmula que ReportesFinancierosService.resultadoNeto() — se
  // duplica aquí (8 líneas) para no acoplar los dos servicios.

  private async resultadoNeto(eid: number, desde: string | undefined, hasta: string): Promise<number> {
    const cuentas = await this.saldosCuentasService.obtenerSaldos(eid, desde, hasta);
    const neto = ['ingreso', 'costo', 'gasto'].reduce((acc, tipo) => {
      const subtotal = cuentas.filter(c => c.tipo === tipo).reduce((s, c) => s + c.saldo, 0);
      return tipo === 'ingreso' ? acc + subtotal : acc - subtotal;
    }, 0);
    return +neto.toFixed(2);
  }

  // ─── Generación principal ────────────────────────────────────────────────────

  async generar(filtrosCrudos: FiltrosBalanceGeneralDetallado): Promise<BalanceGeneralDetallado> {
    const eid = this.eid;
    const filtros = this.normalizarFiltros(filtrosCrudos);
    const { fechaCorte, compararCon, nivelDetalle, ocultarCuentasEnCero } = filtros;
    const nivelDetalleNum = nivelDetalle === 'todos' ? null : nivelDetalle;

    const fechaComparacion = compararCon !== 'ninguno'
      ? this.resolverFechaComparacion(fechaCorte, compararCon, filtros.fechaComparacion)
      : undefined;

    // empresaId explícito aunque TenantAwareRepository ya debería scopear esto
    // por CLS — igual que el resto del motor de reportes, no confiamos en una
    // sola capa: un caller fuera de un request HTTP (cron, script) sin CLS
    // activo no debe poder filtrar por accidente el catálogo de otra empresa.
    const catalogoEntidades = await this.cuentaRepo.find({
      where: { isActive: true, empresaId: eid } as any,
      order: { codigo: 'ASC' },
    });
    const catalogo: CuentaCatalogo[] = catalogoEntidades.map(c => ({
      id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza,
      nivel: c.nivel, permiteMovimientos: c.permiteMovimientos, cuentaPadreId: c.cuentaPadreId ?? null,
    }));

    const [saldosPrincipal, saldosComparado, asientosDescuadrados] = await Promise.all([
      this.saldosCuentasService.obtenerSaldos(eid, undefined, fechaCorte),
      fechaComparacion ? this.saldosCuentasService.obtenerSaldos(eid, undefined, fechaComparacion) : Promise.resolve(null),
      this.saldosCuentasService.obtenerAsientosDescuadrados(eid, fechaCorte),
    ]);

    const agregados = calcularSaldosAgregados(
      catalogo, new Map(saldosPrincipal.map(s => [s.codigo, s.saldo])),
    );
    const agregadosComparado = saldosComparado
      ? calcularSaldosAgregados(catalogo, new Map(saldosComparado.map(s => [s.codigo, s.saldo])))
      : null;

    const construirSeccion = (tipo: string): SeccionBalance => {
      const total = calcularTotalRaices(catalogo, tipo, agregados);
      const nodos = construirNodos(catalogo, tipo, agregados, agregadosComparado, nivelDetalleNum, ocultarCuentasEnCero, total);
      const seccion: SeccionBalance = { nodos, total };
      if (agregadosComparado) {
        const totalComparado = calcularTotalRaices(catalogo, tipo, agregadosComparado);
        seccion.comparado     = totalComparado;
        seccion.diferencia    = +(total - totalComparado).toFixed(2);
        seccion.diferenciaPct = totalComparado !== 0
          ? +(((total - totalComparado) / Math.abs(totalComparado)) * 100).toFixed(1)
          : (total === 0 ? 0 : null);
      }
      return seccion;
    };

    const activo    = construirSeccion('activo');
    const pasivo    = construirSeccion('pasivo');
    const patrimonioCuentas = construirSeccion('patrimonio');

    // Líneas calculadas — misma lógica que ReportesFinancierosService.balanceGeneral():
    // el motor no tiene asiento de cierre de ejercicio, así que ingresos/costos/gastos
    // nunca se reflejan en Patrimonio salvo aquí, en cada consulta (nunca persistido).
    const anio                 = Number(fechaCorte.slice(0, 4));
    const inicioEjercicio      = `${anio}-01-01`;
    const finEjercicioAnterior = `${anio - 1}-12-31`;

    const [resultadoDelEjercicio, resultadosAcumulados] = await Promise.all([
      this.resultadoNeto(eid, inicioEjercicio, fechaCorte),
      this.resultadoNeto(eid, undefined, finEjercicioAnterior),
    ]);

    const calculadas: BalanceGeneralDetallado['patrimonio']['calculadas'] = {
      resultadoDelEjercicio: { desde: inicioEjercicio, hasta: fechaCorte, monto: resultadoDelEjercicio },
      resultadosAcumulados:  { hasta: finEjercicioAnterior, monto: resultadosAcumulados },
    };

    let totalPatrimonio = +(patrimonioCuentas.total + resultadoDelEjercicio + resultadosAcumulados).toFixed(2);
    const patrimonio: BalanceGeneralDetallado['patrimonio'] = { ...patrimonioCuentas, total: totalPatrimonio, calculadas };

    if (fechaComparacion) {
      const anioComp                 = Number(fechaComparacion.slice(0, 4));
      const inicioEjercicioComp      = `${anioComp}-01-01`;
      const finEjercicioAnteriorComp = `${anioComp - 1}-12-31`;
      const [resultadoComp, acumuladoComp] = await Promise.all([
        this.resultadoNeto(eid, inicioEjercicioComp, fechaComparacion),
        this.resultadoNeto(eid, undefined, finEjercicioAnteriorComp),
      ]);
      calculadas.resultadoDelEjercicio.comparado = resultadoComp;
      calculadas.resultadosAcumulados.comparado  = acumuladoComp;

      const totalPatrimonioComparado = +((patrimonioCuentas.comparado ?? 0) + resultadoComp + acumuladoComp).toFixed(2);
      patrimonio.comparado     = totalPatrimonioComparado;
      patrimonio.diferencia    = +(totalPatrimonio - totalPatrimonioComparado).toFixed(2);
      patrimonio.diferenciaPct = totalPatrimonioComparado !== 0
        ? +(((totalPatrimonio - totalPatrimonioComparado) / Math.abs(totalPatrimonioComparado)) * 100).toFixed(1)
        : (totalPatrimonio === 0 ? 0 : null);
    }

    const diferenciaDescuadrados = +asientosDescuadrados.reduce((s, a) => s + a.diferencia, 0).toFixed(2);
    // La ecuación se evalúa sobre los libros tal como están — un descuadre de
    // asientos históricos se reporta aparte, nunca se absorbe en silencio.
    const ecuacion = +(activo.total - (pasivo.total + totalPatrimonio)).toFixed(2);

    return {
      fechaCorte,
      filtros: { compararCon, fechaComparacion, nivelDetalle, ocultarCuentasEnCero },
      activo, pasivo, patrimonio,
      diferenciaAsientosDescuadrados: { total: diferenciaDescuadrados, cantidad: asientosDescuadrados.length },
      totales: {
        activos:           activo.total,
        pasivosPatrimonio: +(pasivo.total + totalPatrimonio).toFixed(2),
        ecuacion,
        cuadrado:          Math.abs(ecuacion) < 0.01,
      },
    };
  }
}
