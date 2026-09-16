import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { redondearMoneda } from '../../common/utils/moneda.util';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * Motor ÚNICO de cargos recurrentes por servicio (transporte, comedor, y
 * cualquier otro que se agregue después) — extraído de transporte.service.ts
 * al construir comedor, que necesitaba exactamente la misma lógica. Antes de
 * esto había un solo camino (colegiatura); ahora hay dos consumidores más de
 * ESTE camino, nunca un tercero paralelo — si aparece un servicio nuevo con
 * cargo mensual, se engancha aquí, no se copia el archivo.
 *
 * Reusa ed_cargos (montoOriginal/descuento/montoTotal/montoPagado/
 * saldoPendiente) — el mismo modelo de dinero que colegiatura.service.ts.
 * Las becas NUNCA se consultan aquí: ed_becas.aplicaA solo acepta
 * 'colegiatura'|'inscripcion'|'ambos' — ningún servicio de este motor recibe
 * descuento de beca hoy (confirmado en el código de becas.service.ts, no
 * asumido en ninguno de los dos consumidores).
 */
@Injectable()
export class CargosServicioService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async anioEscolarActivo(empresaId: number) {
    const [anioEscolar] = await this.ds.query<any[]>(
      `SELECT * FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1`,
      [empresaId],
    );
    return anioEscolar ?? null;
  }

  /**
   * Meses a cobrar: desde el mes en curso (o el mes de inicio del año
   * escolar, lo que sea más tarde) hasta el fin del año escolar activo —
   * "el resto del año", nunca retroactivo a meses ya pasados.
   *
   * generate_series en SQL a propósito: `DataSource.query()` devuelve las
   * columnas `date` (fechaInicio/fechaFin) como objetos `Date` de JS
   * construidos en la zona horaria LOCAL del proceso, no strings
   * 'YYYY-MM-DD' — un `.split('-')` sobre ese valor revienta en silencio
   * (bug real atrapado con Playwright al construir transporte: la
   * asignación se creaba, cero cargos, sin ningún error visible). Trabajar
   * sobre el `date` nativo de Postgres evita esa ambigüedad por completo —
   * mismo motivo por el que colegiatura.service.ts nunca hace aritmética de
   * fechas en JS sobre una columna leída de la BD ("fechaVencimiento" <
   * CURRENT_DATE, siempre en SQL).
   */
  private async mesesRestantes(empresaId: number, anioEscolarId: number, hoy: string): Promise<{ mes: number; anio: number }[]> {
    return this.ds.query<any[]>(
      `SELECT EXTRACT(MONTH FROM d)::int AS mes, EXTRACT(YEAR FROM d)::int AS anio
       FROM ed_anios_escolares a,
            LATERAL generate_series(
              GREATEST(date_trunc('month', a."fechaInicio"), date_trunc('month', $3::date)),
              a."fechaFin",
              '1 month'::interval
            ) AS d
       WHERE a.id = $1 AND a."empresaId" = $2`,
      [anioEscolarId, empresaId, hoy],
    );
  }

  /**
   * Genera los cargos pendientes de un servicio, del mes en curso hasta el
   * fin del año escolar activo. Idempotente por (estudianteId,tipo,mes,anio)
   * — llamar dos veces no duplica cargos.
   *
   * `concepto` es la trazabilidad hacia la asignación/plan de origen (mismo
   * campo VARCHAR(200) libre que colegiatura usa para su desglose de
   * descuento) — el llamador arma su propio formato (ver conceptoTransporte/
   * conceptoComedor) porque cada servicio referencia algo distinto (ruta,
   * plan); este service solo lo guarda y lo usa después para anular.
   */
  async generarCargos(empresaId: number, opts: {
    estudianteId: number; tipo: string; concepto: string;
    costoMensual: number | null | undefined; descripcionPrefijo: string;
  }): Promise<{ cargosGenerados: number; motivo?: string }> {
    const costoMensual = Number(opts.costoMensual ?? 0);
    if (!(costoMensual > 0)) {
      return { cargosGenerados: 0, motivo: `No hay costo mensual configurado para ${opts.descripcionPrefijo.toLowerCase()} — no se generaron cargos` };
    }

    const anioEscolar = await this.anioEscolarActivo(empresaId);
    if (!anioEscolar) {
      return { cargosGenerados: 0, motivo: 'No hay un año escolar activo configurado — no se generaron cargos' };
    }

    const hoy = fechaHoyRD();
    const meses = await this.mesesRestantes(empresaId, anioEscolar.id, hoy);
    const monto = redondearMoneda(costoMensual);

    let creados = 0;
    for (const { mes, anio } of meses) {
      const [existe] = await this.ds.query<any[]>(
        `SELECT id FROM ed_cargos WHERE "empresaId" = $1 AND "estudianteId" = $2 AND tipo = $3 AND mes = $4 AND anio = $5`,
        [empresaId, opts.estudianteId, opts.tipo, mes, anio],
      );
      if (existe) continue;

      const vencimiento = `${anio}-${String(mes).padStart(2, '0')}-05`;
      await this.ds.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId",tipo,descripcion,concepto,
           "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
           "fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,$3,$4,$5,$6,0,$6,0,$6,$7,'pendiente',$8,$9)`,
        [empresaId, opts.estudianteId, opts.tipo, `${opts.descripcionPrefijo} ${MESES[mes - 1]} ${anio}`, opts.concepto, monto, vencimiento, mes, anio],
      );
      creados++;
    }
    return { cargosGenerados: creados };
  }

  /**
   * Anula los cargos FUTUROS (fechaVencimiento >= hoy) de un servicio que
   * sigan sin ningún pago encima (montoPagado = 0) — un cargo ya vencido
   * (el servicio ya se prestó) o con algo abonado NUNCA se anula, queda
   * como está. Sin precedente fuera de este motor (matriculas.update() a
   * estado='retirada' no toca ed_cargos) — decisión explícita tomada al
   * construir transporte, ahora compartida.
   */
  async anularCargosFuturosSinPagar(empresaId: number, opts: {
    estudianteId: number; tipo: string; concepto: string;
  }): Promise<{ cargosAnulados: number }> {
    const hoy = fechaHoyRD();
    const [{ n }] = await this.ds.query<any[]>(
      `WITH filas AS (
         UPDATE ed_cargos
           SET estado = 'anulado'
           WHERE "empresaId" = $1 AND "estudianteId" = $2 AND tipo = $3 AND concepto = $4
             AND "montoPagado" = 0 AND "fechaVencimiento" >= $5 AND estado != 'anulado'
           RETURNING id
       ) SELECT COUNT(*)::int AS n FROM filas`,
      [empresaId, opts.estudianteId, opts.tipo, opts.concepto, hoy],
    );
    return { cargosAnulados: n };
  }
}
