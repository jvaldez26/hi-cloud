import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async carteraVencida(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')`,
      [empresaId],
    );
    const data = await this.ds.query(
      `SELECT p.*, d.nombre as deudorNombre, d.cedula as deudorCedula, d.telefono as deudorTelefono,
              d.direccion as deudorDireccion
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')
       ORDER BY p."diasMoraActual" DESC LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async gestionesByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT c.*, u.nombre as cobradorNombreU
       FROM pr_cobranzas c LEFT JOIN usuarios u ON u.id=c."cobradorId"
       WHERE c."prestamoId"=$1 AND c."empresaId"=$2 ORDER BY c.fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  async registrarGestion(empresaId: number, data: any) {
    const [prestamo] = await this.ds.query<any[]>(
      `SELECT p.*, d.nombre as deudorNombre FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [data.prestamoId, empresaId],
    );
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_cobranzas ("empresaId","prestamoId","deudorId","cobradorId","cobradorNombre",
        tipo,resultado,"montoPrometido","fechaPromesaPago",descripcion,"diasMoraAlMomento",
        "saldoAlMomento","proximaGestion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId, prestamo.deudorId, data.cobradorId ?? null,
       data.cobradorNombre ?? null, data.tipo ?? null, data.resultado ?? null,
       data.montoPrometido ?? null, data.fechaPromesaPago ?? null, data.descripcion,
       prestamo.diasMoraActual ?? 0, prestamo.saldoTotal ?? 0, data.proximaGestion ?? null],
    );
    return row;
  }

  async resumenCobranza(empresaId: number) {
    const [stats] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE estado IN ('moroso','vencido')) AS totalVencidos,
         SUM("saldoTotal") FILTER (WHERE estado IN ('moroso','vencido')) AS montoVencido,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 1 AND 30) AS mora1a30,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 31 AND 60) AS mora31a60,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 61 AND 90) AS mora61a90,
         COUNT(*) FILTER (WHERE "diasMoraActual" > 90) AS moraMas90
       FROM pr_prestamos WHERE "empresaId"=$1`,
      [empresaId],
    );
    return stats;
  }
}
