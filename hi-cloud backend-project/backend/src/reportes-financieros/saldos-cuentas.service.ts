import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface LineaSaldoCuenta {
  codigo:     string;
  nombre:     string;
  tipo:       string;
  naturaleza: string;
  nivel:      number;
  totalDebe:  number;
  totalHaber: number;
  saldo:      number; // firmado por naturaleza: deudora → debe-haber; acreedora → haber-debe
}

export interface AsientoDescuadrado {
  id:              number;
  fecha:           string;
  tipoOrigen:      string;
  referenciaFolio: string;
  totalDebe:       number;
  totalHaber:      number;
  diferencia:      number; // totalDebe - totalHaber
}

/**
 * Contabilidad — Balance/Diagnóstico (2026-09-20). Única fuente de verdad
 * para "cuánto tiene cada cuenta contable": Balance de Comprobación y
 * Balance General/Estado de Resultados calculaban esto cada uno con su
 * propia consulta SQL escrita a mano — una con debe/haber crudos
 * (balance-comprobacion.service.ts), otra con saldo firmado por naturaleza
 * (reportes-financieros.service.ts) — y podían divergir para una cuenta
 * cuyos movimientos van contra su naturaleza declarada. ambos motores
 * llaman ahora a este único método; cada uno deriva de aquí lo que
 * necesita (Balance de Comprobación sigue comparando totalDebe/totalHaber
 * crudos para sus columnas Deudor/Acreedor — eso NO cambia, es la
 * convención correcta de un balance de comprobación — pero ya no ejecuta
 * su propia query para obtenerlos).
 *
 * El HAVING (cualquier movimiento, aunque el saldo neto sea 0) preserva el
 * comportamiento histórico de Balance de Comprobación; no cambia nada para
 * Balance General/Estado de Resultados, que ya filtraba saldo=0 aparte.
 */
@Injectable()
export class SaldosCuentasService {
  constructor(private readonly dataSource: DataSource) {}

  async obtenerSaldos(empresaId: number, desde?: string, hasta?: string): Promise<LineaSaldoCuenta[]> {
    // $1 = empresaId; las fechas van parametrizadas, nunca interpoladas.
    const params: unknown[] = [empresaId];
    let condFecha = '';
    if (desde && hasta) {
      params.push(desde, hasta);
      condFecha = `AND ac.fecha BETWEEN $${params.length - 1} AND $${params.length}`;
    } else if (hasta) {
      params.push(hasta);
      condFecha = `AND ac.fecha <= $${params.length}`;
    }

    // Balance/Diagnóstico — PASO 0 (2026-09-20): los filtros de asientos_contables
    // (estado, isActive, empresaId, fecha) NO pueden ir en el ON de un LEFT JOIN
    // contra asiento_lineas. Si al."asientoId" coincide con un asiento que existe
    // pero NO cumple esos filtros (anulado, otra empresa, fuera de rango de
    // fecha), Postgres NO descarta la fila — el LEFT JOIN solo pone las columnas
    // de ese asiento en NULL, y la línea (con su debe/haber intactos) sigue
    // sumándose igual. Este bug ya existía en las dos consultas originales
    // (balance-comprobacion.service.ts y reportes-financieros.service.ts) antes
    // de unificarse en este archivo — se detectó porque la suma total de una
    // empresa (8,920,031.51 debe / 8,920,031.43 haber) no podía cuadrar si cada
    // asiento individual, verificado uno por uno, sí cuadraba: la única forma de
    // que una suma de partes balanceadas dé un total desbalanceado es que la
    // suma esté incluyendo partes que no debían contarse.
    //
    // Fix: los filtros de ac se aplican en un INNER JOIN dentro de una
    // subconsulta — eso SÍ actúa como filtro real, no como condición de match
    // opcional — y esa subconsulta (ya filtrada) es la que se LEFT JOINea contra
    // cc, para seguir mostrando cuentas sin ningún movimiento válido con saldo 0.
    const rows = await this.dataSource.query<{
      codigo: string; nombre: string; tipo: string; naturaleza: string;
      nivel: string; total_debe: string; total_haber: string;
    }[]>(`
      SELECT
        cc.codigo,
        cc.nombre,
        cc.tipo,
        cc.naturaleza,
        cc."nivel",
        COALESCE(SUM(m.debe),  0)::text AS total_debe,
        COALESCE(SUM(m.haber), 0)::text AS total_haber
      FROM cuentas_contables cc
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado'
          AND ac."isActive" = true
          AND ac."empresaId" = $1
          ${condFecha}
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true
        AND cc."empresaId" = $1
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, cc."nivel"
      HAVING COALESCE(SUM(m.debe), 0) != 0 OR COALESCE(SUM(m.haber), 0) != 0
      ORDER BY cc.codigo
    `, params);

    return rows.map(r => {
      const debe  = +r.total_debe;
      const haber = +r.total_haber;
      const saldo = r.naturaleza === 'deudora' ? debe - haber : haber - debe;
      return {
        codigo:     r.codigo,
        nombre:     r.nombre,
        tipo:       r.tipo,
        naturaleza: r.naturaleza,
        nivel:      Number(r.nivel),
        totalDebe:  +debe.toFixed(2),
        totalHaber: +haber.toFixed(2),
        saldo:      +saldo.toFixed(2),
      };
    });
  }

  /**
   * Asientos cuyo totalDebe/totalHaber (columnas ya guardadas en
   * asientos_contables, no recalculadas) no cuadran — el motor automático
   * los rechaza desde P3 Bloque 1 (ver asientos-automaticos.service.ts),
   * pero asientos históricos anteriores a esa validación pueden seguir
   * existiendo. Alimenta la línea "Diferencia por asientos descuadrados"
   * de Balance General y su listado.
   */
  async obtenerAsientosDescuadrados(empresaId: number, hasta?: string): Promise<AsientoDescuadrado[]> {
    const params: unknown[] = [empresaId];
    let condFecha = '';
    if (hasta) {
      params.push(hasta);
      condFecha = `AND fecha <= $${params.length}`;
    }

    const rows = await this.dataSource.query<{
      id: number; fecha: string; tipoOrigen: string; referenciaFolio: string;
      totalDebe: string; totalHaber: string;
    }[]>(`
      SELECT id, fecha::text, "tipoOrigen", "referenciaFolio", "totalDebe"::text, "totalHaber"::text
      FROM asientos_contables
      WHERE "empresaId" = $1
        AND "isActive" = true
        AND estado = 'contabilizado'
        ${condFecha}
        AND ABS("totalDebe" - "totalHaber") > 0.01
      ORDER BY fecha DESC, id DESC
    `, params);

    return rows.map(r => {
      const totalDebe  = +r.totalDebe;
      const totalHaber = +r.totalHaber;
      return {
        id: r.id, fecha: r.fecha, tipoOrigen: r.tipoOrigen, referenciaFolio: r.referenciaFolio,
        totalDebe:  +totalDebe.toFixed(2),
        totalHaber: +totalHaber.toFixed(2),
        diferencia: +(totalDebe - totalHaber).toFixed(2),
      };
    });
  }
}
