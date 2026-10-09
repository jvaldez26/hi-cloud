import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GarantiasService {
  private readonly logger = new Logger(GarantiasService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * C5: deudorId/prestamoId/solicitudId llegan del body sin validar — una
   * garantía podía quedar enlazada a datos de OTRA empresa, y los reportes
   * (reportes.service.ts → garantias(), que hace JOIN con pr_deudores
   * filtrando solo por g.empresaId) acababan exponiéndolos. Mismo patrón que
   * SolicitudesService.assertDeudorDeEmpresa.
   */
  private async assertDeudorDeEmpresa(deudorId: unknown, empresaId: number): Promise<void> {
    const id = Number(deudorId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('deudorId inválido');
    const [row] = await this.ds.query<any[]>(
      `SELECT 1 FROM pr_deudores WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Deudor #${id} no encontrado`);
  }

  private async assertPrestamoDeEmpresa(prestamoId: unknown, empresaId: number): Promise<void> {
    if (prestamoId == null) return;
    const [row] = await this.ds.query<any[]>(
      `SELECT 1 FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [Number(prestamoId), empresaId],
    );
    if (!row) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
  }

  private async assertSolicitudDeEmpresa(solicitudId: unknown, empresaId: number): Promise<void> {
    if (solicitudId == null) return;
    const [row] = await this.ds.query<any[]>(
      `SELECT 1 FROM pr_solicitudes WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [Number(solicitudId), empresaId],
    );
    if (!row) throw new NotFoundException(`Solicitud #${solicitudId} no encontrada`);
  }

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_garantias WHERE "prestamoId"=$1 AND "empresaId"=$2`, [prestamoId, empresaId],
    );
  }

  async findByDeudor(empresaId: number, deudorId: number) {
    return this.ds.query(
      `SELECT * FROM pr_garantias WHERE "deudorId"=$1 AND "empresaId"=$2 ORDER BY "createdAt" DESC`,
      [deudorId, empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_garantias WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Garantía #${id} no encontrada`);
    return row;
  }

  async create(empresaId: number, data: any) {
    await this.assertDeudorDeEmpresa(data.deudorId, empresaId);
    await this.assertPrestamoDeEmpresa(data.prestamoId, empresaId);
    await this.assertSolicitudDeEmpresa(data.solicitudId, empresaId);

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_garantias ("empresaId","prestamoId","solicitudId","deudorId",tipo,descripcion,
        "valorTasado","valorRealizacion",detalles,"documentosUrls","fotosUrls",ubicacion,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId ?? null, data.solicitudId ?? null, data.deudorId, data.tipo,
       data.descripcion, data.valorTasado ?? null, data.valorRealizacion ?? null,
       data.detalles ? JSON.stringify(data.detalles) : null,
       data.documentosUrls ? JSON.stringify(data.documentosUrls) : null,
       data.fotosUrls ? JSON.stringify(data.fotosUrls) : null,
       data.ubicacion ?? null, data.notas ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.findOne(empresaId, id);
    const allowed = ['tipo','descripcion','valorTasado','valorRealizacion','estado','ubicacion','notas'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (data.detalles !== undefined) { fields.push(`detalles=$${idx++}`); args.push(JSON.stringify(data.detalles)); }
    if (!fields.length) return this.findOne(empresaId, id);
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_garantias SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *
       ) SELECT * FROM fila`, args,
    );
    return row;
  }
}
