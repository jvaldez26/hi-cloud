import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

@Injectable()
export class RestauranteService {
  private readonly logger = new Logger(RestauranteService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  // ── DASHBOARD ────────────────────────────────────────────────────────────

  async dashboard() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = new Date().toISOString().split('T')[0];

    const [mesasStats, comandasAbiertas, deliveryActivo, reservHoy, ventasHoy, platosMasVendidos, ventasPorHora] =
      await Promise.all([
        this.ds.query<any[]>(
          `SELECT estado, COUNT(*)::int AS total FROM rs_mesas WHERE "empresaId"=$1 AND "isActive"=true GROUP BY estado`,
          [empresaId],
        ),
        this.ds.query<any[]>(
          `SELECT c.*, m.numero AS "mesaNumero",
                  EXTRACT(EPOCH FROM (NOW()-c."fechaApertura"))/60 AS "minutos"
           FROM rs_comandas c JOIN rs_mesas m ON m.id=c."mesaId"
           WHERE c."empresaId"=$1 AND c.estado IN ('abierta','en_cocina','lista')
           ORDER BY c."fechaApertura" ASC`,
          [empresaId],
        ),
        this.ds.query<any[]>(
          `SELECT COUNT(*)::int AS total FROM rs_pedidos_delivery WHERE "empresaId"=$1 AND estado IN ('recibido','confirmado','en_cocina','en_camino')`,
          [empresaId],
        ),
        this.ds.query<any[]>(
          `SELECT COUNT(*)::int AS total FROM rs_reservaciones WHERE "empresaId"=$1 AND fecha=$2 AND estado NOT IN ('cancelada','no_asistio')`,
          [empresaId, hoy],
        ),
        this.ds.query<any[]>(
          `SELECT COALESCE(SUM(total),0)::numeric AS total, COUNT(*)::int AS cantidad
           FROM rs_comandas WHERE "empresaId"=$1 AND estado='cobrada' AND "fechaCierre"::date=$2`,
          [empresaId, hoy],
        ),
        this.ds.query<any[]>(
          `SELECT mi.nombre, SUM(ci.cantidad)::int AS vendidos, SUM(ci.total)::numeric AS ingresos
           FROM rs_comanda_items ci
           JOIN rs_menu_items mi ON mi.id=ci."menuItemId"
           JOIN rs_comandas c ON c.id=ci."comandaId"
           WHERE c."empresaId"=$1 AND c."fechaApertura"::date=$2 AND ci.cancelado=false
           GROUP BY mi.id, mi.nombre ORDER BY vendidos DESC LIMIT 8`,
          [empresaId, hoy],
        ),
        this.ds.query<any[]>(
          `SELECT EXTRACT(HOUR FROM "fechaCierre")::int AS hora, COUNT(*)::int AS comandas, COALESCE(SUM(total),0)::numeric AS ventas
           FROM rs_comandas WHERE "empresaId"=$1 AND estado='cobrada' AND "fechaCierre"::date=$2
           GROUP BY hora ORDER BY hora`,
          [empresaId, hoy],
        ),
      ]);

    const mesasMap = mesasStats.reduce((acc: any, r: any) => { acc[r.estado] = r.total; return acc; }, {});
    return {
      mesas: {
        total: Object.values(mesasMap).reduce((a: any, b: any) => a + b, 0),
        ocupadas: mesasMap.ocupada ?? 0,
        disponibles: mesasMap.disponible ?? 0,
        reservadas: mesasMap.reservada ?? 0,
        limpieza: mesasMap.limpieza ?? 0,
      },
      comandasAbiertas,
      deliveryActivo: deliveryActivo[0]?.total ?? 0,
      reservacionesHoy: reservHoy[0]?.total ?? 0,
      ventasHoy: { total: ventasHoy[0]?.total ?? 0, cantidad: ventasHoy[0]?.cantidad ?? 0 },
      platosMasVendidos,
      ventasPorHora,
    };
  }

  // ── ÁREAS ────────────────────────────────────────────────────────────────

  async listarAreas() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT a.*, COUNT(m.id)::int AS "numMesas"
       FROM rs_areas a LEFT JOIN rs_mesas m ON m."areaId"=a.id AND m."isActive"=true
       WHERE a."empresaId"=$1 AND a."isActive"=true
       GROUP BY a.id ORDER BY a.orden, a.nombre`,
      [empresaId],
    );
  }

  async crearArea(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [area] = await this.ds.query<any[]>(
      `INSERT INTO rs_areas ("empresaId", nombre, descripcion, "capacidadTotal", orden)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, dto.nombre, dto.descripcion ?? null, dto.capacidadTotal ?? null, dto.orden ?? 0],
    );
    return area;
  }

  async actualizarArea(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [id, empresaId];
    if (dto.nombre !== undefined)         { params.push(dto.nombre);          sets.push(`nombre=$${params.length}`); }
    if (dto.descripcion !== undefined)    { params.push(dto.descripcion);     sets.push(`descripcion=$${params.length}`); }
    if (dto.capacidadTotal !== undefined) { params.push(dto.capacidadTotal);  sets.push(`"capacidadTotal"=$${params.length}`); }
    if (dto.orden !== undefined)          { params.push(dto.orden);           sets.push(`orden=$${params.length}`); }
    if (dto.isActive !== undefined)       { params.push(dto.isActive);        sets.push(`"isActive"=$${params.length}`); }
    if (!sets.length) return this.ds.query(`SELECT * FROM rs_areas WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    const [area] = await this.ds.query<any[]>(
      `UPDATE rs_areas SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, params,
    );
    return area;
  }

  // ── MESAS ────────────────────────────────────────────────────────────────

  async listarMesas(areaId?: number, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE m."empresaId"=$1 AND m."isActive"=true`;
    if (areaId) { params.push(areaId); where += ` AND m."areaId"=$${params.length}`; }
    if (estado) { params.push(estado); where += ` AND m.estado=$${params.length}`; }
    return this.ds.query<any[]>(
      `SELECT m.*, a.nombre AS "areaNombre",
              c.numero AS "comandaNumero", c."fechaApertura",
              EXTRACT(EPOCH FROM (NOW()-c."fechaApertura"))/60 AS "minutosOcupada"
       FROM rs_mesas m
       LEFT JOIN rs_areas a ON a.id=m."areaId"
       LEFT JOIN rs_comandas c ON c.id=m."comandaActualId"
       ${where} ORDER BY a.orden, m.numero`,
      params,
    );
  }

  async mapaMesas() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const areas = await this.listarAreas();
    const mesas = await this.listarMesas();
    return areas.map((a: any) => ({
      ...a,
      mesas: mesas.filter((m: any) => m.areaId === a.id),
    }));
  }

  async crearMesa(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [mesa] = await this.ds.query<any[]>(
      `INSERT INTO rs_mesas ("empresaId","areaId",numero,nombre,capacidad,"posicionX","posicionY",forma)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, dto.areaId ?? null, dto.numero, dto.nombre ?? null,
       dto.capacidad ?? 4, dto.posicionX ?? 0, dto.posicionY ?? 0, dto.forma ?? 'cuadrada'],
    );
    return mesa;
  }

  async actualizarMesa(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [id, empresaId];
    const fields: Record<string, string> = {
      nombre: 'nombre', numero: 'numero', capacidad: 'capacidad',
      estado: 'estado', posicionX: '"posicionX"', posicionY: '"posicionY"',
      forma: 'forma', isActive: '"isActive"', areaId: '"areaId"',
    };
    for (const [k, col] of Object.entries(fields)) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return;
    const [mesa] = await this.ds.query<any[]>(
      `UPDATE rs_mesas SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, params,
    );
    return mesa;
  }

  // ── CATEGORÍAS MENÚ ──────────────────────────────────────────────────────

  async listarCategorias() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT c.*, COUNT(m.id)::int AS "numItems"
       FROM rs_categorias_menu c LEFT JOIN rs_menu_items m ON m."categoriaId"=c.id AND m."isActive"=true
       WHERE c."empresaId"=$1 AND c."isActive"=true GROUP BY c.id ORDER BY c.orden, c.nombre`,
      [empresaId],
    );
  }

  async crearCategoria(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [cat] = await this.ds.query<any[]>(
      `INSERT INTO rs_categorias_menu ("empresaId",nombre,descripcion,icono,color,orden,"disponibleDesde","disponibleHasta")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, dto.nombre, dto.descripcion ?? null, dto.icono ?? null, dto.color ?? null,
       dto.orden ?? 0, dto.disponibleDesde ?? null, dto.disponibleHasta ?? null],
    );
    return cat;
  }

  async actualizarCategoria(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = []; const params: any[] = [id, empresaId];
    for (const [k, col] of Object.entries({ nombre: 'nombre', descripcion: 'descripcion', icono: 'icono', color: 'color', orden: 'orden', isActive: '"isActive"' })) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return;
    const [cat] = await this.ds.query<any[]>(`UPDATE rs_categorias_menu SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, params);
    return cat;
  }

  // ── MENÚ ITEMS ───────────────────────────────────────────────────────────

  async listarMenu(categoriaId?: number, disponible?: boolean, search?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE m."empresaId"=$1 AND m."isActive"=true`;
    if (categoriaId) { params.push(categoriaId); where += ` AND m."categoriaId"=$${params.length}`; }
    if (disponible !== undefined) { params.push(disponible); where += ` AND m.disponible=$${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (m.nombre ILIKE $${params.length} OR m.codigo ILIKE $${params.length})`; }
    return this.ds.query<any[]>(
      `SELECT m.*, c.nombre AS "categoriaNombre",
              COALESCE(
                (SELECT json_agg(mod ORDER BY mod.id) FROM rs_modificadores mod WHERE mod."menuItemId"=m.id AND mod."isActive"=true),
                '[]'::json
              ) AS modificadores
       FROM rs_menu_items m LEFT JOIN rs_categorias_menu c ON c.id=m."categoriaId"
       ${where} ORDER BY c.orden, m.nombre`,
      params,
    );
  }

  async obtenerMenuItem(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [item] = await this.ds.query<any[]>(
      `SELECT m.*, c.nombre AS "categoriaNombre" FROM rs_menu_items m
       LEFT JOIN rs_categorias_menu c ON c.id=m."categoriaId"
       WHERE m.id=$1 AND m."empresaId"=$2`,
      [id, empresaId],
    );
    if (!item) throw new NotFoundException('Ítem del menú no encontrado');
    return item;
  }

  async crearMenuItem(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [item] = await this.ds.query<any[]>(
      `INSERT INTO rs_menu_items
        ("empresaId","categoriaId",codigo,nombre,descripcion,precio,"precioEspecial",costo,
         "tiempoPreparacionMin",disponible,"disponibleParaDelivery","disponibleParaLlevar",
         "controlStock","productoId",calorias,alergenos,"esVegetariano","esVegano","esGlutenFree","permiteModificaciones")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [empresaId, dto.categoriaId ?? null, dto.codigo ?? null, dto.nombre, dto.descripcion ?? null,
       dto.precio, dto.precioEspecial ?? null, dto.costo ?? null, dto.tiempoPreparacionMin ?? 15,
       dto.disponible ?? true, dto.disponibleParaDelivery ?? true, dto.disponibleParaLlevar ?? true,
       dto.controlStock ?? false, dto.productoId ?? null, dto.calorias ?? null, dto.alergenos ?? null,
       dto.esVegetariano ?? false, dto.esVegano ?? false, dto.esGlutenFree ?? false, dto.permiteModificaciones ?? true],
    );
    return item;
  }

  async actualizarMenuItem(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cols: Record<string, string> = {
      nombre: 'nombre', descripcion: 'descripcion', precio: 'precio', precioEspecial: '"precioEspecial"',
      costo: 'costo', categoriaId: '"categoriaId"', disponible: 'disponible', isActive: '"isActive"',
      tiempoPreparacionMin: '"tiempoPreparacionMin"', disponibleParaDelivery: '"disponibleParaDelivery"',
      disponibleParaLlevar: '"disponibleParaLlevar"', controlStock: '"controlStock"',
      alergenos: 'alergenos', esVegetariano: '"esVegetariano"', esVegano: '"esVegano"', esGlutenFree: '"esGlutenFree"',
    };
    const sets: string[] = []; const params: any[] = [id, empresaId];
    for (const [k, col] of Object.entries(cols)) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return this.obtenerMenuItem(id);
    const [item] = await this.ds.query<any[]>(
      `UPDATE rs_menu_items SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, params,
    );
    return item;
  }

  async toggleDisponibilidad(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [item] = await this.ds.query<any[]>(
      `UPDATE rs_menu_items SET disponible = NOT disponible WHERE id=$1 AND "empresaId"=$2 RETURNING id, disponible`,
      [id, empresaId],
    );
    return item;
  }

  // ── MODIFICADORES ─────────────────────────────────────────────────────────

  async listarModificadores(menuItemId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM rs_modificadores WHERE "menuItemId"=$1 AND "empresaId"=$2 AND "isActive"=true ORDER BY id`,
      [menuItemId, empresaId],
    );
  }

  async crearModificador(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [mod] = await this.ds.query<any[]>(
      `INSERT INTO rs_modificadores ("empresaId","menuItemId",nombre,tipo,opciones) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, dto.menuItemId, dto.nombre, dto.tipo ?? 'opcional', dto.opciones ?? null],
    );
    return mod;
  }

  // ── RESERVACIONES ─────────────────────────────────────────────────────────

  async listarReservaciones(fecha?: string, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE r."empresaId"=$1`;
    if (fecha) { params.push(fecha); where += ` AND r.fecha=$${params.length}`; }
    if (estado) { params.push(estado); where += ` AND r.estado=$${params.length}`; }
    return this.ds.query<any[]>(
      `SELECT r.*, m.numero AS "mesaNumero", a.nombre AS "areaNombre"
       FROM rs_reservaciones r
       LEFT JOIN rs_mesas m ON m.id=r."mesaId"
       LEFT JOIN rs_areas a ON a.id=m."areaId"
       ${where} ORDER BY r.fecha, r.hora`,
      params,
    );
  }

  async crearReservacion(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'RES-', 1, empresaId);
    const [res] = await this.ds.query<any[]>(
      `INSERT INTO rs_reservaciones
        ("empresaId",numero,"clienteNombre","clienteTelefono","clienteEmail","clienteId",
         fecha,hora,"numPersonas","mesaId","ocasionEspecial","peticionesEspeciales",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, numero, dto.clienteNombre, dto.clienteTelefono ?? null, dto.clienteEmail ?? null,
       dto.clienteId ?? null, dto.fecha, dto.hora, dto.numPersonas, dto.mesaId ?? null,
       dto.ocasionEspecial ?? null, dto.peticionesEspeciales ?? null, dto.notas ?? null],
    );
    if (dto.mesaId) {
      await this.ds.query(`UPDATE rs_mesas SET estado='reservada' WHERE id=$1 AND "empresaId"=$2`, [dto.mesaId, empresaId]);
    }
    return res;
  }

  async actualizarReservacion(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cols: Record<string, string> = {
      estado: 'estado', notas: 'notas', mesaId: '"mesaId"',
      clienteNombre: '"clienteNombre"', clienteTelefono: '"clienteTelefono"',
    };
    const sets: string[] = []; const params: any[] = [id, empresaId];
    for (const [k, col] of Object.entries(cols)) {
      if (dto[k] !== undefined) { params.push(dto[k]); sets.push(`${col}=$${params.length}`); }
    }
    if (!sets.length) return;
    const [res] = await this.ds.query<any[]>(
      `UPDATE rs_reservaciones SET ${sets.join(',')} WHERE id=$1 AND "empresaId"=$2 RETURNING *`, params,
    );
    return res;
  }

  async sentarReservacion(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [res] = await this.ds.query<any[]>(
      `UPDATE rs_reservaciones SET estado='sentada' WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [id, empresaId],
    );
    return res;
  }

  // ── COMANDAS ──────────────────────────────────────────────────────────────

  async listarComandas(estado?: string, mesaId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId"=$1`;
    if (estado) { params.push(estado); where += ` AND c.estado=$${params.length}`; }
    if (mesaId) { params.push(mesaId); where += ` AND c."mesaId"=$${params.length}`; }
    return this.ds.query<any[]>(
      `SELECT c.*, m.numero AS "mesaNumero", a.nombre AS "areaNombre",
              EXTRACT(EPOCH FROM (NOW()-c."fechaApertura"))/60 AS "minutos",
              COALESCE(
                (SELECT json_agg(ci ORDER BY ci.id) FROM (
                  SELECT i.*, mi.nombre AS "itemNombre" FROM rs_comanda_items i
                  JOIN rs_menu_items mi ON mi.id=i."menuItemId"
                  WHERE i."comandaId"=c.id AND i.cancelado=false
                ) ci),
                '[]'::json
              ) AS items
       FROM rs_comandas c
       JOIN rs_mesas m ON m.id=c."mesaId"
       LEFT JOIN rs_areas a ON a.id=m."areaId"
       ${where} ORDER BY c."fechaApertura" DESC LIMIT 100`,
      params,
    );
  }

  async obtenerComanda(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [comanda] = await this.ds.query<any[]>(
      `SELECT c.*, m.numero AS "mesaNumero", a.nombre AS "areaNombre"
       FROM rs_comandas c JOIN rs_mesas m ON m.id=c."mesaId"
       LEFT JOIN rs_areas a ON a.id=m."areaId"
       WHERE c.id=$1 AND c."empresaId"=$2`,
      [id, empresaId],
    );
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    const items = await this.ds.query<any[]>(
      `SELECT ci.*, mi.nombre AS "itemNombre", mi.precio AS "precioBase"
       FROM rs_comanda_items ci JOIN rs_menu_items mi ON mi.id=ci."menuItemId"
       WHERE ci."comandaId"=$1 AND ci."empresaId"=$2
       ORDER BY ci."numeroRonda", ci."createdAt"`,
      [id, empresaId],
    );
    return { ...comanda, items };
  }

  async abrirComanda(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    // Validar mesa disponible o reservada
    const [mesa] = await this.ds.query<any[]>(
      `SELECT * FROM rs_mesas WHERE id=$1 AND "empresaId"=$2`,
      [dto.mesaId, empresaId],
    );
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    if (!['disponible', 'reservada'].includes(mesa.estado)) {
      throw new BadRequestException(`Mesa en estado '${mesa.estado}' — no se puede abrir comanda`);
    }
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'COM-', 1, empresaId);
    const [comanda] = await this.ds.query<any[]>(
      `INSERT INTO rs_comandas ("empresaId",numero,"mesaId","meseroId","meseroNombre","clienteId","numPersonas",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [empresaId, numero, dto.mesaId, dto.meseroId ?? null, dto.meseroNombre ?? null,
       dto.clienteId ?? null, dto.numPersonas ?? 1, dto.notas ?? null],
    );
    await this.ds.query(
      `UPDATE rs_mesas SET estado='ocupada', "comandaActualId"=$1 WHERE id=$2 AND "empresaId"=$3`,
      [comanda.id, dto.mesaId, empresaId],
    );
    return comanda;
  }

  async agregarItem(comandaId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [comanda] = await this.ds.query<any[]>(
      `SELECT * FROM rs_comandas WHERE id=$1 AND "empresaId"=$2`,
      [comandaId, empresaId],
    );
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    if (comanda.estado === 'cobrada') throw new BadRequestException('Comanda ya cobrada');
    const [menuItem] = await this.ds.query<any[]>(
      `SELECT * FROM rs_menu_items WHERE id=$1 AND "empresaId"=$2`,
      [dto.menuItemId, empresaId],
    );
    if (!menuItem) throw new NotFoundException('Ítem no encontrado');
    const precioUnit = Number(dto.precioUnitario ?? menuItem.precio);
    const total = precioUnit * Number(dto.cantidad ?? 1) - Number(dto.descuento ?? 0);
    const [item] = await this.ds.query<any[]>(
      `INSERT INTO rs_comanda_items ("empresaId","comandaId","menuItemId",cantidad,"precioUnitario",descuento,total,modificaciones,"notasEspeciales","numeroRonda")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [empresaId, comandaId, dto.menuItemId, dto.cantidad ?? 1, precioUnit,
       dto.descuento ?? 0, total, dto.modificaciones ?? null, dto.notasEspeciales ?? null, dto.numeroRonda ?? 1],
    );
    await this._recalcularTotales(comandaId, empresaId);
    return item;
  }

  async actualizarItem(comandaId: number, itemId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = []; const params: any[] = [itemId, comandaId, empresaId];
    if (dto.cantidad !== undefined) { params.push(dto.cantidad); sets.push(`cantidad=$${params.length}`); }
    if (dto.notasEspeciales !== undefined) { params.push(dto.notasEspeciales); sets.push(`"notasEspeciales"=$${params.length}`); }
    if (dto.modificaciones !== undefined) { params.push(dto.modificaciones); sets.push(`modificaciones=$${params.length}`); }
    if (sets.length) {
      await this.ds.query(
        `UPDATE rs_comanda_items SET ${sets.join(',')} WHERE id=$1 AND "comandaId"=$2 AND "empresaId"=$3`, params,
      );
      // Recalcular total del item
      await this.ds.query(
        `UPDATE rs_comanda_items SET total="precioUnitario"*cantidad-descuento WHERE id=$1`, [itemId],
      );
      await this._recalcularTotales(comandaId, empresaId);
    }
    return this.ds.query(`SELECT * FROM rs_comanda_items WHERE id=$1`, [itemId]);
  }

  async cancelarItem(comandaId: number, itemId: number, motivo?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ds.query(
      `UPDATE rs_comanda_items SET cancelado=true, "motivoCancelacion"=$1
       WHERE id=$2 AND "comandaId"=$3 AND "empresaId"=$4`,
      [motivo ?? null, itemId, comandaId, empresaId],
    );
    await this._recalcularTotales(comandaId, empresaId);
    return { ok: true };
  }

  async enviarACocina(comandaId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const ahora = new Date();
    const resultado = await this.ds.query(
      `UPDATE rs_comanda_items
       SET "estadoCocina"='en_preparacion', "enviadoCocinaAt"=$1
       WHERE "comandaId"=$2 AND "empresaId"=$3 AND "estadoCocina"='pendiente' AND cancelado=false`,
      [ahora, comandaId, empresaId],
    );
    await this.ds.query(
      `UPDATE rs_comandas SET estado='en_cocina', "updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [comandaId, empresaId],
    );
    // Descontar inventario (fire-and-forget)
    this._descontarInventario(comandaId, empresaId)
      .catch(err => this.logger.error('Error descontando inventario', err));
    this.logger.log(`Comanda #${comandaId} enviada a cocina`);
    return { ok: true, itemsActualizados: resultado.rowCount ?? resultado };
  }

  async cobrarComanda(comandaId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const comanda = await this.obtenerComanda(comandaId);
    if (comanda.estado === 'cobrada') throw new BadRequestException('Comanda ya cobrada');

    const propina = Number(dto.propina ?? 0);
    const subtotal = Number(comanda.subtotal);
    const descuento = Number(comanda.descuento ?? 0);
    const baseItbis = subtotal - descuento;
    const itbis = baseItbis * 0.18;
    const total = baseItbis + itbis + propina;

    await this.ds.query(
      `UPDATE rs_comandas SET estado='cobrada', "metodoPago"=$1, propina=$2, itbis=$3, total=$4,
              "fechaCierre"=NOW(), "updatedAt"=NOW()
       WHERE id=$5 AND "empresaId"=$6`,
      [dto.metodoPago, propina, itbis, total, comandaId, empresaId],
    );
    // Liberar mesa → limpieza
    await this.ds.query(
      `UPDATE rs_mesas SET estado='limpieza', "comandaActualId"=NULL WHERE id=$1 AND "empresaId"=$2`,
      [comanda.mesaId, empresaId],
    );
    // Propina en tabla
    if (propina > 0) {
      await this.ds.query(
        `INSERT INTO rs_propinas ("empresaId","comandaId","meseroId","meseroNombre",monto,porcentaje,"metodoPago")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [empresaId, comandaId, comanda.meseroId ?? null, comanda.meseroNombre ?? null,
         propina, dto.porcentajePropina ?? null, dto.metodoPago],
      ).catch(err => this.logger.error('Error registrando propina', err));
    }
    // Actualizar turno activo (fire-and-forget)
    this._actualizarTurnoActivo(empresaId, total, dto.metodoPago, propina, comanda.descuento ?? 0)
      .catch(err => this.logger.error('Error actualizando turno', err));

    // Asiento contable (fire-and-forget)
    this._crearAsientoVentaRestaurante(empresaId, comandaId, comanda.numero, total, itbis, baseItbis, dto.metodoPago)
      .catch(err => this.logger.error('Error asiento contable restaurante', err));

    return this.obtenerComanda(comandaId);
  }

  async dividirCuenta(comandaId: number, divisiones: { items: number[] }[]) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const comanda = await this.obtenerComanda(comandaId);
    if (comanda.estado !== 'abierta' && comanda.estado !== 'lista') {
      throw new BadRequestException('Solo se puede dividir una comanda abierta o lista');
    }
    // Retorna la distribución de items por división con sus subtotales
    return divisiones.map((div, i) => {
      const itemsDivision = comanda.items.filter((item: any) => div.items.includes(item.id));
      const subtotal = itemsDivision.reduce((s: number, it: any) => s + Number(it.total), 0);
      const itbis = subtotal * 0.18;
      return {
        division: i + 1,
        items: itemsDivision,
        subtotal,
        itbis,
        total: subtotal + itbis,
      };
    });
  }

  // ── KDS ───────────────────────────────────────────────────────────────────

  async kdsItemsPendientes() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT ci.*, mi.nombre AS "itemNombre", mi."tiempoPreparacionMin",
              c.numero AS "comandaNumero", m.numero AS "mesaNumero",
              a.nombre AS "areaNombre",
              EXTRACT(EPOCH FROM (NOW()-ci."enviadoCocinaAt"))/60 AS "minutosEspera"
       FROM rs_comanda_items ci
       JOIN rs_menu_items mi ON mi.id=ci."menuItemId"
       JOIN rs_comandas c ON c.id=ci."comandaId"
       JOIN rs_mesas m ON m.id=c."mesaId"
       LEFT JOIN rs_areas a ON a.id=m."areaId"
       WHERE c."empresaId"=$1 AND ci."estadoCocina" IN ('en_preparacion','pendiente')
             AND ci.cancelado=false
       ORDER BY ci."enviadoCocinaAt" ASC NULLS LAST, ci."createdAt" ASC`,
      [empresaId],
    );
  }

  async kdsIniciarItem(itemId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [item] = await this.ds.query<any[]>(
      `UPDATE rs_comanda_items SET "estadoCocina"='en_preparacion', "enviadoCocinaAt"=COALESCE("enviadoCocinaAt", NOW())
       WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [itemId, empresaId],
    );
    return item;
  }

  async kdsMarcarListo(itemId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [item] = await this.ds.query<any[]>(
      `UPDATE rs_comanda_items SET "estadoCocina"='listo', "listoCocinaAt"=NOW()
       WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [itemId, empresaId],
    );
    // Si todos los items de la comanda están listos → actualizar comanda
    const pendientes = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS cnt FROM rs_comanda_items
       WHERE "comandaId"=$1 AND "estadoCocina" NOT IN ('listo','entregado','cancelado') AND cancelado=false`,
      [item.comandaId],
    );
    if (pendientes[0]?.cnt === 0) {
      await this.ds.query(
        `UPDATE rs_comandas SET estado='lista', "updatedAt"=NOW() WHERE id=$1`,
        [item.comandaId],
      );
    }
    return item;
  }

  async listarEstaciones() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(`SELECT * FROM rs_kds_estaciones WHERE "empresaId"=$1 AND "isActive"=true ORDER BY nombre`, [empresaId]);
  }

  async crearEstacion(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [est] = await this.ds.query<any[]>(
      `INSERT INTO rs_kds_estaciones ("empresaId",nombre,categorias) VALUES ($1,$2,$3) RETURNING *`,
      [empresaId, dto.nombre, dto.categorias ?? null],
    );
    return est;
  }

  // ── DELIVERY ──────────────────────────────────────────────────────────────

  async listarDelivery(estado?: string, page = 1, limit = 30) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE d."empresaId"=$1`;
    if (estado) { params.push(estado); where += ` AND d.estado=$${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM rs_pedidos_delivery d ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(
      `SELECT d.*,
              COALESCE(
                (SELECT json_agg(ci ORDER BY ci.id) FROM (
                  SELECT i.*, mi.nombre AS "itemNombre" FROM rs_comanda_items i
                  JOIN rs_menu_items mi ON mi.id=i."menuItemId"
                  WHERE i."comandaId"=d."comandaId"
                ) ci),
                '[]'::json
              ) AS items
       FROM rs_pedidos_delivery d
       ${where} ORDER BY d."fechaPedido" DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params,
    );
    return { data, total, page, limit };
  }

  async crearDelivery(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'DEL-', 1, empresaId);
    const [pedido] = await this.ds.query<any[]>(
      `INSERT INTO rs_pedidos_delivery
        ("empresaId",numero,"clienteNombre","clienteTelefono","clienteEmail","clienteId",
         "direccionEntrega","referenciasDireccion","metodoPago","costoEnvio",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [empresaId, numero, dto.clienteNombre, dto.clienteTelefono, dto.clienteEmail ?? null,
       dto.clienteId ?? null, dto.direccionEntrega, dto.referenciasDireccion ?? null,
       dto.metodoPago ?? null, dto.costoEnvio ?? 0, dto.notas ?? null],
    );
    return pedido;
  }

  async actualizarEstadoDelivery(id: number, estado: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const extraSets = estado === 'entregado' ? `, "fechaEntregaReal"=NOW()` : '';
    const [pedido] = await this.ds.query<any[]>(
      `UPDATE rs_pedidos_delivery SET estado=$1${extraSets} WHERE id=$2 AND "empresaId"=$3 RETURNING *`,
      [estado, id, empresaId],
    );
    return pedido;
  }

  async asignarRepartidor(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [pedido] = await this.ds.query<any[]>(
      `UPDATE rs_pedidos_delivery SET "repartidorNombre"=$1, "repartidorTelefono"=$2, estado='en_camino'
       WHERE id=$3 AND "empresaId"=$4 RETURNING *`,
      [dto.repartidorNombre, dto.repartidorTelefono ?? null, id, empresaId],
    );
    return pedido;
  }

  // ── TURNOS ────────────────────────────────────────────────────────────────

  async listarTurnos(page = 1, limit = 20) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM rs_turnos WHERE "empresaId"=$1`, [empresaId]);
    const data = await this.ds.query<any[]>(
      `SELECT * FROM rs_turnos WHERE "empresaId"=$1 ORDER BY "fechaApertura" DESC LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset],
    );
    return { data, total, page, limit };
  }

  async abrirTurno(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [abierto] = await this.ds.query<any[]>(
      `SELECT id FROM rs_turnos WHERE "empresaId"=$1 AND estado='abierto' LIMIT 1`, [empresaId],
    );
    if (abierto) throw new BadRequestException('Ya existe un turno abierto');
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'TUR-', 1, empresaId);
    const [turno] = await this.ds.query<any[]>(
      `INSERT INTO rs_turnos ("empresaId",numero,"usuarioId","usuarioNombre","fondoInicial")
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, numero, dto.usuarioId ?? null, dto.usuarioNombre ?? null, dto.fondoInicial ?? 0],
    );
    return turno;
  }

  async cerrarTurno(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const efectivoContado = dto.efectivoContado ?? null;
    const [turno] = await this.ds.query<any[]>(
      `SELECT * FROM rs_turnos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!turno) throw new NotFoundException('Turno no encontrado');
    const diferencia = efectivoContado !== null ? efectivoContado - turno.totalEfectivo : null;
    const [cerrado] = await this.ds.query<any[]>(
      `UPDATE rs_turnos SET estado='cerrado', "fechaCierre"=NOW(), "efectivoContado"=$1, diferencia=$2, notas=$3
       WHERE id=$4 AND "empresaId"=$5 RETURNING *`,
      [efectivoContado, diferencia, dto.notas ?? null, id, empresaId],
    );
    return cerrado;
  }

  async resumenTurno(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [turno] = await this.ds.query<any[]>(
      `SELECT * FROM rs_turnos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!turno) throw new NotFoundException('Turno no encontrado');
    const comandas = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER(WHERE estado='cobrada')::int AS cobradas,
              COALESCE(SUM(total) FILTER(WHERE estado='cobrada'),0)::numeric AS ingresos
       FROM rs_comandas WHERE "empresaId"=$1
             AND "fechaApertura" >= $2 AND ("fechaCierre" <= $3 OR estado != 'cobrada')`,
      [empresaId, turno.fechaApertura, turno.fechaCierre ?? new Date()],
    );
    return { turno, resumen: comandas[0] };
  }

  // ── REPORTES ──────────────────────────────────────────────────────────────

  async reporteVentas(desde: string, hasta: string, tipo = 'ventas') {
    const empresaId = this.tenantSvc.getEmpresaId();

    if (tipo === 'menu') return this._reporteMenu(empresaId, desde, hasta);
    if (tipo === 'delivery') return this._reporteDelivery(empresaId, desde, hasta);
    if (tipo === 'propinas') return this._reportePropinas(empresaId, desde, hasta);

    // tipo === 'ventas' (default)
    const [kpis] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS "totalComandas",
              COALESCE(SUM(total),0)::numeric AS "totalVentas",
              COALESCE(SUM(itbis),0)::numeric AS "itbisTotal",
              COALESCE(SUM(propina),0)::numeric AS "totalPropinas",
              COALESCE(SUM(descuento),0)::numeric AS "totalDescuentos",
              COALESCE(AVG(total),0)::numeric AS "ticketPromedio"
       FROM rs_comandas WHERE "empresaId"=$1 AND estado='cobrada'
             AND "fechaCierre"::date BETWEEN $2 AND $3`,
      [empresaId, desde, hasta],
    );
    const filas = await this.ds.query<any[]>(
      `SELECT "fechaCierre"::date AS periodo,
              COUNT(*)::int AS comandas,
              COALESCE(SUM(total),0)::numeric AS ventas,
              COALESCE(AVG(total),0)::numeric AS "ticketPromedio",
              COALESCE(SUM(total) FILTER(WHERE "metodoPago"='efectivo'),0)::numeric AS efectivo,
              COALESCE(SUM(total) FILTER(WHERE "metodoPago"='tarjeta'),0)::numeric AS tarjeta,
              COALESCE(SUM(total) FILTER(WHERE "metodoPago"='transferencia'),0)::numeric AS transferencia
       FROM rs_comandas WHERE "empresaId"=$1 AND estado='cobrada'
             AND "fechaCierre"::date BETWEEN $2 AND $3
       GROUP BY "fechaCierre"::date ORDER BY periodo`,
      [empresaId, desde, hasta],
    );
    return { kpis, filas, columnas: [] };
  }

  private async _reporteMenu(empresaId: number, desde: string, hasta: string) {
    const [kpis] = await this.ds.query<any[]>(
      `SELECT COUNT(DISTINCT mi.id)::int AS "platosVendidos",
              COALESCE(SUM(ci.cantidad),0)::int AS "itemsTotales",
              COALESCE(SUM(ci.total),0)::numeric AS "totalIngresos"
       FROM rs_comanda_items ci
       JOIN rs_menu_items mi ON mi.id=ci."menuItemId"
       JOIN rs_comandas c ON c.id=ci."comandaId"
       WHERE c."empresaId"=$1 AND c.estado='cobrada' AND c."fechaCierre"::date BETWEEN $2 AND $3
             AND ci.cancelado=false`,
      [empresaId, desde, hasta],
    );
    const filas = await this.ds.query<any[]>(
      `SELECT mi.nombre, cat.nombre AS "categoriaNombre",
              SUM(ci.cantidad)::int AS vendidos,
              COALESCE(SUM(ci.total),0)::numeric AS ingresos,
              COALESCE(SUM(ci.cantidad * COALESCE(mi.costo,0)),0)::numeric AS "costoTotal",
              CASE WHEN SUM(ci.total)>0
                   THEN ROUND(((SUM(ci.total) - SUM(ci.cantidad * COALESCE(mi.costo,0)))/SUM(ci.total)*100)::numeric,1)
                   ELSE NULL END AS margen
       FROM rs_comanda_items ci
       JOIN rs_menu_items mi ON mi.id=ci."menuItemId"
       LEFT JOIN rs_categorias_menu cat ON cat.id=mi."categoriaId"
       JOIN rs_comandas c ON c.id=ci."comandaId"
       WHERE c."empresaId"=$1 AND c.estado='cobrada' AND c."fechaCierre"::date BETWEEN $2 AND $3
             AND ci.cancelado=false
       GROUP BY mi.id, mi.nombre, cat.nombre ORDER BY vendidos DESC`,
      [empresaId, desde, hasta],
    );
    return { kpis, filas, columnas: [] };
  }

  private async _reporteDelivery(empresaId: number, desde: string, hasta: string) {
    const [kpis] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS "pedidosDelivery",
              COUNT(*) FILTER(WHERE estado='entregado')::int AS entregados,
              COUNT(*) FILTER(WHERE estado='cancelado')::int AS cancelados,
              COALESCE(SUM(total) FILTER(WHERE estado='entregado'),0)::numeric AS "ventasDelivery"
       FROM rs_pedidos_delivery WHERE "empresaId"=$1 AND "createdAt"::date BETWEEN $2 AND $3`,
      [empresaId, desde, hasta],
    );
    const filas = await this.ds.query<any[]>(
      `SELECT id, numero, "clienteNombre", telefono, total, estado, "repartidorNombre",
              "createdAt" AS fecha
       FROM rs_pedidos_delivery
       WHERE "empresaId"=$1 AND "createdAt"::date BETWEEN $2 AND $3
       ORDER BY "createdAt" DESC LIMIT 200`,
      [empresaId, desde, hasta],
    );
    return { kpis, filas, columnas: [] };
  }

  private async _reportePropinas(empresaId: number, desde: string, hasta: string) {
    const [kpis] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(monto),0)::numeric AS "totalPropinas",
              COALESCE(AVG(monto),0)::numeric AS "propinaPromedio",
              COUNT(*)::int AS total
       FROM rs_propinas WHERE "empresaId"=$1 AND "createdAt"::date BETWEEN $2 AND $3`,
      [empresaId, desde, hasta],
    );
    const filas = await this.ds.query<any[]>(
      `SELECT p."meseroNombre", COUNT(*)::int AS comandas,
              COALESCE(SUM(p.monto),0)::numeric AS "totalPropinas",
              COALESCE(AVG(p.monto),0)::numeric AS promedio
       FROM rs_propinas p
       WHERE p."empresaId"=$1 AND p."createdAt"::date BETWEEN $2 AND $3
       GROUP BY p."meseroNombre" ORDER BY "totalPropinas" DESC`,
      [empresaId, desde, hasta],
    );
    return { kpis, filas, columnas: [] };
  }

  // ── PRIVADO ───────────────────────────────────────────────────────────────

  private async _recalcularTotales(comandaId: number, empresaId: number) {
    await this.ds.query(
      `UPDATE rs_comandas SET subtotal=(
         SELECT COALESCE(SUM(total),0) FROM rs_comanda_items
         WHERE "comandaId"=$1 AND cancelado=false
       ), "updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [comandaId, empresaId],
    );
  }

  private async _actualizarTurnoActivo(
    empresaId: number, total: number, metodoPago: string, propina: number, descuento: number,
  ) {
    const [turno] = await this.ds.query<any[]>(
      `SELECT id FROM rs_turnos WHERE "empresaId"=$1 AND estado='abierto' LIMIT 1`, [empresaId],
    );
    if (!turno) return;
    const colPago = metodoPago === 'efectivo' ? '"totalEfectivo"'
      : metodoPago === 'tarjeta' ? '"totalTarjeta"' : '"totalTransferencia"';
    await this.ds.query(
      `UPDATE rs_turnos SET "totalVentas"="totalVentas"+$1, ${colPago}=${colPago}+$1,
              "totalPropinas"="totalPropinas"+$2, "totalDescuentos"="totalDescuentos"+$3
       WHERE id=$4`,
      [total, propina, descuento, turno.id],
    );
  }

  // ── ERP: Descontar inventario al enviar a cocina ─────────────────────────
  private async _descontarInventario(comandaId: number, empresaId: number) {
    const items = await this.ds.query<any[]>(
      `SELECT ci.cantidad, mi."productoId"
       FROM rs_comanda_items ci
       JOIN rs_menu_items mi ON mi.id = ci."menuItemId"
       WHERE ci."comandaId"=$1 AND ci."empresaId"=$2
             AND mi."productoId" IS NOT NULL AND ci.cancelado=false`,
      [comandaId, empresaId],
    );
    for (const item of items) {
      await this.ds.query(
        `UPDATE productos SET stock=GREATEST(0, stock-$1)
         WHERE id=$2 AND "empresaId"=$3`,
        [item.cantidad, item.productoId, empresaId],
      );
    }
    if (items.length > 0) this.logger.log(`Inventario descontado: ${items.length} items comanda #${comandaId}`);
  }

  // ── ERP: Asiento contable al cobrar comanda ───────────────────────────────
  private async _crearAsientoVentaRestaurante(
    empresaId: number, comandaId: number, comandaNum: string,
    total: number, itbis: number, neto: number, metodoPago: string,
  ) {
    // Obtener IDs de cuentas por código estándar DR
    const codCaja    = metodoPago === 'efectivo' ? '1.1.1.02' : '1.1.1.03';
    const codVentas  = '4.1.1.01';
    const codItbis   = '2.1.2.01';

    const cuentas = await this.ds.query<any[]>(
      `SELECT id, codigo FROM cuentas_contables
       WHERE "empresaId"=$1 AND codigo IN ($2,$3,$4) AND "isActive"=true`,
      [empresaId, codCaja, codVentas, codItbis],
    );
    if (cuentas.length < 3) { this.logger.warn(`Asiento restaurante omitido — cuentas incompletas`); return; }

    const byCode = (c: string) => cuentas.find((cc: any) => cc.codigo === c)?.id;
    const cajaId   = byCode(codCaja);
    const ventasId = byCode(codVentas);
    const itbisId  = byCode(codItbis);
    if (!cajaId || !ventasId || !itbisId) { this.logger.warn(`Asiento restaurante omitido — cuentas no encontradas`); return; }

    const numero = await generarNumeroSecuencial(this.ds, 'asientos_contables', 'numero', '^ASI-[0-9]+$', 'ASI-', 5, empresaId);

    const [asiento] = await this.ds.query<any[]>(
      `INSERT INTO asientos_contables
         ("empresaId", numero, fecha, descripcion, "tipoOrigen", "referenciaId", "referenciaFolio",
          estado, "totalDebe", "totalHaber", "userId", "createdAt", "updatedAt")
       VALUES ($1,$2,NOW(),$3,'manual',$4,$5,'contabilizado',$6,$6,1,NOW(),NOW()) RETURNING id`,
      [empresaId, numero, `Venta restaurante ${comandaNum}`, comandaId, comandaNum, total],
    );
    if (!asiento) return;

    await this.ds.query(
      `INSERT INTO asiento_lineas ("empresaId","asientoId","cuentaContableId",descripcion,debe,haber,"createdAt","updatedAt")
       VALUES
         ($1,$2,$3,$4,$5,0,NOW(),NOW()),
         ($1,$2,$6,$7,0,$8,NOW(),NOW()),
         ($1,$2,$9,$10,0,$11,NOW(),NOW())`,
      [
        empresaId, asiento.id,
        cajaId,   `Cobro comanda ${comandaNum}`, total,
        ventasId, `Venta restaurante ${comandaNum}`, neto,
        itbisId,  `ITBIS comanda ${comandaNum}`, itbis,
      ],
    );
    this.logger.log(`Asiento contable ${numero} creado para comanda ${comandaNum}`);
  }
}
