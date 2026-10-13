import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * CRUD + ciclo de vida de garantes (avales personales) — la entidad
 * PrGarante existía sin servicio ni controller (una tabla sin API). Ver
 * docs/prestamista/etapa-2-resto.md §2.
 */
@Injectable()
export class GarantesService {
  private readonly logger = new Logger(GarantesService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

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
      `SELECT * FROM pr_garantes WHERE "prestamoId"=$1 AND "empresaId"=$2 AND "isActive"=true ORDER BY "createdAt" DESC`,
      [prestamoId, empresaId],
    );
  }

  async findBySolicitud(empresaId: number, solicitudId: number) {
    return this.ds.query(
      `SELECT * FROM pr_garantes WHERE "solicitudId"=$1 AND "empresaId"=$2 AND "isActive"=true ORDER BY "createdAt" DESC`,
      [solicitudId, empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_garantes WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Garante #${id} no encontrado`);
    return row;
  }

  async create(empresaId: number, data: any) {
    await this.assertPrestamoDeEmpresa(data.prestamoId, empresaId);
    await this.assertSolicitudDeEmpresa(data.solicitudId, empresaId);

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_garantes ("empresaId","prestamoId","solicitudId",nombre,cedula,telefono,direccion,
        ocupacion,"ingresoMensual","relacionDeudor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [empresaId, data.prestamoId ?? null, data.solicitudId ?? null, data.nombre, data.cedula ?? null,
       data.telefono ?? null, data.direccion ?? null, data.ocupacion ?? null,
       data.ingresoMensual ?? null, data.relacionDeudor ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.findOne(empresaId, id);
    const allowed = ['nombre', 'cedula', 'telefono', 'direccion', 'ocupacion', 'ingresoMensual', 'relacionDeudor'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) return this.findOne(empresaId, id);
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_garantes SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *
       ) SELECT * FROM fila`, args,
    );
    return row;
  }

  /**
   * Libera al garante — NUNCA automático al pagarse el préstamo (§2): el
   * deudor puede tener otros préstamos que el mismo garante respalda, o la
   * empresa puede querer conservar el respaldo un tiempo más. Un ADMIN lo
   * decide a mano, con motivo opcional.
   */
  async liberar(empresaId: number, id: number, motivo: string | undefined, usuario: { id: number; nombre?: string }) {
    const actual = await this.findOne(empresaId, id);
    if (actual.estado === 'liberado') return actual;

    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_garantes SET estado='liberado', "liberadoPor"=$1, "liberadoPorNombre"=$2,
           "liberadoEn"=NOW(), "motivoLiberacion"=$3
         WHERE id=$4 AND "empresaId"=$5 RETURNING *
       ) SELECT * FROM fila`,
      [usuario.id, usuario.nombre ?? null, motivo ?? null, id, empresaId],
    );
    this.logger.log(`Garante #${id} liberado por ${usuario.nombre ?? `usuario #${usuario.id}`}`);
    return row;
  }

  async remove(empresaId: number, id: number) {
    await this.findOne(empresaId, id);
    await this.ds.query(`UPDATE pr_garantes SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    return { message: `Garante #${id} eliminado` };
  }
}
