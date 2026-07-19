import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../../tenant/tenant.service';

@Injectable()
export class InsumosService {
  private readonly logger = new Logger(InsumosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  async findAll(empresaId: number, params: any) {
    const conds: string[] = [`i."empresaId"=$1 AND i."isActive"=true`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.tipo) { conds.push(`i.tipo=$${idx++}`); args.push(params.tipo); }
    if (params.stockBajo === 'true') {
      conds.push(`i."stockActual" <= i."stockMinimo"`);
    }
    return this.ds.query<any[]>(
      `SELECT * FROM ag_insumos i WHERE ${conds.join(' AND ')} ORDER BY i.nombre`,
      args,
    );
  }

  async create(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_insumos ("empresaId",nombre,tipo,marca,presentacion,unidad,
         "stockActual","stockMinimo","costoUnitario","requiereReceta","periodoCarencia","productoId","creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.nombre, data.tipo ?? null, data.marca ?? null, data.presentacion ?? null,
       data.unidad ?? null, data.stockActual ?? 0, data.stockMinimo ?? 0,
       data.costoUnitario ?? null, data.requiereReceta ?? false,
       data.periodoCarencia ?? null, data.productoId ?? null,
       this.tenantSvc.getUserId()],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ag_insumos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!exists) throw new NotFoundException(`Insumo #${id} no encontrado`);
    const allowed = ['nombre','tipo','marca','presentacion','unidad','stockActual','stockMinimo',
      'costoUnitario','requiereReceta','periodoCarencia','productoId','isActive'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return exists;
    sets.push(`"actualizadoPor"=$${vals.length + 1}`); vals.push(this.tenantSvc.getUserId());
    const [row] = await this.ds.query(
      `UPDATE ag_insumos SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, vals,
    );
    return row;
  }
}
