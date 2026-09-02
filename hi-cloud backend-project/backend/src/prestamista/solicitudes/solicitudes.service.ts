import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { TenantService } from '../../tenant/tenant.service';

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  /**
   * M1: verifica que el deudor referenciado en el body sea de esta empresa.
   * El id llega del cliente, así que no puede confiarse: si apunta al deudor de
   * otro tenant, la solicitud queda enlazada a datos ajenos y los listados los
   * exponen al hacer JOIN.
   */
  private async assertDeudorDeEmpresa(deudorId: unknown, empresaId: number): Promise<void> {
    const id = Number(deudorId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('deudorId inválido');
    }
    const [row] = await this.ds.query<any[]>(
      `SELECT 1 FROM pr_deudores WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Deudor #${id} no encontrado`);
  }

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT s.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula", d.telefono as "deudorTelefono"
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
      `SELECT s.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula"
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
    // M1: el deudorId llega del body. Sin esta comprobación se podía crear una
    // solicitud apuntando al deudor de OTRA empresa, y los listados —que hacen
    // JOIN con pr_deudores— acababan mostrando sus datos.
    await this.assertDeudorDeEmpresa(data.deudorId, empresaId);

    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'SOL'],
    );
    const numero = `SOL-${seq.num}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_solicitudes ("empresaId",numero,"deudorId","productoId","montoSolicitado","plazoMeses",
        "frecuenciaPago",proposito,"oficialId","oficialNombre","fechaSolicitud","ingresoMensual",
        "gastosMensuales","capacidadPago",estado,observaciones,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [empresaId, numero, data.deudorId, data.productoId ?? null, data.montoSolicitado, data.plazoMeses,
       data.frecuenciaPago ?? 'mensual', data.proposito ?? null, data.oficialId ?? null,
       data.oficialNombre ?? null, data.fechaSolicitud ?? fechaHoyRD(),
       data.ingresoMensual ?? null, data.gastosMensuales ?? null, data.capacidadPago ?? null,
       data.estado ?? 'pendiente', data.observaciones ?? null, this.tenantSvc.getUserId()],
    );
    return row;
  }

  async decidir(empresaId: number, id: number, data: any) {
    const sol = await this.orFail(empresaId, id);
    if (!['pendiente', 'en_revision'].includes(sol.estado)) {
      throw new BadRequestException('Solo se pueden decidir solicitudes en estado pendiente o en revisión');
    }
    const aprobado = data.aprobado === true || data.decision === 'aprobar';

    // C5 + Segregación de funciones: el aprobador sale del CLS (JWT), no del body,
    // y NO puede ser la misma persona que creó la solicitud.
    const uid = this.tenantSvc.getUserId();
    if (aprobado && sol.creadoPor != null && Number(sol.creadoPor) === uid) {
      throw new ForbiddenException('Quien crea una solicitud no puede aprobarla');
    }

    const estado = aprobado ? 'aprobada' : 'rechazada';
    const motivoFinal = data.motivoRechazo ?? data.motivoDecision ?? null;
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_solicitudes SET estado=$1,"montoAprobado"=$2,"tasaAprobada"=$3,"fechaDecision"=CURRENT_DATE,
          "decididoPor"=$4,"motivoRechazo"=$5 WHERE id=$6 AND "empresaId"=$7 RETURNING *
       ) SELECT * FROM fila`,
      [estado, data.montoAprobado ?? null, data.tasaAprobada ?? null, uid != null ? String(uid) : null,
       motivoFinal, id, empresaId],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    // H3/D: los campos de la DECISIÓN (estado, montos/tasa aprobados, decididoPor,
    // fechaDecision, motivoRechazo) NO se editan por el PATCH genérico — solo por
    // /decidir (con su rol y el chequeo de segregación). Aquí solo campos no sensibles.
    const allowed = ['observaciones','oficialId','oficialNombre'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_solicitudes SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *
       ) SELECT * FROM fila`, args,
    );
    return row;
  }
}
