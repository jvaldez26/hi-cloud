import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { FacturasService } from '../facturas/facturas.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { User } from '../users/users.entity';

@Injectable()
export class TransporteService {
  private readonly logger = new Logger(TransporteService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly facturasSvc: FacturasService,
  ) {}

  // ── HELPERS ────────────────────────────────────────────────────────────────

  private async choferOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM tr_choferes WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Chofer #${id} no encontrado`);
    return row;
  }

  private async vehiculoOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM tr_vehiculos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Vehículo #${id} no encontrado`);
    return row;
  }

  private async viajeOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT v.*, c.nombre AS "choferNombre", vh.placa AS "vehiculoPlaca",
              vh.marca AS "vehiculoMarca", vh.modelo AS "vehiculoModelo",
              cl.nombre AS "clienteNombre"
         FROM tr_viajes v
         LEFT JOIN tr_choferes  c  ON c.id  = v."choferId"
         LEFT JOIN tr_vehiculos vh ON vh.id = v."vehiculoId"
         LEFT JOIN clientes     cl ON cl.id = v."clienteId"
        WHERE v.id=$1 AND v."empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Viaje #${id} no encontrado`);
    return row;
  }

  // ── CHOFERES ──────────────────────────────────────────────────────────────

  async findAllChoferes(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM tr_viajes v WHERE v."choferId"=c.id) AS "totalViajes"
         FROM tr_choferes c
        WHERE c."empresaId"=$1 AND c."isActive"=true
        ORDER BY c.nombre`,
      [empresaId],
    );
  }

  async createChofer(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tr_choferes
         ("empresaId",nombre,cedula,telefono,email,licencia,"tipoLicencia","vencimientoLicencia",estado,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        empresaId, data.nombre, data.cedula ?? null, data.telefono ?? null,
        data.email ?? null, data.licencia ?? null, data.tipoLicencia ?? null,
        data.vencimientoLicencia ?? null, data.estado ?? 'activo', data.notas ?? null,
      ],
    );
    return row;
  }

  async updateChofer(empresaId: number, id: number, data: any) {
    await this.choferOr404(empresaId, id);
    const sets: string[] = [];
    const vals: any[]   = [];
    let   idx           = 1;
    const map: Record<string, string> = {
      nombre: 'nombre', cedula: 'cedula', telefono: 'telefono', email: 'email',
      licencia: 'licencia', tipoLicencia: '"tipoLicencia"',
      vencimientoLicencia: '"vencimientoLicencia"', estado: 'estado', notas: 'notas',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { sets.push(`${col}=$${idx++}`); vals.push(data[key]); }
    }
    if (!sets.length) return this.choferOr404(empresaId, id);
    sets.push(`"updatedAt"=NOW()`);
    vals.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE tr_choferes SET ${sets.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      vals,
    );
    return row;
  }

  async deleteChofer(empresaId: number, id: number) {
    await this.choferOr404(empresaId, id);
    await this.ds.query(
      `UPDATE tr_choferes SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    return { message: 'Chofer eliminado' };
  }

  // ── VEHÍCULOS ─────────────────────────────────────────────────────────────

  async findAllVehiculos(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT v.*, c.nombre AS "choferNombre",
              (SELECT COUNT(*) FROM tr_viajes vj WHERE vj."vehiculoId"=v.id) AS "totalViajes"
         FROM tr_vehiculos v
         LEFT JOIN tr_choferes c ON c.id = v."choferId"
        WHERE v."empresaId"=$1 AND v."isActive"=true
        ORDER BY v.placa`,
      [empresaId],
    );
  }

  async createVehiculo(empresaId: number, data: any) {
    const existing = await this.ds.query<any[]>(
      `SELECT id FROM tr_vehiculos WHERE "empresaId"=$1 AND placa=$2 AND "isActive"=true`,
      [empresaId, (data.placa as string).toUpperCase()],
    );
    if (existing.length) throw new BadRequestException(`La placa ${data.placa} ya está registrada`);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tr_vehiculos
         ("empresaId",placa,marca,modelo,anio,tipo,color,capacidad,estado,"choferId",
          "seguroVencimiento","marbeteVencimiento","inspeccionVencimiento",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        empresaId, (data.placa as string).toUpperCase(), data.marca, data.modelo,
        data.anio ?? null, data.tipo ?? 'camion', data.color ?? null,
        data.capacidad ?? null, data.estado ?? 'operativo', data.choferId ?? null,
        data.seguroVencimiento ?? null, data.marbeteVencimiento ?? null,
        data.inspeccionVencimiento ?? null, data.notas ?? null,
      ],
    );
    return row;
  }

  async updateVehiculo(empresaId: number, id: number, data: any) {
    await this.vehiculoOr404(empresaId, id);
    if (data.placa) {
      const dup = await this.ds.query<any[]>(
        `SELECT id FROM tr_vehiculos WHERE "empresaId"=$1 AND placa=$2 AND id<>$3 AND "isActive"=true`,
        [empresaId, (data.placa as string).toUpperCase(), id],
      );
      if (dup.length) throw new BadRequestException(`La placa ${data.placa} ya está en uso`);
    }
    const sets: string[] = [];
    const vals: any[]   = [];
    let   idx           = 1;
    const map: Record<string, string> = {
      placa: 'placa', marca: 'marca', modelo: 'modelo', anio: 'anio', tipo: 'tipo',
      color: 'color', capacidad: 'capacidad', estado: 'estado', choferId: '"choferId"',
      seguroVencimiento: '"seguroVencimiento"', marbeteVencimiento: '"marbeteVencimiento"',
      inspeccionVencimiento: '"inspeccionVencimiento"', notas: 'notas',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        sets.push(`${col}=$${idx++}`);
        vals.push(key === 'placa' ? (data[key] as string).toUpperCase() : data[key]);
      }
    }
    if (!sets.length) return this.vehiculoOr404(empresaId, id);
    sets.push(`"updatedAt"=NOW()`);
    vals.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE tr_vehiculos SET ${sets.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      vals,
    );
    return row;
  }

  async deleteVehiculo(empresaId: number, id: number) {
    await this.vehiculoOr404(empresaId, id);
    await this.ds.query(
      `UPDATE tr_vehiculos SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    return { message: 'Vehículo eliminado' };
  }

  // ── VIAJES ────────────────────────────────────────────────────────────────

  async findAllViajes(empresaId: number, opts: { estado?: string; vehiculoId?: number; page?: number; limit?: number }) {
    const page  = Math.max(1, opts.page  ?? 1);
    const limit = Math.min(100, opts.limit ?? 50);
    const offset = (page - 1) * limit;

    const whereParts = [`v."empresaId"=$1`];
    const vals: any[] = [empresaId];
    let   idx = 2;

    if (opts.estado) {
      whereParts.push(`v.estado=$${idx++}`);
      vals.push(opts.estado);
    }
    if (opts.vehiculoId) {
      whereParts.push(`v."vehiculoId"=$${idx++}`);
      vals.push(opts.vehiculoId);
    }

    const where = whereParts.join(' AND ');
    const [{ total }] = await this.ds.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM tr_viajes v WHERE ${where}`, vals,
    );

    const rows = await this.ds.query<any[]>(
      `SELECT v.*, c.nombre AS "choferNombre", vh.placa AS "vehiculoPlaca",
              vh.marca || ' ' || vh.modelo AS "vehiculoDescripcion",
              cl.nombre AS "clienteNombre"
         FROM tr_viajes v
         LEFT JOIN tr_choferes  c  ON c.id  = v."choferId"
         LEFT JOIN tr_vehiculos vh ON vh.id = v."vehiculoId"
         LEFT JOIN clientes     cl ON cl.id = v."clienteId"
        WHERE ${where}
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...vals, limit, offset],
    );

    return { data: rows, total: Number(total), page, limit };
  }

  async findOneViaje(empresaId: number, id: number) {
    return this.viajeOr404(empresaId, id);
  }

  async createViaje(empresaId: number, sucursalId: number | undefined, data: any) {
    const numero = await generarNumeroSecuencial(
      this.ds, 'tr_viajes', 'numero', '^VJ-[0-9]+$', 'VJ-', 1, empresaId,
    );
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tr_viajes
         ("empresaId","sucursalId",numero,fecha,origen,destino,"clienteId","choferId","vehiculoId",tarifa,estado,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        empresaId, sucursalId ?? null, numero,
        data.fecha ?? new Date().toISOString().substring(0, 10),
        data.origen, data.destino, data.clienteId ?? null,
        data.choferId ?? null, data.vehiculoId ?? null,
        Number(data.tarifa ?? 0), data.estado ?? 'programado', data.notas ?? null,
      ],
    );
    const newId: number = row?.id;
    if (!newId) throw new NotFoundException(`Error al obtener el viaje creado`);
    return this.viajeOr404(empresaId, newId);
  }

  async updateViaje(empresaId: number, id: number, data: any) {
    const viaje = await this.viajeOr404(empresaId, id);
    if (viaje.estado === 'facturado' && data.estado && data.estado !== 'facturado') {
      throw new BadRequestException('No se puede cambiar el estado de un viaje facturado');
    }
    const sets: string[] = [];
    const vals: any[]   = [];
    let   idx           = 1;
    const map: Record<string, string> = {
      fecha: 'fecha', origen: 'origen', destino: 'destino', clienteId: '"clienteId"',
      choferId: '"choferId"', vehiculoId: '"vehiculoId"', tarifa: 'tarifa',
      estado: 'estado', notas: 'notas',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { sets.push(`${col}=$${idx++}`); vals.push(data[key]); }
    }
    if (!sets.length) return viaje;
    sets.push(`"updatedAt"=NOW()`);
    vals.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE tr_viajes SET ${sets.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      vals,
    );
    if (!row) throw new NotFoundException(`Viaje #${id} no encontrado`);
    return this.viajeOr404(empresaId, id);
  }

  async facturarViaje(empresaId: number, id: number, usuario: User) {
    const viaje = await this.viajeOr404(empresaId, id);
    if (viaje.estado === 'facturado') {
      throw new BadRequestException('Este viaje ya fue facturado');
    }
    if (viaje.estado !== 'completado') {
      throw new BadRequestException('Solo se pueden facturar viajes en estado COMPLETADO');
    }

    const fecha = new Date().toISOString().substring(0, 10);
    const factura = await this.facturasSvc.create(
      {
        fecha,
        clienteId: viaje.clienteId ?? undefined,
        tipoNcf: 'E31',
        notas: `Viaje #${viaje.numero}: ${viaje.origen} → ${viaje.destino}`,
        tipoPago: 'CONTADO',
        detalles: [
          {
            descripcion: `Servicio de transporte: ${viaje.origen} → ${viaje.destino}`,
            cantidad: 1,
            precioUnitario: Number(viaje.tarifa),
            porcentajeIva: 0,
          },
        ],
      },
      usuario,
    );

    await this.ds.query(
      `UPDATE tr_viajes SET estado='facturado',"facturaId"=$1,"updatedAt"=NOW()
        WHERE id=$2 AND "empresaId"=$3`,
      [(factura as any).id, id, empresaId],
    );

    return { ...viaje, estado: 'facturado', facturaId: (factura as any).id, factura };
  }

  async getViajesFacturables(empresaId: number, clienteId: number, excluirId?: number) {
    let sql = `SELECT v.id, v.numero, v.fecha, v.origen, v.destino, v.tarifa, v.estado,
                      v."clienteId", v."facturaId", cl.nombre AS "clienteNombre"
                 FROM tr_viajes v
                 LEFT JOIN clientes cl ON cl.id = v."clienteId"
                WHERE v."empresaId"=$1 AND v."clienteId"=$2
                  AND v.estado='completado' AND v."facturaId" IS NULL`;
    const vals: any[] = [empresaId, clienteId];
    if (excluirId) { sql += ` AND v.id!=$3`; vals.push(excluirId); }
    sql += ` ORDER BY v.fecha ASC, v.id ASC`;
    return this.ds.query<any[]>(sql, vals);
  }

  async facturarLote(empresaId: number, ids: number[], usuario: User) {
    if (!ids.length) throw new BadRequestException('Debes seleccionar al menos un viaje');
    if (ids.length > 50) throw new BadRequestException('Máximo 50 viajes por factura');

    const viajes = await this.ds.query<any[]>(
      `SELECT v.*, cl.nombre AS "clienteNombre" FROM tr_viajes v
       LEFT JOIN clientes cl ON cl.id = v."clienteId"
       WHERE v."empresaId"=$1 AND v.id=ANY($2) ORDER BY v.fecha ASC, v.id ASC`,
      [empresaId, ids],
    );
    if (viajes.length !== ids.length)
      throw new BadRequestException('Algunos viajes no existen o no pertenecen a esta empresa');

    const noFacturables = viajes.filter((v: any) => v.estado !== 'completado' || v.facturaId);
    if (noFacturables.length)
      throw new BadRequestException(`Viaje(s) no facturables: ${noFacturables.map((v: any) => v.numero).join(', ')}`);

    const clienteIds = [...new Set(viajes.map((v: any) => v.clienteId))];
    if (clienteIds.length > 1)
      throw new BadRequestException('Todos los viajes deben ser del mismo cliente');

    const fecha    = new Date().toISOString().substring(0, 10);
    const clienteId = viajes[0].clienteId ?? undefined;
    const numeros  = viajes.map((v: any) => v.numero).join(', ');

    const factura = await this.facturasSvc.create(
      {
        fecha,
        clienteId,
        tipoNcf: 'E31',
        notas: `Viajes: ${numeros}`,
        tipoPago: 'CONTADO',
        detalles: viajes.map((v: any) => ({
          descripcion: `Servicio de transporte ${v.numero}: ${v.origen} → ${v.destino}`,
          cantidad: 1,
          precioUnitario: Number(v.tarifa),
          porcentajeIva: 0,
        })),
      },
      usuario,
    );

    const facturaId = (factura as any).id;
    await this.ds.query(
      `UPDATE tr_viajes SET estado='facturado',"facturaId"=$1,"updatedAt"=NOW()
        WHERE id=ANY($2) AND "empresaId"=$3`,
      [facturaId, ids, empresaId],
    );

    return { ...(factura as any), viajes, viajeIds: ids };
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  async getDashboard(empresaId: number) {
    const hoy = new Date().toISOString().substring(0, 10);
    const [
      totalVehiculos, vehiculosOperativos, vehiculosEnMantenimiento,
      totalChoferes, choferesActivos,
      viajesHoy, viajesMes,
      viajesPorEstado,
      alertasVencimiento,
      combustibleMes,
      mantenimientoMes,
    ] = await Promise.all([
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_vehiculos WHERE "empresaId"=$1 AND "isActive"=true`, [empresaId]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_vehiculos WHERE "empresaId"=$1 AND estado='operativo' AND "isActive"=true`, [empresaId]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_vehiculos WHERE "empresaId"=$1 AND estado='mantenimiento' AND "isActive"=true`, [empresaId]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_choferes  WHERE "empresaId"=$1 AND "isActive"=true`, [empresaId]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_choferes  WHERE "empresaId"=$1 AND estado='activo' AND "isActive"=true`, [empresaId]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total FROM tr_viajes WHERE "empresaId"=$1 AND fecha=$2`, [empresaId, hoy]),
      this.ds.query<any[]>(`SELECT COUNT(*) AS total, COALESCE(SUM(tarifa),0) AS ingresos FROM tr_viajes WHERE "empresaId"=$1 AND fecha>=date_trunc('month',NOW()::date) AND estado NOT IN ('cancelado')`, [empresaId]),
      this.ds.query<any[]>(`SELECT estado, COUNT(*) AS total FROM tr_viajes WHERE "empresaId"=$1 AND fecha>=date_trunc('month',NOW()::date) GROUP BY estado`, [empresaId]),
      this.ds.query<any[]>(`
        SELECT 'seguro' AS tipo, placa, "seguroVencimiento" AS vencimiento
          FROM tr_vehiculos WHERE "empresaId"=$1 AND "isActive"=true AND "seguroVencimiento" IS NOT NULL AND "seguroVencimiento" <= (NOW() + INTERVAL '30 days')::date
        UNION ALL
        SELECT 'marbete' AS tipo, placa, "marbeteVencimiento" AS vencimiento
          FROM tr_vehiculos WHERE "empresaId"=$1 AND "isActive"=true AND "marbeteVencimiento" IS NOT NULL AND "marbeteVencimiento" <= (NOW() + INTERVAL '30 days')::date
        UNION ALL
        SELECT 'licencia' AS tipo, nombre AS placa, "vencimientoLicencia" AS vencimiento
          FROM tr_choferes WHERE "empresaId"=$1 AND "isActive"=true AND "vencimientoLicencia" IS NOT NULL AND "vencimientoLicencia" <= (NOW() + INTERVAL '30 days')::date
        ORDER BY vencimiento ASC
        LIMIT 10
      `, [empresaId, empresaId, empresaId]),
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(total),0) AS costo, COALESCE(SUM(galones),0) AS galones, COUNT(*) AS cargas
           FROM tr_combustible WHERE "empresaId"=$1 AND fecha >= date_trunc('month', NOW()::date)`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(costo),0) AS costo, COUNT(*) AS cantidad
           FROM tr_mantenimiento WHERE "empresaId"=$1 AND fecha >= date_trunc('month', NOW()::date)`,
        [empresaId],
      ),
    ]);

    return {
      flota: {
        total:          Number(totalVehiculos[0].total),
        operativos:     Number(vehiculosOperativos[0].total),
        enMantenimiento: Number(vehiculosEnMantenimiento[0].total),
      },
      choferes: {
        total:  Number(totalChoferes[0].total),
        activos: Number(choferesActivos[0].total),
      },
      viajes: {
        hoy:         Number(viajesHoy[0].total),
        mes:         Number(viajesMes[0].total),
        ingresosMes: Number(viajesMes[0].ingresos),
        porEstado:   viajesPorEstado,
      },
      combustible: {
        costoMes:   Number(combustibleMes[0].costo),
        galonesMes: Number(combustibleMes[0].galones),
        cargasMes:  Number(combustibleMes[0].cargas),
      },
      mantenimiento: {
        costoMes:   Number(mantenimientoMes[0].costo),
        cantidadMes: Number(mantenimientoMes[0].cantidad),
      },
      alertas: alertasVencimiento,
    };
  }

  // ── COMBUSTIBLE ───────────────────────────────────────────────────────────

  async findAllCombustible(empresaId: number, opts: { vehiculoId?: number; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, opts.limit ?? 50);
    const offset = (page - 1) * limit;

    const whereParts = [`c."empresaId"=$1`];
    const vals: any[] = [empresaId];
    let   idx = 2;

    if (opts.vehiculoId) { whereParts.push(`c."vehiculoId"=$${idx++}`); vals.push(opts.vehiculoId); }

    const where = whereParts.join(' AND ');
    const [{ total }] = await this.ds.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM tr_combustible c WHERE ${where}`, vals,
    );

    const rows = await this.ds.query<any[]>(
      `SELECT c.*, v.placa AS "vehiculoPlaca", ch.nombre AS "choferNombre",
              vj.numero AS "viajeNumero"
         FROM tr_combustible c
         LEFT JOIN tr_vehiculos v  ON v.id  = c."vehiculoId"
         LEFT JOIN tr_choferes  ch ON ch.id = c."choferId"
         LEFT JOIN tr_viajes    vj ON vj.id = c."viajeId"
        WHERE ${where}
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...vals, limit, offset],
    );

    return { data: rows, total: Number(total), page, limit };
  }

  async createCombustible(empresaId: number, data: any) {
    const total = data.total ?? (
      data.galones && data.precioGalon
        ? Math.round(Number(data.galones) * Number(data.precioGalon) * 100) / 100
        : 0
    );
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tr_combustible
         ("empresaId","vehiculoId","choferId",fecha,"tipoCombustible",galones,"precioGalon",total,odometro,estacion,notas,"viajeId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        empresaId, data.vehiculoId ?? null, data.choferId ?? null,
        data.fecha ?? new Date().toISOString().substring(0, 10),
        data.tipoCombustible ?? 'gasolina',
        data.galones ?? null, data.precioGalon ?? null, total,
        data.odometro ?? null, data.estacion ?? null, data.notas ?? null,
        data.viajeId ?? null,
      ],
    );
    return row;
  }

  async updateCombustible(empresaId: number, id: number, data: any) {
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM tr_combustible WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!existing) throw new NotFoundException(`Registro de combustible #${id} no encontrado`);

    const total = data.total ?? (
      data.galones && data.precioGalon
        ? Math.round(Number(data.galones) * Number(data.precioGalon) * 100) / 100
        : undefined
    );

    const sets: string[] = [];
    const vals: any[]    = [];
    let   idx = 1;

    const fields: Record<string, any> = {
      vehiculoId:      data.vehiculoId      ?? null,
      choferId:        data.choferId        ?? null,
      viajeId:         data.viajeId         ?? null,
      fecha:           data.fecha,
      tipoCombustible: data.tipoCombustible,
      galones:         data.galones         ?? null,
      precioGalon:     data.precioGalon     ?? null,
      odometro:        data.odometro        ?? null,
      estacion:        data.estacion        ?? null,
      notas:           data.notas           ?? null,
    };
    if (total !== undefined) fields['total'] = total;

    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined) { sets.push(`"${col}"=$${idx++}`); vals.push(val); }
    }
    if (!sets.length) return existing;

    vals.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE tr_combustible SET ${sets.join(',')} WHERE id=$${idx} AND "empresaId"=$${idx + 1} RETURNING *`,
      vals,
    );
    return row;
  }

  async deleteCombustible(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT id FROM tr_combustible WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Registro de combustible #${id} no encontrado`);
    await this.ds.query(`DELETE FROM tr_combustible WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    return { message: 'Registro eliminado' };
  }

  async getCombustibleStats(empresaId: number) {
    const [mesActual, porVehiculo, porTipo] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT COALESCE(SUM(total),0) AS costo, COALESCE(SUM(galones),0) AS galones, COUNT(*) AS cargas
           FROM tr_combustible
          WHERE "empresaId"=$1 AND fecha >= date_trunc('month', NOW()::date)`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT v.placa, v.marca||' '||v.modelo AS vehiculo,
                COALESCE(SUM(c.total),0)   AS costoMes,
                COALESCE(SUM(c.galones),0) AS galonesMes,
                COUNT(*)                   AS cargas
           FROM tr_combustible c
           JOIN tr_vehiculos v ON v.id = c."vehiculoId"
          WHERE c."empresaId"=$1 AND c.fecha >= date_trunc('month', NOW()::date)
          GROUP BY v.id, v.placa, v.marca, v.modelo
          ORDER BY costoMes DESC`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT "tipoCombustible", COALESCE(SUM(total),0) AS costo, COALESCE(SUM(galones),0) AS galones
           FROM tr_combustible
          WHERE "empresaId"=$1 AND fecha >= date_trunc('month', NOW()::date)
          GROUP BY "tipoCombustible"`,
        [empresaId],
      ),
    ]);

    return {
      mesActual: {
        costo:   Number(mesActual[0].costo),
        galones: Number(mesActual[0].galones),
        cargas:  Number(mesActual[0].cargas),
      },
      porVehiculo,
      porTipo,
    };
  }

  // ── MANTENIMIENTO ─────────────────────────────────────────────────────────

  async findAllMantenimientos(empresaId: number, opts: { vehiculoId?: number; estado?: string; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, opts.limit ?? 50);
    const offset = (page - 1) * limit;

    const whereParts = [`m."empresaId"=$1`];
    const vals: any[] = [empresaId];
    let   idx = 2;

    if (opts.vehiculoId) { whereParts.push(`m."vehiculoId"=$${idx++}`); vals.push(opts.vehiculoId); }
    if (opts.estado)     { whereParts.push(`m.estado=$${idx++}`);        vals.push(opts.estado);     }

    const where = whereParts.join(' AND ');
    const [{ total }] = await this.ds.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM tr_mantenimiento m WHERE ${where}`, vals,
    );

    const rows = await this.ds.query<any[]>(
      `SELECT m.*, v.placa AS "vehiculoPlaca", v.marca||' '||v.modelo AS "vehiculoDescripcion"
         FROM tr_mantenimiento m
         LEFT JOIN tr_vehiculos v ON v.id = m."vehiculoId"
        WHERE ${where}
        ORDER BY m.fecha DESC, m.id DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...vals, limit, offset],
    );

    return { data: rows, total: Number(total), page, limit };
  }

  async createMantenimiento(empresaId: number, data: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tr_mantenimiento
         ("empresaId","vehiculoId",fecha,tipo,descripcion,costo,proveedor,"odometroActual","proximaFecha","proximoKm",estado,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        empresaId, data.vehiculoId ?? null,
        data.fecha ?? new Date().toISOString().substring(0, 10),
        data.tipo ?? 'preventivo', data.descripcion,
        Number(data.costo ?? 0), data.proveedor ?? null,
        data.odometroActual ?? null, data.proximaFecha ?? null, data.proximoKm ?? null,
        data.estado ?? 'programado', data.notas ?? null,
      ],
    );
    return row;
  }

  async updateMantenimiento(empresaId: number, id: number, data: any) {
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM tr_mantenimiento WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!existing) throw new NotFoundException(`Mantenimiento #${id} no encontrado`);

    const sets: string[] = [];
    const vals: any[]   = [];
    let   idx           = 1;
    const map: Record<string, string> = {
      vehiculoId: '"vehiculoId"', fecha: 'fecha', tipo: 'tipo', descripcion: 'descripcion',
      costo: 'costo', proveedor: 'proveedor', odometroActual: '"odometroActual"',
      proximaFecha: '"proximaFecha"', proximoKm: '"proximoKm"', estado: 'estado', notas: 'notas',
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { sets.push(`${col}=$${idx++}`); vals.push(data[key]); }
    }
    if (!sets.length) return existing;
    sets.push(`"updatedAt"=NOW()`);
    vals.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE tr_mantenimiento SET ${sets.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      vals,
    );
    return row;
  }

  async deleteMantenimiento(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT id FROM tr_mantenimiento WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Mantenimiento #${id} no encontrado`);
    await this.ds.query(`DELETE FROM tr_mantenimiento WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    return { message: 'Mantenimiento eliminado' };
  }

  async getMantenimientoProgramado(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT m.*, v.placa AS "vehiculoPlaca", v.marca||' '||v.modelo AS "vehiculoDescripcion"
         FROM tr_mantenimiento m
         LEFT JOIN tr_vehiculos v ON v.id = m."vehiculoId"
        WHERE m."empresaId"=$1 AND m.estado IN ('programado','en_proceso')
        ORDER BY m."proximaFecha" ASC NULLS LAST, m.fecha DESC
        LIMIT 20`,
      [empresaId],
    );
  }

  // ── REPORTES ──────────────────────────────────────────────────────────────

  async reporteViajes(empresaId: number, params: { desde: string; hasta: string; vehiculoId?: number; choferId?: number }) {
    const vals: any[] = [empresaId, params.desde, params.hasta];
    let idx = 4;
    const extra: string[] = [];
    if (params.vehiculoId) { extra.push(`v."vehiculoId"=$${idx++}`); vals.push(params.vehiculoId); }
    if (params.choferId)   { extra.push(`v."choferId"=$${idx++}`);   vals.push(params.choferId);   }
    const extraWhere = extra.length ? ' AND ' + extra.join(' AND ') : '';

    const rows = await this.ds.query<any[]>(
      `SELECT v.numero, v.fecha, v.origen, v.destino, v.tarifa, v.estado,
              c.nombre  AS "choferNombre",
              vh.placa  AS "vehiculoPlaca",
              vh.marca||' '||vh.modelo AS "vehiculoDescripcion",
              cl.nombre AS "clienteNombre"
         FROM tr_viajes v
         LEFT JOIN tr_choferes  c  ON c.id  = v."choferId"
         LEFT JOIN tr_vehiculos vh ON vh.id = v."vehiculoId"
         LEFT JOIN clientes     cl ON cl.id = v."clienteId"
        WHERE v."empresaId"=$1 AND v.fecha BETWEEN $2 AND $3${extraWhere}
        ORDER BY v.fecha DESC, v.id DESC`,
      vals,
    );

    const totalTarifa = rows.reduce((s, r) => s + Number(r.tarifa ?? 0), 0);
    const totalViajes = rows.length;
    return { data: rows, totalViajes, totalTarifa };
  }

  async reporteCombustible(empresaId: number, params: { desde: string; hasta: string }) {
    const [detalle, porVehiculo] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT c.fecha, c."tipoCombustible", c.galones, c."precioGalon", c.total, c.odometro, c.estacion,
                v.placa AS "vehiculoPlaca", v.marca||' '||v.modelo AS "vehiculoDescripcion",
                ch.nombre AS "choferNombre"
           FROM tr_combustible c
           LEFT JOIN tr_vehiculos v  ON v.id  = c."vehiculoId"
           LEFT JOIN tr_choferes  ch ON ch.id = c."choferId"
          WHERE c."empresaId"=$1 AND c.fecha BETWEEN $2 AND $3
          ORDER BY c.fecha DESC`,
        [empresaId, params.desde, params.hasta],
      ),
      this.ds.query<any[]>(
        `SELECT v.placa, v.marca||' '||v.modelo AS vehiculo,
                COALESCE(SUM(c.total),0)   AS costoTotal,
                COALESCE(SUM(c.galones),0) AS galonesTotal,
                COUNT(*)                   AS cargas
           FROM tr_combustible c
           JOIN tr_vehiculos v ON v.id = c."vehiculoId"
          WHERE c."empresaId"=$1 AND c.fecha BETWEEN $2 AND $3
          GROUP BY v.id, v.placa, v.marca, v.modelo
          ORDER BY costoTotal DESC`,
        [empresaId, params.desde, params.hasta],
      ),
    ]);
    const totales = {
      costoTotal:   detalle.reduce((s, r) => s + Number(r.total ?? 0), 0),
      galonesTotal: detalle.reduce((s, r) => s + Number(r.galones ?? 0), 0),
      registros:    detalle.length,
    };
    return { detalle, porVehiculo, totales };
  }

  async reporteMantenimiento(empresaId: number, params: { desde: string; hasta: string }) {
    const [detalle, porVehiculo] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT m.fecha, m.tipo, m.descripcion, m.costo, m.proveedor, m.estado,
                v.placa AS "vehiculoPlaca", v.marca||' '||v.modelo AS "vehiculoDescripcion"
           FROM tr_mantenimiento m
           LEFT JOIN tr_vehiculos v ON v.id = m."vehiculoId"
          WHERE m."empresaId"=$1 AND m.fecha BETWEEN $2 AND $3
          ORDER BY m.fecha DESC`,
        [empresaId, params.desde, params.hasta],
      ),
      this.ds.query<any[]>(
        `SELECT v.placa, v.marca||' '||v.modelo AS vehiculo,
                COALESCE(SUM(m.costo),0) AS costoTotal,
                COUNT(*) AS mantenimientos,
                COUNT(*) FILTER (WHERE m.tipo='preventivo') AS preventivos,
                COUNT(*) FILTER (WHERE m.tipo='correctivo') AS correctivos,
                COUNT(*) FILTER (WHERE m.tipo='emergencia') AS emergencias
           FROM tr_mantenimiento m
           JOIN tr_vehiculos v ON v.id = m."vehiculoId"
          WHERE m."empresaId"=$1 AND m.fecha BETWEEN $2 AND $3
          GROUP BY v.id, v.placa, v.marca, v.modelo
          ORDER BY costoTotal DESC`,
        [empresaId, params.desde, params.hasta],
      ),
    ]);
    const totales = {
      costoTotal:     detalle.reduce((s, r) => s + Number(r.costo ?? 0), 0),
      mantenimientos: detalle.length,
    };
    return { detalle, porVehiculo, totales };
  }
}
