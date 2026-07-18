import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { calcularAmortizacion } from '../utils/amortizacion.util';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class RefinanciamientoService {
  private readonly logger = new Logger(RefinanciamientoService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private r2(n: number) { return Math.round(Number(n) * 100) / 100; }

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_refinanciamientos WHERE "prestamoOriginalId"=$1 AND "empresaId"=$2`,
      [prestamoId, empresaId],
    );
  }

  async refinanciar(empresaId: number, data: any) {
    const [original] = await this.ds.query<any[]>(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2`, [data.prestamoOriginalId, empresaId],
    );
    if (!original) throw new NotFoundException(`Préstamo #${data.prestamoOriginalId} no encontrado`);
    if (original.estado === 'pagado' || original.estado === 'cancelado') {
      throw new BadRequestException('No se puede refinanciar un préstamo pagado o cancelado');
    }

    const saldoCapital = this.r2(Number(original.saldoCapital ?? 0));
    const saldoInteres = this.r2(Number(original.saldoInteres ?? 0));
    const saldoMora    = this.r2(Number(original.saldoMora ?? 0));
    const moraCondonada    = this.r2(Number(data.moraCondonada    ?? 0));
    const interesCondonado = this.r2(Number(data.interesCondonado ?? 0));

    const montoNuevo = data.montoNuevo
      ? this.r2(Number(data.montoNuevo))
      : this.r2(saldoCapital + (saldoInteres - interesCondonado) + (saldoMora - moraCondonada));

    // Cerrar préstamo original
    await this.ds.query(
      `UPDATE pr_prestamos SET estado='refinanciado',"updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [original.id, empresaId],
    );
    await this.ds.query(
      `UPDATE pr_cuotas SET estado='refinanciada' WHERE "prestamoId"=$1 AND estado<>'pagada'`,
      [original.id],
    );

    // Crear nuevo préstamo
    const nuevaTasa   = data.nuevaTasa   ?? Number(original.tasaInteresMensual);
    const nuevoPlazo  = data.nuevoPlazo  ?? Number(original.plazoMeses);
    const fechaPrimerPago = new Date(data.fechaPrimerPago ?? fechaHoyRD());
    const amort = calcularAmortizacion('frances', montoNuevo, nuevaTasa, nuevoPlazo, fechaPrimerPago);

    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PRE'],
    );
    const numero = `PRE-${seq.num}`;

    const ultimaCuota = amort.tabla[amort.tabla.length - 1];
    const [nuevo] = await this.ds.query<any[]>(
      `INSERT INTO pr_prestamos ("empresaId",numero,"deudorId","productoId","montoPrincipal",
        "tasaInteresMensual","plazoMeses","frecuenciaPago","metodoAmortizacion","cuotaPeriodica",
        "porcentajeMora","diasGracia","fechaDesembolso","fechaPrimerPago","fechaVencimiento",
        "totalInteres","totalAPagar","saldoCapital","saldoInteres","saldoTotal","refinanciaDe")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [empresaId, numero, original.deudorId, original.productoId ?? null, montoNuevo,
       nuevaTasa, nuevoPlazo, original.frecuenciaPago, 'frances', amort.cuotaFija,
       Number(original.porcentajeMora), Number(original.diasGracia),
       fechaHoyRD(),
       fechaPrimerPago.toISOString().split('T')[0],
       ultimaCuota.fechaVencimiento.toISOString().split('T')[0],
       amort.totalInteres, amort.totalAPagar, montoNuevo, amort.totalInteres, amort.totalAPagar,
       original.id],
    );

    for (const linea of amort.tabla) {
      await this.ds.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [empresaId, nuevo.id, linea.numeroCuota, linea.fechaVencimiento.toISOString().split('T')[0],
         linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante],
      );
    }

    // Registrar refinanciamiento
    const [ref] = await this.ds.query<any[]>(
      `INSERT INTO pr_refinanciamientos ("empresaId","prestamoOriginalId","prestamoNuevoId","deudorId",
        "saldoCapitalOriginal","saldoInteresOriginal","saldoMoraOriginal","saldoTotalOriginal",
        "montoNuevo","nuevaTasa","nuevoPlazo","moraCondonada","interesCondonado","autorizadoPor",motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, original.id, nuevo.id, original.deudorId,
       saldoCapital, saldoInteres, saldoMora, this.r2(saldoCapital + saldoInteres + saldoMora),
       montoNuevo, nuevaTasa, nuevoPlazo, moraCondonada, interesCondonado,
       data.autorizadoPor ?? null, data.motivo ?? null],
    );

    return { refinanciamiento: ref, prestamoNuevo: nuevo };
  }
}
