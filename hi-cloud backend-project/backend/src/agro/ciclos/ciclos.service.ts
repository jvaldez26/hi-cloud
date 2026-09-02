import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../../tenant/tenant.service';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class CiclosService {
  private readonly logger = new Logger(CiclosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT c.*, p.nombre AS "parcelaNombre", cu.nombre AS "cultivoNombre", cu.variedad AS "cultivoVariedad"
         FROM ag_ciclos c
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE c.id=$1 AND c."empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Ciclo #${id} no encontrado`);
    return row;
  }

  /**
   * Valida que un cicloId del body (a) pertenezca a la empresa del CLS —impide que
   * un tenant cuelgue filas del ciclo de otro (IDs SERIAL adivinables)— y (b) NO esté
   * cerrado. A4: un ciclo cerrado es inmutable, no admite nuevas labores/aplicaciones/
   * cosechas ni edición de sus labores (recalcularían costos de un ciclo ya cerrado).
   * Reutilizable desde cualquier create/update que reciba cicloId.
   */
  /**
   * M2: comprueba que un id recibido en el body pertenezca a esta empresa.
   * El nombre de tabla nunca viene del usuario — solo se llama con literales.
   */
  private async assertPertenece(
    tabla: 'ag_parcelas' | 'ag_cultivos' | 'ag_fincas',
    id: unknown,
    empresaId: number,
    etiqueta: string,
  ): Promise<void> {
    if (id === undefined || id === null || id === '') return;   // campo opcional
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) {
      throw new BadRequestException(`${etiqueta} inválida`);
    }
    const [row] = await this.ds.query<any[]>(
      `SELECT 1 FROM ${tabla} WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [num, empresaId],
    );
    if (!row) throw new NotFoundException(`${etiqueta} #${num} no encontrada`);
  }

  async assertCicloEditable(cicloId: number | undefined | null, empresaId: number): Promise<void> {
    if (cicloId == null) throw new NotFoundException('Ciclo no especificado');
    const [row] = await this.ds.query<any[]>(
      `SELECT estado FROM ag_ciclos WHERE id=$1 AND "empresaId"=$2`, [cicloId, empresaId],
    );
    if (!row) throw new NotFoundException(`Ciclo #${cicloId} no encontrado`);
    if (row.estado === 'cerrado') {
      throw new ConflictException(`El ciclo #${cicloId} está cerrado y no admite modificaciones.`);
    }
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`c."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conds.push(`c.estado=$${idx++}`); args.push(params.estado); }
    if (params.parcelaId) { conds.push(`c."parcelaId"=$${idx++}`); args.push(Number(params.parcelaId)); }
    if (params.cultivoId) { conds.push(`c."cultivoId"=$${idx++}`); args.push(Number(params.cultivoId)); }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM ag_ciclos c WHERE ${where}`, args);
    const data = await this.ds.query(
      `SELECT c.*, p.nombre AS "parcelaNombre", cu.nombre AS "cultivoNombre",
              cu.variedad AS "cultivoVariedad",
              CURRENT_DATE - c."fechaSiembra"::date AS "diasTranscurridos",
              c."fechaEstimadaCosecha"::date - CURRENT_DATE AS "diasParaCosecha"
         FROM ag_ciclos c
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=c."cultivoId"
        WHERE ${where}
        ORDER BY c."createdAt" DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    const ciclo = await this.orFail(empresaId, id);
    const [labores, aplicaciones, cosechas] = await Promise.all([
      this.ds.query<any[]>(`SELECT * FROM ag_labores WHERE "cicloId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`, [id, empresaId]),
      this.ds.query<any[]>(`SELECT * FROM ag_aplicaciones_insumo WHERE "cicloId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`, [id, empresaId]),
      this.ds.query<any[]>(`SELECT * FROM ag_cosechas WHERE "cicloId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`, [id, empresaId]),
    ]);
    return { ...ciclo, labores, aplicaciones, cosechas };
  }

  async create(empresaId: number, data: any) {
    // M2: parcelaId y cultivoId llegan del body. Sin comprobarlos se podía crear
    // un ciclo apuntando a la parcela de otra empresa, y los listados —que hacen
    // JOIN con ag_parcelas y ag_cultivos— acababan mostrando sus nombres.
    await this.assertPertenece('ag_parcelas', data.parcelaId, empresaId, 'Parcela');
    await this.assertPertenece('ag_cultivos', data.cultivoId, empresaId, 'Cultivo');

    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'CIC'],
    );
    const numero = `CIC-${String(seq.num).padStart(4, '0')}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_ciclos ("empresaId",numero,"parcelaId","cultivoId","fechaSiembra",
         "fechaEstimadaCosecha","areaSembrada","cantidadSemilla","unidadSemilla",
         "rendimientoEstimado","unidadCosecha","costoSemilla",estado,notas,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, numero, data.parcelaId, data.cultivoId, data.fechaSiembra,
       data.fechaEstimadaCosecha ?? null, data.areaSembrada ?? null,
       data.cantidadSemilla ?? null, data.unidadSemilla ?? null,
       data.rendimientoEstimado ?? null, data.unidadCosecha ?? null,
       data.costoSemilla ?? 0, data.estado ?? 'sembrado', data.notas ?? null,
       this.tenantSvc.getUserId()],
    );
    // Marcar parcela como sembrada
    await this.ds.query(
      `UPDATE ag_parcelas SET estado='sembrada', "cultivoActual"=(SELECT nombre FROM ag_cultivos WHERE id=$1)
        WHERE id=$2 AND "empresaId"=$3`,
      [data.cultivoId, data.parcelaId, empresaId],
    );
    return row;
  }

  async update(empresaId: number, id: number, data: any) {
    const ciclo = await this.orFail(empresaId, id);
    // A4: un ciclo cerrado es inmutable — no se edita ni se reabre.
    if (ciclo.estado === 'cerrado') {
      throw new ConflictException('El ciclo está cerrado y no admite modificaciones.');
    }
    // El cierre debe pasar por la acción "cerrar" (recalcula costos y libera la parcela),
    // no por una edición directa del estado.
    if (data.estado === 'cerrado') {
      throw new BadRequestException('Para cerrar el ciclo usa la acción "cerrar", no la edición.');
    }
    const allowed = ['fechaSiembra','fechaEstimadaCosecha','areaSembrada','cantidadSemilla','unidadSemilla',
      'rendimientoEstimado','unidadCosecha','costoSemilla','costoOtros','ingresoVentas','estado','notas'];
    const sets: string[] = [`"updatedAt"=NOW()`];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    sets.push(`"actualizadoPor"=$${vals.length + 1}`); vals.push(this.tenantSvc.getUserId());
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ag_ciclos SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *
       ) SELECT * FROM fila`, vals,
    );
    return row;
  }

  async cerrar(empresaId: number, id: number, data: any) {
    const ciclo = await this.orFail(empresaId, id);   // 404 si no existe / otra empresa
    // A4: cierre ATÓMICO. El UPDATE condicionado (estado <> 'cerrado') gana la carrera;
    // un 2º intento (doble-click / concurrencia) afecta 0 filas → 409, sin recalcular
    // ni re-liberar la parcela. Reemplaza el read-then-write anterior.
    const cerrado = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE ag_ciclos SET estado='cerrado', "fechaCosechaReal"=$3, "ingresoVentas"=$4,
           "actualizadoPor"=$5, "updatedAt"=NOW()
          WHERE id=$1 AND "empresaId"=$2 AND estado <> 'cerrado' RETURNING *
       ) SELECT * FROM fila`,
      // M4: era new Date().toISOString(), la fecha UTC. Entre las 8 de la noche
      // y medianoche en RD eso devuelve el día siguiente, así que un ciclo
      // cerrado por la noche quedaba fechado mañana.
      [id, empresaId, data.fechaCosechaReal ?? fechaHoyRD(), data.ingresoVentas ?? 0, this.tenantSvc.getUserId()],
    );
    if (!cerrado.length) throw new ConflictException('El ciclo ya está cerrado');
    // Solo el ganador del cierre recalcula costos finales y libera la parcela.
    await this.recalcularCostos(id, empresaId);
    await this.ds.query(
      `UPDATE ag_parcelas SET estado='disponible', "cultivoActual"=null WHERE id=$1 AND "empresaId"=$2`,
      [ciclo.parcelaId, empresaId],
    );
    // Re-leer para devolver el ciclo con los costos ya recalculados.
    const [final] = await this.ds.query<any[]>(
      `SELECT * FROM ag_ciclos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    return final ?? cerrado[0];
  }

  async getCostos(empresaId: number, id: number) {
    const ciclo = await this.orFail(empresaId, id);
    return {
      costoSemilla:    Number(ciclo.costoSemilla),
      costoInsumos:    Number(ciclo.costoInsumos),
      costoManoObra:   Number(ciclo.costoManoObra),
      costoMaquinaria: Number(ciclo.costoMaquinaria),
      costoOtros:      Number(ciclo.costoOtros),
      costoTotal:      Number(ciclo.costoTotal),
      ingresoVentas:   Number(ciclo.ingresoVentas),
    };
  }

  async getRentabilidad(empresaId: number, id: number) {
    const ciclo = await this.orFail(empresaId, id);
    const costo   = Number(ciclo.costoTotal);
    const ingreso = Number(ciclo.ingresoVentas);
    const cosechado = Number(ciclo.cantidadCosechada) || 0;
    const rentabilidad = ingreso - costo;
    return {
      ciclo: ciclo.numero,
      costoTotal: costo,
      ingresoVentas: ingreso,
      rentabilidad,
      margenPct: ingreso > 0 ? Math.round((rentabilidad / ingreso) * 100 * 100) / 100 : 0,
      costoPorUnidad: cosechado > 0 ? Math.round((costo / cosechado) * 100) / 100 : 0,
      cantidadCosechada: cosechado,
      unidadCosecha: ciclo.unidadCosecha,
    };
  }

  async recalcularCostos(cicloId: number, empresaId: number) {
    const [ciclo] = await this.ds.query<any[]>(
      `SELECT "costoSemilla" FROM ag_ciclos WHERE id=$1 AND "empresaId"=$2`, [cicloId, empresaId],
    );
    if (!ciclo) return;

    const [lab] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM("costoManoObra"),0) AS mano, COALESCE(SUM("costoMaquinaria"),0) AS maq
         FROM ag_labores WHERE "cicloId"=$1`, [cicloId],
    );
    const [apl] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM("costoTotal"),0) AS ins FROM ag_aplicaciones_insumo WHERE "cicloId"=$1`, [cicloId],
    );
    const [cos] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM("costoManoObra"),0) AS mc, COALESCE(SUM(cantidad),0) AS cantidad
         FROM ag_cosechas WHERE "cicloId"=$1`, [cicloId],
    );

    const costoManoObra   = Number(lab.mano) + Number(cos.mc);
    const costoMaquinaria = Number(lab.maq);
    const costoInsumos    = Number(apl.ins);
    const costoSemilla    = Number(ciclo.costoSemilla);
    const costoTotal      = costoManoObra + costoMaquinaria + costoInsumos + costoSemilla;

    await this.ds.query(
      `UPDATE ag_ciclos SET "costoInsumos"=$1,"costoManoObra"=$2,"costoMaquinaria"=$3,
         "costoTotal"=$4,"cantidadCosechada"=$5,"updatedAt"=NOW()
        WHERE id=$6`,
      [costoInsumos, costoManoObra, costoMaquinaria, costoTotal, Number(cos.cantidad), cicloId],
    );
  }

  // ── Labores ─────────────────────────────────────────────────────────────
  async findLabores(empresaId: number, cicloId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ag_labores WHERE "cicloId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [cicloId, empresaId],
    );
  }

  async createLabor(empresaId: number, data: any) {
    await this.assertCicloEditable(data.cicloId, empresaId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_labores ("empresaId","cicloId","parcelaId",tipo,descripcion,fecha,
         "cantidadTrabajadores","horasTrabajadas","costoManoObra","usoMaquinaria","costoMaquinaria",
         estado,responsable,notas,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, data.cicloId, data.parcelaId ?? null, data.tipo, data.descripcion ?? null,
       data.fecha, data.cantidadTrabajadores ?? null, data.horasTrabajadas ?? null,
       data.costoManoObra ?? 0, data.usoMaquinaria ?? null, data.costoMaquinaria ?? 0,
       data.estado ?? 'completada', data.responsable ?? null, data.notas ?? null,
       this.tenantSvc.getUserId()],
    );
    await this.recalcularCostos(data.cicloId, empresaId);
    return row;
  }

  async updateLabor(empresaId: number, id: number, data: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id, "cicloId" FROM ag_labores WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!exists) throw new NotFoundException(`Labor #${id} no encontrada`);
    // A4: no editar labores de un ciclo cerrado (recalcularían sus costos).
    await this.assertCicloEditable(exists.cicloId, empresaId);
    const allowed = ['tipo','descripcion','fecha','cantidadTrabajadores','horasTrabajadas',
      'costoManoObra','usoMaquinaria','costoMaquinaria','estado','responsable','notas'];
    const sets: string[] = [];
    const vals: any[] = [id, empresaId];
    allowed.forEach(f => {
      if (data[f] !== undefined) { sets.push(`"${f}"=$${vals.length + 1}`); vals.push(data[f]); }
    });
    if (!sets.length) return exists;
    sets.push(`"actualizadoPor"=$${vals.length + 1}`); vals.push(this.tenantSvc.getUserId());
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ag_labores SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *
       ) SELECT * FROM fila`, vals,
    );
    await this.recalcularCostos(exists.cicloId, empresaId);
    return row;
  }

  // ── Aplicaciones de insumos ─────────────────────────────────────────────
  async findAplicaciones(empresaId: number, cicloId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM ag_aplicaciones_insumo WHERE "cicloId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [cicloId, empresaId],
    );
  }

  async createAplicacion(empresaId: number, data: any) {
    await this.assertCicloEditable(data.cicloId, empresaId);

    // M1: si la aplicación referencia un insumo del inventario, debe ser de la
    // empresa del CLS (evita descontar stock del insumo de otro tenant vía body).
    const insumoId: number | null = data.insumoId ?? null;
    if (insumoId != null) {
      const [ins] = await this.ds.query<any[]>(
        `SELECT id, nombre, unidad, "costoUnitario" FROM ag_insumos WHERE id=$1 AND "empresaId"=$2`,
        [insumoId, empresaId],
      );
      if (!ins) throw new NotFoundException(`Insumo #${insumoId} no encontrado`);
      // Fallback: si el body no trae nombre/unidad, tomarlos del insumo maestro.
      data.insumoNombre = data.insumoNombre ?? ins.nombre;
      data.unidad       = data.unidad ?? ins.unidad;
      // M3: el costo sale del maestro salvo que se indique expresamente otro.
      // Antes se tomaba solo del body: si el formulario no lo enviaba, la
      // aplicación quedaba costeada en null y el ciclo subvaluado.
      data.costoUnitario = data.costoUnitario ?? ins.costoUnitario;
    }

    const costoTotal = data.costoTotal ?? (data.costoUnitario && data.cantidad
      ? Math.round(Number(data.costoUnitario) * Number(data.cantidad) * 100) / 100 : null);

    // INSERT de la aplicación + descuento de stock en UNA transacción: si algo
    // falla, no queda ni la aplicación ni un stock descontado a medias.
    const row = await this.ds.transaction(async (manager) => {
      const [inserted] = await manager.query<any[]>(
        `INSERT INTO ag_aplicaciones_insumo ("empresaId","cicloId","laborId","productoId","insumoId","insumoNombre",
           tipo,cantidad,unidad,"costoUnitario","costoTotal",fecha,"dosisPorArea","metodoAplicacion",
           "loteInsumo","periodoCarencia",responsable,notas,"creadoPor")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [empresaId, data.cicloId, data.laborId ?? null, data.productoId ?? null, insumoId,
         data.insumoNombre, data.tipo ?? null, data.cantidad, data.unidad ?? null,
         data.costoUnitario ?? null, costoTotal, data.fecha, data.dosisPorArea ?? null,
         data.metodoAplicacion ?? null, data.loteInsumo ?? null, data.periodoCarencia ?? null,
         data.responsable ?? null, data.notas ?? null,
         this.tenantSvc.getUserId()],
      );
      // Descuenta stock solo si hay insumo del inventario referenciado.
      if (insumoId != null) {
        await manager.query(
          `UPDATE ag_insumos SET "stockActual" = "stockActual" - $1 WHERE id=$2 AND "empresaId"=$3`,
          [Number(data.cantidad), insumoId, empresaId],
        );
      }
      return inserted;
    });

    await this.recalcularCostos(data.cicloId, empresaId);
    return row;
  }
}
