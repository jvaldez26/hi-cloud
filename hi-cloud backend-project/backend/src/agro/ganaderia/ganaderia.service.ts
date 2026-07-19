import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../../tenant/tenant.service';

@Injectable()
export class GanaderiaService {
  private readonly logger = new Logger(GanaderiaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT a.*,
              m.numero AS "madreNumero", m.nombre AS "madreNombre",
              p.numero AS "padreNumero", p.nombre AS "padreNombre",
              f.nombre AS "fincaNombre"
         FROM ag_animales a
         LEFT JOIN ag_animales m ON m.id=a."madreId"
         LEFT JOIN ag_animales p ON p.id=a."padreId"
         LEFT JOIN ag_fincas f ON f.id=a."fincaId"
        WHERE a.id=$1 AND a."empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Animal #${id} no encontrado`);
    return row;
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`a."empresaId"=$1 AND a."isActive"=true`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.tipo)     { conds.push(`a.tipo=$${idx++}`);    args.push(params.tipo); }
    if (params.estado)   { conds.push(`a.estado=$${idx++}`);  args.push(params.estado); }
    if (params.proposito){ conds.push(`a.proposito=$${idx++}`);args.push(params.proposito); }
    if (params.fincaId)  { conds.push(`a."fincaId"=$${idx++}`);args.push(Number(params.fincaId)); }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM ag_animales a WHERE ${where}`, args);
    const data = await this.ds.query(
      `SELECT a.*, f.nombre AS "fincaNombre" FROM ag_animales a
         LEFT JOIN ag_fincas f ON f.id=a."fincaId"
        WHERE ${where} ORDER BY a.tipo, a.numero
        LIMIT $${idx} OFFSET $${idx+1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    return this.orFail(empresaId, id);
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_animales ("empresaId","fincaId",numero,nombre,tipo,raza,sexo,"fechaNacimiento",
         "pesoNacimiento","pesoActual",color,origen,"madreId","padreId",proposito,estado,
         "costoAdquisicion",notas,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [empresaId, data.fincaId ?? null, data.numero ?? null, data.nombre ?? null,
       data.tipo, data.raza ?? null, data.sexo ?? null, data.fechaNacimiento ?? null,
       data.pesoNacimiento ?? null, data.pesoActual ?? null, data.color ?? null,
       data.origen ?? 'nacido_finca', data.madreId ?? null, data.padreId ?? null,
       data.proposito ?? null, data.estado ?? 'activo', data.costoAdquisicion ?? null,
       data.notas ?? null, this.tenantSvc.getUserId()],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    await this.orFail(empresaId, id);
    const allowed = ['fincaId','numero','nombre','tipo','raza','sexo','fechaNacimiento',
      'pesoActual','color','proposito','estado','costoAdquisicion','notas','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return this.orFail(empresaId, id);
    sets.push(`"actualizadoPor"=$${vals.length + 1}`); vals.push(this.tenantSvc.getUserId());
    const [row] = await this.ds.query(
      `UPDATE ag_animales SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, vals,
    );
    return row;
  }

  async getEventos(empresaId: number, animalId: number) {
    await this.orFail(empresaId, animalId);
    return this.ds.query<any[]>(
      `SELECT * FROM ag_eventos_animal WHERE "animalId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [animalId, empresaId],
    );
  }

  async createEvento(empresaId: number, animalId: number, data: any) {
    await this.orFail(empresaId, animalId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_eventos_animal ("empresaId","animalId",tipo,fecha,descripcion,peso,
         producto,dosis,costo,"cantidadProduccion","unidadProduccion",responsable,"proximaFecha",notas,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, animalId, data.tipo, data.fecha, data.descripcion ?? null,
       data.peso ?? null, data.producto ?? null, data.dosis ?? null, data.costo ?? 0,
       data.cantidadProduccion ?? null, data.unidadProduccion ?? null,
       data.responsable ?? null, data.proximaFecha ?? null, data.notas ?? null,
       this.tenantSvc.getUserId()],
    );
    // Si es pesaje actualizar peso actual del animal
    if (data.tipo === 'peso' && data.peso) {
      await this.ds.query(
        `UPDATE ag_animales SET "pesoActual"=$1 WHERE id=$2 AND "empresaId"=$3`,
        [data.peso, animalId, empresaId],
      );
    }
    return row;
  }

  async getGenealogía(empresaId: number, animalId: number) {
    const animal = await this.orFail(empresaId, animalId);
    const crias = await this.ds.query<any[]>(
      `SELECT id,numero,nombre,tipo,sexo,estado,"fechaNacimiento","pesoActual"
         FROM ag_animales WHERE ("madreId"=$1 OR "padreId"=$1) AND "empresaId"=$2`,
      [animalId, empresaId],
    );
    return { animal, crias };
  }

  async getProduccionLeche(empresaId: number, params: any) {
    const conds: string[] = [`e."empresaId"=$1 AND e.tipo='produccion_leche'`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.desde) { conds.push(`e.fecha>=$${idx++}`); args.push(params.desde); }
    if (params.hasta) { conds.push(`e.fecha<=$${idx++}`); args.push(params.hasta); }
    return this.ds.query<any[]>(
      `SELECT e.fecha, a.numero AS arete, a.nombre, a.raza,
              e."cantidadProduccion", e."unidadProduccion"
         FROM ag_eventos_animal e
         JOIN ag_animales a ON a.id=e."animalId"
        WHERE ${conds.join(' AND ')}
        ORDER BY e.fecha DESC, a.numero`,
      args,
    );
  }

  async getCalendarioSanitario(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT e."proximaFecha", e.tipo, e.producto, a.numero AS arete, a.nombre, a.tipo AS tipoAnimal,
              e."proximaFecha" - CURRENT_DATE AS diasRestantes
         FROM ag_eventos_animal e
         JOIN ag_animales a ON a.id=e."animalId"
        WHERE e."empresaId"=$1
          AND e."proximaFecha" IS NOT NULL
          AND e."proximaFecha" >= CURRENT_DATE
          AND a.estado='activo'
        ORDER BY e."proximaFecha"
        LIMIT 50`,
      [empresaId],
    );
  }
}
