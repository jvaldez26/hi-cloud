import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT s.*, d.nombre as deudorNombre, d.cedula as deudorCedula, d.telefono as deudorTelefono
       FROM pr_solicitudes s
       JOIN pr_deudores d ON d.id=s."deudorId"
       WHERE s.id=$1 AND s."empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    return row;
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`s."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conds.push(`s.estado=$${idx++}`); args.push(params.estado); }
    if (params.search) {
      conds.push(`(d.nombre ILIKE $${idx} OR d.cedula ILIKE $${idx} OR s.numero ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_solicitudes s JOIN pr_deudores d ON d.id=s."deudorId" WHERE ${where}`, args,
    );
    const data = await this.ds.query(
      `SELECT s.*, d.nombre as deudorNombre, d.cedula as deudorCedula
       FROM pr_solicitudes s JOIN pr_deudores d ON d.id=s."deudorId"
       WHERE ${where} ORDER BY s."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    return this.orFail(empresaId, id);
  }

  async create(empresaId: number, data: any) {
    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'SOL'],
    );
    const numero = `SOL-${seq.num}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_solicitudes ("empresaId",numero,"deudorId","productoId","montoSolicitado","plazoMeses",
        "frecuenciaPago",proposito,"oficialId","oficialNombre","fechaSolicitud","ingresoMensual",
        "gastosMensuales","capacidadPago",estado,observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [empresaId, numero, data.deudorId, data.productoId ?? null, data.montoSolicitado, data.plazoMeses,
       data.frecuenciaPago ?? 'mensual', data.proposito ?? null, data.oficialId ?? null,
       data.oficialNombre ?? null, data.fechaSolicitud ?? new Date().toISOString().split('T')[0],
       data.ingresoMensual ?? null, data.gastosMensuales ?? null, data.capacidadPago ?? null,
       data.estado ?? 'pendiente', data.observaciones ?? null],
    );
    return row;
  }

  async decidir(empresaId: number, id: number, data: any) {
    const sol = await this.orFail(empresaId, id);
    if (!['pendiente', 'en_revision'].includes(sol.estado)) {
      throw new BadRequestException('Solo se pueden decidir solicitudes en estado pendiente o en revisión');
    }
    const aprobado = data.aprobado === true || data.decision === 'aprobar';
    const estado = aprobado ? 'aprobada' : 'rechazada';
    const motivoFinal = data.motivoRechazo ?? data.motivoDecision ?? null;
    const [row] = await this.ds.query(
      `UPDATE pr_solicitudes SET estado=$1,"montoAprobado"=$2,"tasaAprobada"=$3,"fechaDecision"=CURRENT_DATE,
        "decididoPor"=$4,"motivoRechazo"=$5 WHERE id=$6 AND "empresaId"=$7 RETURNING *`,
      [estado, data.montoAprobado ?? null, data.tasaAprobada ?? null, data.decididoPor ?? null,
       motivoFinal, id, empresaId],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['estado','montoAprobado','tasaAprobada','fechaDecision','decididoPor','motivoRechazo','observaciones','oficialId','oficialNombre'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE pr_solicitudes SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`, args,
    );
    return row;
  }
}
