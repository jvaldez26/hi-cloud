import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierra los 8 códigos que el motor de asientos automáticos
 * (asientos-automaticos.service.ts) referencia desde siempre pero que
 * nunca se sembraron — cada uno se descartaba en silencio con "cuenta no
 * encontrada" (reportado a Sentry, nunca corregido en el catálogo):
 *
 *   1.1.2.10  Cartera de Crédito (Préstamos Otorgados)
 *   1.1.4.02  ITBIS Retenido a Recuperar (E41)
 *   1.1.4.03  ISR Retenido a Recuperar (E41)
 *   2.1.2.04  ISR Retenido por Pagar (E41)
 *   4.1.2.01  Intereses de Préstamos Otorgados     (bajo el nodo nuevo 4.1.2)
 *   4.1.2.02  Mora de Préstamos Otorgados           (bajo el nodo nuevo 4.1.2)
 *   4.1.3.01  Ganancia en Diferencial Cambiario     (bajo el nodo nuevo 4.1.3)
 *   6.1.5.01  Pérdida en Diferencial Cambiario      (bajo el nodo nuevo 6.1.5)
 *
 * Ninguno es un concepto obsoleto — los 8 son funcionalidades activas hoy
 * (multi-moneda en CxC/CxP, retenciones E41 en compras y ventas, y el
 * módulo Prestamista). El seed (PLAN_CUENTAS en contabilidad.service.ts)
 * ya las tiene para empresas nuevas; esta migración las agrega a las
 * empresas que ya existían cuando se sembraron por primera vez.
 *
 * Idempotente: por cada empresa y cada código, solo inserta si ese
 * (codigo, empresaId) todavía no existe — correrla dos veces no duplica
 * nada. No toca las 66 filas con empresaId NULL (huérfanas del seed
 * legacy de 2026-05-05, ya investigadas y cerradas aparte) ni empresas
 * sin ningún catálogo — solo empresas que ya tienen cuentas_contables.
 *
 * Los 3 nodos padre (4.1.2, 4.1.3, 6.1.5) se insertan PRIMERO en cada
 * empresa — las 8 hojas resuelven su cuentaPadreId con un SELECT contra
 * la fila recién insertada (o la ya existente, si la migración se
 * reejecuta).
 */
export class AgregarCuentasHuerfanasMotor1764700000000 implements MigrationInterface {
  name = 'AgregarCuentasHuerfanasMotor1764700000000';

  private readonly NUEVAS: Array<{
    codigo: string; nombre: string; tipo: string; naturaleza: string;
    nivel: number; permiteMovimientos: boolean; padre?: string;
    esCuentaSistema?: boolean; anexoIR2?: string; tipoGasto606?: string;
  }> = [
    // ── Nodos de agrupación (nivel 3) — primero, sus hojas los referencian ──
    { codigo: '4.1.2', nombre: 'Ingresos por Préstamos',           tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permiteMovimientos: false, padre: '4.1' },
    { codigo: '4.1.3', nombre: 'Diferencial Cambiario (Ingreso)',  tipo: 'ingreso', naturaleza: 'acreedora', nivel: 3, permiteMovimientos: false, padre: '4.1' },
    { codigo: '6.1.5', nombre: 'Diferencial Cambiario (Gasto)',    tipo: 'gasto',   naturaleza: 'deudora',   nivel: 3, permiteMovimientos: false, padre: '6.1' },

    // ── Hojas de movimiento (nivel 4) ──
    { codigo: '1.1.2.10', nombre: 'Cartera de Crédito (Préstamos Otorgados)', tipo: 'activo',  naturaleza: 'deudora',   nivel: 4, permiteMovimientos: true, padre: '1.1.2', esCuentaSistema: true, anexoIR2: 'A1' },
    { codigo: '1.1.4.02', nombre: 'ITBIS Retenido a Recuperar (E41)',         tipo: 'activo',  naturaleza: 'deudora',   nivel: 4, permiteMovimientos: true, padre: '1.1.4', esCuentaSistema: true, anexoIR2: 'A1' },
    { codigo: '1.1.4.03', nombre: 'ISR Retenido a Recuperar (E41)',           tipo: 'activo',  naturaleza: 'deudora',   nivel: 4, permiteMovimientos: true, padre: '1.1.4', esCuentaSistema: true, anexoIR2: 'A1' },
    { codigo: '2.1.2.04', nombre: 'ISR Retenido por Pagar (E41)',             tipo: 'pasivo',  naturaleza: 'acreedora', nivel: 4, permiteMovimientos: true, padre: '2.1.2', esCuentaSistema: true, anexoIR2: 'A1' },
    { codigo: '4.1.2.01', nombre: 'Intereses de Préstamos Otorgados',         tipo: 'ingreso', naturaleza: 'acreedora', nivel: 4, permiteMovimientos: true, padre: '4.1.2', esCuentaSistema: true, anexoIR2: 'B1' },
    { codigo: '4.1.2.02', nombre: 'Mora de Préstamos Otorgados',              tipo: 'ingreso', naturaleza: 'acreedora', nivel: 4, permiteMovimientos: true, padre: '4.1.2', esCuentaSistema: true, anexoIR2: 'B1' },
    { codigo: '4.1.3.01', nombre: 'Ganancia en Diferencial Cambiario',        tipo: 'ingreso', naturaleza: 'acreedora', nivel: 4, permiteMovimientos: true, padre: '4.1.3', esCuentaSistema: true, anexoIR2: 'B1' },
    { codigo: '6.1.5.01', nombre: 'Pérdida en Diferencial Cambiario',         tipo: 'gasto',   naturaleza: 'deudora',   nivel: 4, permiteMovimientos: true, padre: '6.1.5', esCuentaSistema: true, anexoIR2: 'B1', tipoGasto606: '07' },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    const empresas: { empresaId: number }[] = await qr.query(
      `SELECT DISTINCT "empresaId" FROM cuentas_contables WHERE "empresaId" IS NOT NULL ORDER BY "empresaId"`,
    );

    for (const { empresaId } of empresas) {
      for (const c of this.NUEVAS) {
        const existe = await qr.query(
          `SELECT 1 FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
          [c.codigo, empresaId],
        );
        if (existe.length > 0) continue; // idempotente — ya existe para esta empresa

        let cuentaPadreId: number | null = null;
        if (c.padre) {
          const padreRows: { id: number }[] = await qr.query(
            `SELECT id FROM cuentas_contables WHERE codigo = $1 AND "empresaId" = $2 LIMIT 1`,
            [c.padre, empresaId],
          );
          cuentaPadreId = padreRows[0]?.id ?? null;
        }

        await qr.query(
          `INSERT INTO cuentas_contables
             (codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos", "cuentaPadreId",
              "esCuentaSistema", "anexoIR2", "tipoGasto606", "empresaId", "isActive", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, now(), now())`,
          [
            c.codigo, c.nombre, c.tipo, c.naturaleza, c.nivel, c.permiteMovimientos, cuentaPadreId,
            c.esCuentaSistema ?? false, c.anexoIR2 ?? null, c.tipoGasto606 ?? null, empresaId,
          ],
        );
      }
    }
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo: para el momento de un rollback, alguna
    // empresa podría ya tener asientos reales contabilizados contra estas
    // cuentas nuevas (un cobro en moneda extranjera, un préstamo pagado con
    // interés, una compra con retención de ISR) — borrarlas rompería la FK
    // cuentaContableId de asiento_lineas. No-op intencional, mismo criterio
    // que 1764300000000-EtiquetarCuentasFiscalesSeed y
    // 1764600000000-MarcarCuentasSistemaExistentes.
  }
}
