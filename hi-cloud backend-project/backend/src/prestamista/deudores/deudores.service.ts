import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DeudoresService {
  private readonly logger = new Logger(DeudoresService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_deudores WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Deudor #${id} no encontrado`);
    return row;
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`d."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conds.push(`d.estado=$${idx++}`); args.push(params.estado); }
    if (params.nivelRiesgo) { conds.push(`d."nivelRiesgo"=$${idx++}`); args.push(params.nivelRiesgo); }
    if (params.search) {
      conds.push(`(d.nombre ILIKE $${idx} OR d.apellidos ILIKE $${idx} OR d.cedula ILIKE $${idx} OR d.numero ILIKE $${idx} OR d.telefono ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM pr_deudores d WHERE ${where}`, args);
    const data = await this.ds.query(
      `SELECT * FROM pr_deudores d WHERE ${where} ORDER BY d."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    const deudor = await this.orFail(empresaId, id);
    const prestamos = await this.ds.query(
      `SELECT id, numero, "montoPrincipal", "saldoTotal", estado, "fechaDesembolso", "fechaVencimiento"
       FROM pr_prestamos WHERE "deudorId"=$1 AND "empresaId"=$2 ORDER BY "createdAt" DESC`,
      [id, empresaId],
    );
    return { ...deudor, prestamos };
  }

  async create(empresaId: number, data: any) {
    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'DEU'],
    );
    const numero = `DEU-${seq.num}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_deudores ("empresaId",numero,nombre,apellidos,cedula,rnc,"fechaNacimiento",sexo,"estadoCivil",
        telefono,"telefonoTrabajo",email,direccion,"direccionTrabajo",ocupacion,"empresaLabora","ingresoMensual",
        "tiempoEmpleoMeses","referenciaNombre1","referenciaTelefono1","referenciaNombre2","referenciaTelefono2",
        "scoreCredito","nivelRiesgo",estado,"enListaNegra","motivoListaNegra","clienteId",foto,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       RETURNING *`,
      [empresaId, numero, data.nombre, data.apellidos ?? null, data.cedula ?? null, data.rnc ?? null,
       data.fechaNacimiento ?? null, data.sexo ?? null, data.estadoCivil ?? null,
       data.telefono ?? null, data.telefonoTrabajo ?? null, data.email ?? null,
       data.direccion ?? null, data.direccionTrabajo ?? null, data.ocupacion ?? null,
       data.empresaLabora ?? null, data.ingresoMensual ?? null, data.tiempoEmpleoMeses ?? null,
       data.referenciaNombre1 ?? null, data.referenciaTelefono1 ?? null,
       data.referenciaNombre2 ?? null, data.referenciaTelefono2 ?? null,
       data.scoreCredito ?? null, data.nivelRiesgo ?? 'medio', data.estado ?? 'activo',
       data.enListaNegra ?? false, data.motivoListaNegra ?? null,
       data.clienteId ?? null, data.foto ?? null, data.notas ?? null],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['nombre','apellidos','cedula','rnc','fechaNacimiento','sexo','estadoCivil','telefono',
      'telefonoTrabajo','email','direccion','direccionTrabajo','ocupacion','empresaLabora','ingresoMensual',
      'tiempoEmpleoMeses','referenciaNombre1','referenciaTelefono1','referenciaNombre2','referenciaTelefono2',
      'scoreCredito','nivelRiesgo','estado','enListaNegra','motivoListaNegra','clienteId','foto','notas','isActive'];
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    fields.push(`"updatedAt"=NOW()`);
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE pr_deudores SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`, args,
    );
    return row;
  }

  async remove(empresaId: number, id: number) {
    await this.orFail(empresaId, id);
    await this.ds.query(
      `UPDATE pr_deudores SET "isActive"=false, "updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    return { success: true };
  }
}
