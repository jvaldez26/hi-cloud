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
    // 'estado' NO está en esta lista a propósito — un cambio de estado pasa
    // SIEMPRE por liberar()/ejecutar() (motivo + rastro de quién lo hizo),
    // nunca por un PATCH genérico sin dejar constancia (Etapa 2 resto, §3).
    const allowed = ['tipo','descripcion','valorTasado','valorRealizacion','ubicacion','notas'];
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

  /**
   * Libera la garantía (caso normal: el préstamo se pagó, o se decide
   * liberarla por otro motivo). Motivo opcional — no mueve nada grave.
   */
  async liberar(empresaId: number, id: number, motivo: string | undefined, usuario: { id: number; nombre?: string }) {
    const actual = await this.findOne(empresaId, id);
    if (actual.estado === 'ejecutada') {
      throw new BadRequestException('Esta garantía ya fue ejecutada — no se puede liberar');
    }
    if (actual.estado === 'liberada') return actual;

    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_garantias SET estado='liberada', "motivoCambioEstado"=$1, "cambiadoPor"=$2, "cambiadoPorNombre"=$3
         WHERE id=$4 AND "empresaId"=$5 RETURNING *
       ) SELECT * FROM fila`,
      [motivo ?? null, usuario.id, usuario.nombre ?? null, id, empresaId],
    );
    this.logger.log(`Garantía #${id} liberada por ${usuario.nombre ?? `usuario #${usuario.id}`}`);
    return row;
  }

  /**
   * Ejecuta la garantía (el banco se queda con el bien por impago) — la
   * acción más grave del módulo, motivo SIEMPRE obligatorio (lo exige el DTO,
   * no aquí) y protegida con RequiereSupervisorSiempre en el controller.
   */
  async ejecutar(empresaId: number, id: number, motivo: string, usuario: { id: number; nombre?: string }) {
    const actual = await this.findOne(empresaId, id);
    if (actual.estado === 'liberada') {
      throw new BadRequestException('Esta garantía ya fue liberada — no se puede ejecutar');
    }
    if (actual.estado === 'ejecutada') return actual;

    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_garantias SET estado='ejecutada', "fechaEjecucion"=NOW(),
           "motivoCambioEstado"=$1, "cambiadoPor"=$2, "cambiadoPorNombre"=$3
         WHERE id=$4 AND "empresaId"=$5 RETURNING *
       ) SELECT * FROM fila`,
      [motivo, usuario.id, usuario.nombre ?? null, id, empresaId],
    );
    this.logger.log(`Garantía #${id} EJECUTADA por ${usuario.nombre ?? `usuario #${usuario.id}`} — ${motivo}`);
    return row;
  }
}
