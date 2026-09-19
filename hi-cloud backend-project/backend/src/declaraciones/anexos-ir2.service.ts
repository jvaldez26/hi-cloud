import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

/**
 * Líneas que el IR-2 espera en el Anexo A1 y que HiCloud no tiene forma de
 * calcular — ningún módulo del ERP las registra. Se devuelven en cero y
 * marcadas como llenado manual: mejor una línea vacía y honesta que un
 * cero que parezca un dato real. Constante de módulo, no propiedad de
 * clase — una propiedad de clase con inicializador solo se llena en el
 * constructor real, y este servicio se testea vía
 * `Object.create(AnexosIR2Service.prototype)` (mismo patrón que el resto
 * del backend), que nunca lo ejecuta.
 */
const CONCEPTOS_MANUALES_A1 = [
  { concepto: 'Revaluación de activos', motivo: 'El ERP no registra revaluaciones de activos fijos — no existe ningún módulo que las capture.' },
  { concepto: 'Dividendos a cuenta', motivo: 'El ERP no registra distribuciones de dividendos a cuenta de utilidades.' },
  { concepto: 'Aportes para futura capitalización', motivo: 'El ERP no registra aportes de socios pendientes de capitalizar.' },
];

/**
 * FASE 4 del catálogo fiscal dominicano — genera los Anexos del IR-2 a
 * partir de las etiquetas fiscales de Fase 1/2 y la relación multi-valor
 * de Fase 4 Bloque A (`cuenta_anexo_ir2`). Un anexo por método
 * (getAnexoA1 en Bloque B; getAnexoB1/getAnexoD llegan en bloques
 * posteriores) — todos comparten el mismo criterio: solo se llenan las
 * líneas que el ERP puede respaldar con datos reales. Lo que el ERP no
 * registra en absoluto queda en cero y marcado `llenadoManual: true` —
 * nunca se inventa un valor para que la línea "no se vea vacía".
 */
@Injectable()
export class AnexosIR2Service {
  constructor(
    private dataSource: DataSource,
    private tenantSvc: TenantService,
  ) {}

  private get eid(): number {
    return this.tenantSvc.getEmpresaId();
  }

  // ── Anexo A1 — Balance General ─────────────────────────────────────────

  async getAnexoA1(fechaCorte: string) {
    const eid = this.eid;

    const [conA1, sinA1] = await Promise.all([
      this.cuentasConAnexoA1(eid, fechaCorte),
      this.cuentasDeBalanceSinAnexoA1(eid, fechaCorte),
    ]);

    const activo      = conA1.filter((c) => c.tipo === 'activo');
    const pasivo       = conA1.filter((c) => c.tipo === 'pasivo');
    const patrimonio    = conA1.filter((c) => c.tipo === 'patrimonio');

    const activoCorriente   = activo.filter((c) => c.codigo.startsWith('1.1'));
    const activoNoCorriente = activo.filter((c) => c.codigo.startsWith('1.2'));
    const pasivoCorriente   = pasivo.filter((c) => c.codigo.startsWith('2.1'));
    const pasivoNoCorriente = pasivo.filter((c) => c.codigo.startsWith('2.2'));

    const sumar = (cuentas: { saldo: number }[]) => +cuentas.reduce((s, c) => s + c.saldo, 0).toFixed(2);

    const totalActivo      = sumar(activo);
    const totalPasivo      = sumar(pasivo);
    const totalPatrimonio  = sumar(patrimonio);
    const ecuacion         = +(totalActivo - (totalPasivo + totalPatrimonio)).toFixed(2);

    return {
      fechaCorte,
      activo: {
        corriente:   { cuentas: activoCorriente,   total: sumar(activoCorriente) },
        noCorriente: { cuentas: activoNoCorriente, total: sumar(activoNoCorriente) },
        total:       totalActivo,
      },
      pasivo: {
        corriente:   { cuentas: pasivoCorriente,   total: sumar(pasivoCorriente) },
        noCorriente: { cuentas: pasivoNoCorriente, total: sumar(pasivoNoCorriente) },
        total:       totalPasivo,
      },
      patrimonio: { cuentas: patrimonio, total: totalPatrimonio },
      totales: {
        activos:           totalActivo,
        pasivosPatrimonio: +(totalPasivo + totalPatrimonio).toFixed(2),
        ecuacion,
        cuadrado:          Math.abs(ecuacion) < 0.01,
      },
      lineasLlenadoManual: CONCEPTOS_MANUALES_A1.map((c) => ({ ...c, valor: 0, llenadoManual: true })),
      alertas: {
        // Cuentas de balance (activo/pasivo/patrimonio) con saldo a la fecha
        // de corte que NO tienen la etiqueta A1 — el seed las etiqueta todas,
        // así que esto solo debería aparecer en cuentas creadas a mano sin
        // pasar por el catálogo fiscal. Si aparece algo aquí, el total de
        // este anexo NO incluye esas cuentas — quedan fuera del A1 hasta que
        // se etiqueten, no se les asigna una etiqueta a la fuerza.
        cuentasDeBalanceSinEtiquetaA1: sinA1,
      },
      procedencia:
        'Armado a partir de las cuentas etiquetadas con Anexo A1 (Fase 4 Bloque A) y sus asientos ' +
        'contabilizados hasta la fecha de corte — mismo criterio que el Balance General de Reportes ' +
        'Financieros, filtrado a las cuentas que aportan al IR-2.',
    };
  }

  private async cuentasConAnexoA1(eid: number, fechaCorte: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2" AS "casillaIR2",
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'A1'
      LEFT JOIN asiento_lineas al ON al."cuentaContableId" = cc.id AND al."isActive" = true
      LEFT JOIN asientos_contables ac ON ac.id = al."asientoId"
        AND ac.estado = 'contabilizado' AND ac."isActive" = true
        AND ac."empresaId" = $1 AND ac.fecha <= $2
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2"
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, fechaCorte],
    );
    return rows.map((r) => ({
      codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza,
      casillaIR2: r.casillaIR2, saldo: Number(r.saldo),
    }));
  }

  private async cuentasDeBalanceSinAnexoA1(eid: number, fechaCorte: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo,
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      LEFT JOIN asiento_lineas al ON al."cuentaContableId" = cc.id AND al."isActive" = true
      LEFT JOIN asientos_contables ac ON ac.id = al."asientoId"
        AND ac.estado = 'contabilizado' AND ac."isActive" = true
        AND ac."empresaId" = $1 AND ac.fecha <= $2
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
        AND cc.tipo IN ('activo', 'pasivo', 'patrimonio')
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 ca
          WHERE ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'A1'
        )
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, fechaCorte],
    );
    return rows.map((r) => ({ codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, saldo: Number(r.saldo) }));
  }
}
