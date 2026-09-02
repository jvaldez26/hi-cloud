import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { PreFacturaService } from '../pre-factura/pre-factura.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class TallerService {
  private readonly logger = new Logger(TallerService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly preFacturaSvc: PreFacturaService,
  ) {}

  // ── HELPERS ────────────────────────────────────────────────────────────────

  private async vehiculoOr404(empresaId: number, id: number) {
    const [v] = await this.ds.query<any[]>(
      `SELECT * FROM tm_vehiculos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!v) throw new NotFoundException(`Vehículo #${id} no encontrado`);
    return v;
  }

  private async ordenOr404(empresaId: number, id: number) {
    const [o] = await this.ds.query<any[]>(
      `SELECT * FROM tm_ordenes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!o) throw new NotFoundException(`Orden de servicio #${id} no encontrada`);
    return o;
  }

  private async recalcularTotales(ordenId: number, empresaId: number) {
    const [ord] = await this.ds.query<any[]>(
      `SELECT descuento FROM tm_ordenes WHERE id = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    const [ts] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(total), 0)::numeric AS suma FROM tm_orden_servicios WHERE "ordenId" = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    const [tr] = await this.ds.query<any[]>(
      `SELECT COALESCE(SUM(total), 0)::numeric AS suma FROM tm_orden_repuestos WHERE "ordenId" = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    const subtotalManoObra = Number(ts.suma);
    const subtotalRepuestos = Number(tr.suma);
    const subtotal = subtotalManoObra + subtotalRepuestos;
    const itbis = Math.round(subtotal * 18) / 100;
    const desc = Number(ord?.descuento ?? 0);
    const total = Math.round((subtotal + itbis - desc) * 100) / 100;
    await this.ds.query(
      `UPDATE tm_ordenes SET "subtotalManoObra" = $1, "subtotalRepuestos" = $2, itbis = $3, total = $4, "updatedAt" = NOW() WHERE id = $5 AND "empresaId" = $6`,
      [subtotalManoObra, subtotalRepuestos, itbis, total, ordenId, empresaId],
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────

  async dashboard() {
    const empresaId = this.tenantSvc.getEmpresaId();
    let stats: any;
    try {
      const [s] = await this.ds.query<any[]>(`
        SELECT
          (SELECT COUNT(*) FROM tm_ordenes WHERE "empresaId" = $1 AND DATE("fechaIngreso") = CURRENT_DATE)::int AS "ordenesHoy",
          (SELECT COUNT(*) FROM tm_ordenes WHERE "empresaId" = $1 AND estado IN ('en_proceso','diagnostico','aprobado'))::int AS "ordenesEnProceso",
          (SELECT COUNT(*) FROM tm_ordenes WHERE "empresaId" = $1 AND estado = 'listo')::int AS "ordenesListas",
          (SELECT COUNT(*) FROM tm_citas WHERE "empresaId" = $1 AND fecha = CURRENT_DATE AND estado != 'cancelada')::int AS "citasHoy",
          (SELECT COALESCE(SUM(total),0) FROM tm_ordenes WHERE "empresaId" = $1 AND DATE("fechaIngreso") >= DATE_TRUNC('month', CURRENT_DATE))::numeric AS "ventasMes",
          (SELECT COUNT(*) FROM tm_vehiculos WHERE "empresaId" = $1 AND "isActive" = true)::int AS "totalVehiculos",
          (SELECT COUNT(*) FROM tm_tecnicos WHERE "empresaId" = $1 AND "isActive" = true)::int AS "totalTecnicos"
      `, [empresaId]);
      stats = s;
    } catch (err: any) {
      this.logger.error(`Error dashboard taller: ${err.message}`, err.stack);
      throw err;
    }
    const ordenesRecientes = await this.ds.query<any[]>(`
      SELECT o.id, o.numero, o.estado, o.prioridad, o.total, o."fechaIngreso",
             v.placa, v.marca, v.modelo, t.nombre AS "tecnicoNombre"
      FROM tm_ordenes o
      LEFT JOIN tm_vehiculos v ON v.id = o."vehiculoId"
      LEFT JOIN tm_tecnicos  t ON t.id = o."tecnicoId"
      WHERE o."empresaId" = $1
      ORDER BY o."fechaIngreso" DESC LIMIT 10
    `, [empresaId]);
    const citasHoy = await this.ds.query<any[]>(`
      SELECT c.*, v.placa, v.marca, v.modelo, t.nombre AS "tecnicoNombre"
      FROM tm_citas c
      LEFT JOIN tm_vehiculos v ON v.id = c."vehiculoId"
      LEFT JOIN tm_tecnicos  t ON t.id = c."tecnicoId"
      WHERE c."empresaId" = $1 AND c.fecha = CURRENT_DATE AND c.estado != 'cancelada'
      ORDER BY c.hora
    `, [empresaId]);
    const tecnicosActivos = await this.ds.query<any[]>(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tm_ordenes WHERE "tecnicoId" = t.id AND "empresaId" = $1 AND estado IN ('en_proceso','aprobado'))::int AS "ordenesActivas"
      FROM tm_tecnicos t
      WHERE t."empresaId" = $1 AND t."isActive" = true
      ORDER BY t.nombre
    `, [empresaId]);
    return { ...stats, ordenesRecientes, citasHoy, tecnicosActivos };
  }

  // ── VEHÍCULOS ──────────────────────────────────────────────────────────────

  async listarVehiculos(page = 1, limit = 20, search?: string, clienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE v."empresaId" = $1 AND v."isActive" = true`;
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      where += ` AND (v.placa ILIKE $${p} OR v.marca ILIKE $${p} OR v.modelo ILIKE $${p} OR v."propietarioNombre" ILIKE $${p})`;
    }
    if (clienteId) { params.push(clienteId); where += ` AND v."clienteId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM tm_vehiculos v ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT v.*, c.nombre AS "clienteNombre", c.telefono AS "clienteTelefono"
      FROM tm_vehiculos v
      LEFT JOIN clientes c ON c.id = v."clienteId"
      ${where} ORDER BY v."createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearVehiculo(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { placa, vin, marca, modelo, anio, color, tipo, combustible, transmision, cilindraje,
            kilometrajeActual, propietarioNombre, propietarioTelefono, propietarioEmail,
            clienteId, observaciones, imagenUrl } = dto;
    let row: any;
    try {
      [row] = await this.ds.query<any[]>(`
        INSERT INTO tm_vehiculos (
          "empresaId", placa, vin, marca, modelo, anio, color, tipo, combustible, transmision,
          cilindraje, "kilometrajeActual", "propietarioNombre", "propietarioTelefono",
          "propietarioEmail", "clienteId", observaciones, "imagenUrl"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
      `, [
        empresaId, placa, vin ?? null, marca, modelo, anio ?? null, color ?? null, tipo ?? null,
        combustible ?? null, transmision ?? null, cilindraje ?? null, kilometrajeActual ?? 0,
        propietarioNombre ?? null, propietarioTelefono ?? null, propietarioEmail ?? null,
        clienteId ?? null, observaciones ?? null, imagenUrl ?? null,
      ]);
    } catch (err: any) {
      this.logger.error(`Error creando vehículo: ${err.message}`, err.stack);
      if (err.code === '23505') throw new BadRequestException(`Ya existe un vehículo con la placa ${placa}`);
      throw err;
    }
    return row;
  }

  async obtenerVehiculo(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [v] = await this.ds.query<any[]>(`
      SELECT v.*, c.nombre AS "clienteNombre", c.telefono AS "clienteTelefono", c.email AS "clienteEmail"
      FROM tm_vehiculos v
      LEFT JOIN clientes c ON c.id = v."clienteId"
      WHERE v.id = $1 AND v."empresaId" = $2
    `, [id, empresaId]);
    if (!v) throw new NotFoundException(`Vehículo #${id} no encontrado`);
    return v;
  }

  async actualizarVehiculo(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.vehiculoOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['placa','vin','marca','modelo','anio','color','tipo','combustible','transmision','cilindraje',
                     'kilometrajeActual','kilometrajeUltimoServicio','proximoServicioKm','clienteId',
                     'propietarioNombre','propietarioTelefono','propietarioEmail','observaciones','imagenUrl','isActive']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return this.obtenerVehiculo(id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_vehiculos SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    return row;
  }

  async buscarPorPlaca(placa: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [v] = await this.ds.query<any[]>(
      `SELECT * FROM tm_vehiculos WHERE "empresaId" = $1 AND LOWER(placa) = LOWER($2) AND "isActive" = true`,
      [empresaId, placa],
    );
    if (!v) throw new NotFoundException(`No se encontró vehículo con placa ${placa}`);
    return v;
  }

  async historialVehiculo(vehiculoId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.vehiculoOr404(empresaId, vehiculoId);
    return this.ds.query<any[]>(`
      SELECT h.*, o.numero AS "ordenNumero"
      FROM tm_historial_mantenimiento h
      LEFT JOIN tm_ordenes o ON o.id = h."ordenId"
      WHERE h."vehiculoId" = $1 AND h."empresaId" = $2
      ORDER BY h.fecha DESC
    `, [vehiculoId, empresaId]);
  }

  async ordenesVehiculo(vehiculoId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.vehiculoOr404(empresaId, vehiculoId);
    return this.ds.query<any[]>(`
      SELECT o.id, o.numero, o.estado, o.prioridad, o.total, o."fechaIngreso", o."motivoIngreso",
             t.nombre AS "tecnicoNombre"
      FROM tm_ordenes o
      LEFT JOIN tm_tecnicos t ON t.id = o."tecnicoId"
      WHERE o."vehiculoId" = $1 AND o."empresaId" = $2
      ORDER BY o."fechaIngreso" DESC
    `, [vehiculoId, empresaId]);
  }

  // ── TÉCNICOS ───────────────────────────────────────────────────────────────

  async listarTecnicos() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM tm_tecnicos WHERE "empresaId" = $1 ORDER BY nombre`,
      [empresaId],
    );
  }

  async crearTecnico(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { nombre, especialidad, telefono, email, tarifaHora, empleadoId } = dto;
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_tecnicos ("empresaId", nombre, especialidad, telefono, email, "tarifaHora", "empleadoId")
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [empresaId, nombre, especialidad ?? null, telefono ?? null, email ?? null, tarifaHora ?? null, empleadoId ?? null]);
    return row;
  }

  async actualizarTecnico(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['nombre','especialidad','telefono','email','tarifaHora','empleadoId','isActive']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) {
      const [t] = await this.ds.query<any[]>(`SELECT * FROM tm_tecnicos WHERE id = $1 AND "empresaId" = $2`, [id, empresaId]);
      return t;
    }
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_tecnicos SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    if (!row) throw new NotFoundException(`Técnico #${id} no encontrado`);
    return row;
  }

  // ── ÓRDENES DE SERVICIO ────────────────────────────────────────────────────

  async listarOrdenes(page = 1, limit = 20, estado?: string, tecnicoId?: number, desde?: string, hasta?: string, vehiculoId?: number, search?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE o."empresaId" = $1`;
    if (estado) { params.push(estado); where += ` AND o.estado = $${params.length}`; }
    if (tecnicoId) { params.push(tecnicoId); where += ` AND o."tecnicoId" = $${params.length}`; }
    if (vehiculoId) { params.push(vehiculoId); where += ` AND o."vehiculoId" = $${params.length}`; }
    if (desde) { params.push(desde); where += ` AND DATE(o."fechaIngreso") >= $${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND DATE(o."fechaIngreso") <= $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      where += ` AND (o.numero ILIKE $${p} OR v.placa ILIKE $${p} OR v.marca ILIKE $${p})`;
    }
    const [{ total }] = await this.ds.query<any[]>(`
      SELECT COUNT(*)::int AS total FROM tm_ordenes o
      LEFT JOIN tm_vehiculos v ON v.id = o."vehiculoId"
      ${where}
    `, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT o.*, v.placa, v.marca, v.modelo, v.color, v.anio,
             t.nombre AS "tecnicoNombre"
      FROM tm_ordenes o
      LEFT JOIN tm_vehiculos v ON v.id = o."vehiculoId"
      LEFT JOIN tm_tecnicos  t ON t.id = o."tecnicoId"
      ${where}
      ORDER BY o."fechaIngreso" DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearOrden(dto: any, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'OS-', 0, empresaId);
    const {
      vehiculoId, clienteId, motivoIngreso, diagnosticoInicial, tecnicoId, prioridad,
      fechaEstimadaEntrega, kilometrajeIngreso, nivelCombustible,
      tieneRayones, tieneGolpes, tieneDocumentos, tieneGato, tieneHerramientas,
      observacionesIngreso, garantiaDias, garantiaKm, notas,
    } = dto;
    if (kilometrajeIngreso) {
      await this.ds.query(
        `UPDATE tm_vehiculos SET "kilometrajeActual" = GREATEST("kilometrajeActual", $1), "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [kilometrajeIngreso, vehiculoId, empresaId],
      );
    }
    let row: any;
    try {
      [row] = await this.ds.query<any[]>(`
        INSERT INTO tm_ordenes (
          "empresaId", numero, "vehiculoId", "clienteId", "motivoIngreso", "diagnosticoInicial",
          "tecnicoId", prioridad, estado, "fechaEstimadaEntrega",
          "kilometrajeIngreso", "nivelCombustible",
          "tieneRayones","tieneGolpes","tieneDocumentos","tieneGato","tieneHerramientas",
          "observacionesIngreso","garantiaDias","garantiaKm",notas,"createdBy"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'recibido',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING *
      `, [
        empresaId, numero, vehiculoId, clienteId ?? null, motivoIngreso, diagnosticoInicial ?? null,
        tecnicoId ?? null, prioridad ?? 'normal', fechaEstimadaEntrega ?? null,
        kilometrajeIngreso ?? null, nivelCombustible ?? null,
        tieneRayones ?? false, tieneGolpes ?? false, tieneDocumentos ?? false, tieneGato ?? false, tieneHerramientas ?? false,
        observacionesIngreso ?? null, garantiaDias ?? 0, garantiaKm ?? 0, notas ?? null, usuarioId,
      ]);
    } catch (err: any) {
      this.logger.error(`Error creando orden: ${err.message}`, err.stack);
      throw err;
    }
    return row;
  }

  async obtenerOrden(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [orden] = await this.ds.query<any[]>(`
      SELECT o.*,
             v.placa, v.marca, v.modelo, v.color, v.anio, v.tipo, v.combustible, v.transmision,
             v."kilometrajeActual", v."imagenUrl" AS "vehiculoImagenUrl", v.vin,
             t.nombre AS "tecnicoNombre", t.telefono AS "tecnicoTelefono"
      FROM tm_ordenes o
      LEFT JOIN tm_vehiculos v ON v.id = o."vehiculoId"
      LEFT JOIN tm_tecnicos  t ON t.id = o."tecnicoId"
      WHERE o.id = $1 AND o."empresaId" = $2
    `, [id, empresaId]);
    if (!orden) throw new NotFoundException(`Orden #${id} no encontrada`);
    orden.servicios = await this.ds.query<any[]>(`
      SELECT s.*, t.nombre AS "tecnicoNombre"
      FROM tm_orden_servicios s
      LEFT JOIN tm_tecnicos t ON t.id = s."tecnicoId"
      WHERE s."ordenId" = $1 AND s."empresaId" = $2
      ORDER BY s.id
    `, [id, empresaId]);
    orden.repuestos = await this.ds.query<any[]>(
      `SELECT * FROM tm_orden_repuestos WHERE "ordenId" = $1 AND "empresaId" = $2 ORDER BY id`,
      [id, empresaId],
    );
    orden.diagnosticos = await this.ds.query<any[]>(`
      SELECT d.*, t.nombre AS "tecnicoNombre"
      FROM tm_diagnosticos d
      LEFT JOIN tm_tecnicos t ON t.id = d."tecnicoId"
      WHERE d."ordenId" = $1 AND d."empresaId" = $2
      ORDER BY d."createdAt"
    `, [id, empresaId]);
    const [checklist] = await this.ds.query<any[]>(
      `SELECT * FROM tm_checklist WHERE "ordenId" = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    orden.checklist = checklist ?? null;
    return orden;
  }

  async actualizarOrden(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['vehiculoId','clienteId','tecnicoId','motivoIngreso','diagnosticoInicial','prioridad',
                     'fechaEstimadaEntrega','kilometrajeIngreso','nivelCombustible','tieneRayones','tieneGolpes',
                     'tieneDocumentos','tieneGato','tieneHerramientas','observacionesIngreso','garantiaDias',
                     'garantiaKm','descuento','notas']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return this.obtenerOrden(id);
    params.push(id, empresaId);
    await this.ds.query(
      `UPDATE tm_ordenes SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length}`,
      params,
    );
    if (dto.descuento !== undefined) await this.recalcularTotales(id, empresaId);
    return this.obtenerOrden(id);
  }

  async cambiarEstado(id: number, estado: string, notas?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const orden = await this.ordenOr404(empresaId, id);
    const fechaMap: Record<string, string> = {
      diagnostico: '"fechaDiagnostico"',
      aprobado:    '"fechaAprobacion"',
      en_proceso:  '"fechaInicio"',
      listo:       '"fechaFinalizacion"',
      entregado:   '"fechaEntrega"',
    };
    const extraSets = fechaMap[estado] ? `, ${fechaMap[estado]} = NOW()` : '';
    if (notas !== undefined) {
      await this.ds.query(
        `UPDATE tm_ordenes SET estado = $1, notas = $2${extraSets}, "updatedAt" = NOW() WHERE id = $3 AND "empresaId" = $4`,
        [estado, notas, id, empresaId],
      );
    } else {
      await this.ds.query(
        `UPDATE tm_ordenes SET estado = $1${extraSets}, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [estado, id, empresaId],
      );
    }
    if (estado === 'entregado') {
      this.onEntregado(id, empresaId, orden).catch((err: any) =>
        this.logger.error(`Error post-entrega OS #${id}: ${err.message}`, err.stack),
      );
    }
    return this.ordenOr404(empresaId, id);
  }

  private async onEntregado(ordenId: number, empresaId: number, orden: any) {
    if (orden.kilometrajeIngreso) {
      await this.ds.query(
        `UPDATE tm_vehiculos SET "kilometrajeActual" = GREATEST("kilometrajeActual", $1), "kilometrajeUltimoServicio" = $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [orden.kilometrajeIngreso, orden.vehiculoId, empresaId],
      );
    }
    await this.ds.query(
      `INSERT INTO tm_historial_mantenimiento ("empresaId","vehiculoId","ordenId",fecha,tipo,descripcion,kilometraje,costo)
       VALUES ($1,$2,$3,CURRENT_DATE,'servicio',$4,$5,$6)`,
      [empresaId, orden.vehiculoId, ordenId, orden.motivoIngreso, orden.kilometrajeIngreso ?? null, orden.total ?? 0],
    );
  }

  async aprobarOrden(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, id);
    const [row] = await this.ds.query<any[]>(`WITH fila AS (
         UPDATE tm_ordenes SET "presupuestoAprobado" = true, "aprobadoPor" = $1, "formaAprobacion" = $2,
          "aprobadoFecha" = NOW(), estado = 'aprobado', "updatedAt" = NOW()
        WHERE id = $3 AND "empresaId" = $4 RETURNING *
       ) SELECT * FROM fila`, [dto.aprobadoPor ?? null, dto.formaAprobacion ?? null, id, empresaId]);
    return row;
  }

  async facturarOrden(id: number, clienteId: number, usuarioId: number, tipoNcf?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const orden = await this.obtenerOrden(id);
    if (orden.facturaId) throw new BadRequestException('Esta orden ya fue facturada');
    const detalles: any[] = [];
    for (const svc of (orden.servicios as any[])) {
      detalles.push({ descripcion: svc.descripcion, cantidad: Number(svc.cantidad), precio: Number(svc.precioUnitario) });
    }
    for (const rep of (orden.repuestos as any[])) {
      detalles.push({ descripcion: rep.descripcion, cantidad: Number(rep.cantidad), precio: Number(rep.precioUnitario) });
    }
    if (!detalles.length) {
      detalles.push({ descripcion: `Servicios — ${orden.motivoIngreso ?? orden.numero}`, cantidad: 1, precio: Number(orden.total ?? 0) });
    }
    const notas = `Orden ${orden.numero} — ${orden.placa ?? ''} ${orden.marca ?? ''} ${orden.modelo ?? ''}`.trim();
    let preFactura: any;
    try {
      preFactura = await this.preFacturaSvc.crear(
        { clienteId, fecha: fechaHoyRD(), tipoNcf: tipoNcf ?? 'E32', detalles, notas },
        usuarioId,
      );
    } catch (err: any) {
      this.logger.error(`Error facturando orden #${id}: ${err.message}`, err.stack);
      throw err;
    }
    await this.ds.query(
      `UPDATE tm_ordenes SET "facturaId" = $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
      [preFactura.id, id, empresaId],
    );
    return { ...orden, facturaId: preFactura.id, prefactura: preFactura };
  }

  // ── SERVICIOS DE ORDEN ─────────────────────────────────────────────────────

  async agregarServicio(ordenId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const cant = Number(dto.cantidad ?? 1);
    const precio = Number(dto.precioUnitario ?? 0);
    const desc = Number(dto.descuento ?? 0);
    const total = Math.round((cant * precio - desc) * 100) / 100;
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_orden_servicios (
        "empresaId","ordenId",descripcion,categoria,"horasEstimadas","horasReales","tarifaHora",
        "precioUnitario",cantidad,descuento,total,"tecnicoId",notas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      empresaId, ordenId, dto.descripcion, dto.categoria ?? null,
      dto.horasEstimadas ?? null, dto.horasReales ?? null, dto.tarifaHora ?? null,
      precio, cant, desc, total, dto.tecnicoId ?? null, dto.notas ?? null,
    ]);
    await this.recalcularTotales(ordenId, empresaId);
    return row;
  }

  async actualizarServicio(ordenId: number, servicioId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['descripcion','categoria','horasEstimadas','horasReales','tarifaHora','precioUnitario','cantidad','descuento','estado','tecnicoId','notas']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (dto.estado === 'completado') { params.push(new Date()); sets.push(`"completadoAt" = $${params.length}`); }
    if (!sets.length) return null;
    params.push(servicioId, ordenId, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_orden_servicios SET ${sets.join(', ')}, total = ROUND((cantidad * "precioUnitario" - descuento), 2)
         WHERE id = $${params.length - 2} AND "ordenId" = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    if (!row) throw new NotFoundException(`Servicio #${servicioId} no encontrado`);
    await this.recalcularTotales(ordenId, empresaId);
    return row;
  }

  async eliminarServicio(ordenId: number, servicioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    await this.ds.query(
      `DELETE FROM tm_orden_servicios WHERE id = $1 AND "ordenId" = $2 AND "empresaId" = $3`,
      [servicioId, ordenId, empresaId],
    );
    await this.recalcularTotales(ordenId, empresaId);
  }

  // ── REPUESTOS DE ORDEN ─────────────────────────────────────────────────────

  async agregarRepuesto(ordenId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const cant = Number(dto.cantidad ?? 1);
    const precio = Number(dto.precioUnitario ?? 0);
    const desc = Number(dto.descuento ?? 0);
    const total = Math.round((cant * precio - desc) * 100) / 100;
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_orden_repuestos (
        "empresaId","ordenId",descripcion,referencia,marca,"productoId",
        cantidad,"costoUnitario","precioUnitario",descuento,total,origen,notas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      empresaId, ordenId, dto.descripcion, dto.referencia ?? null, dto.marca ?? null,
      dto.productoId ?? null, cant, dto.costoUnitario ?? null, precio, desc, total,
      dto.origen ?? 'inventario', dto.notas ?? null,
    ]);
    await this.recalcularTotales(ordenId, empresaId);
    return row;
  }

  async actualizarRepuesto(ordenId: number, repuestoId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['descripcion','referencia','marca','productoId','cantidad','costoUnitario','precioUnitario','descuento','origen','notas']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(repuestoId, ordenId, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_orden_repuestos SET ${sets.join(', ')}, total = ROUND((cantidad * "precioUnitario" - descuento), 2)
         WHERE id = $${params.length - 2} AND "ordenId" = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    if (!row) throw new NotFoundException(`Repuesto #${repuestoId} no encontrado`);
    await this.recalcularTotales(ordenId, empresaId);
    return row;
  }

  async eliminarRepuesto(ordenId: number, repuestoId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    await this.ds.query(
      `DELETE FROM tm_orden_repuestos WHERE id = $1 AND "ordenId" = $2 AND "empresaId" = $3`,
      [repuestoId, ordenId, empresaId],
    );
    await this.recalcularTotales(ordenId, empresaId);
  }

  // ── DIAGNÓSTICO ────────────────────────────────────────────────────────────

  async agregarDiagnostico(ordenId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_diagnosticos (
        "empresaId","ordenId","tecnicoId",sistema,descripcion,severidad,recomendacion,
        "requiereAtencionInmediata","incluidoEnPresupuesto","costoEstimado","imagenUrl"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [
      empresaId, ordenId, dto.tecnicoId ?? null, dto.sistema ?? null, dto.descripcion,
      dto.severidad ?? null, dto.recomendacion ?? null,
      dto.requiereAtencionInmediata ?? false, dto.incluidoEnPresupuesto ?? true,
      dto.costoEstimado ?? null, dto.imagenUrl ?? null,
    ]);
    await this.ds.query(
      `UPDATE tm_ordenes SET estado = CASE WHEN estado = 'recibido' THEN 'diagnostico' ELSE estado END,
       "fechaDiagnostico" = CASE WHEN estado = 'recibido' THEN NOW() ELSE "fechaDiagnostico" END,
       "updatedAt" = NOW() WHERE id = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    return row;
  }

  async listarDiagnosticos(ordenId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    return this.ds.query<any[]>(`
      SELECT d.*, t.nombre AS "tecnicoNombre"
      FROM tm_diagnosticos d
      LEFT JOIN tm_tecnicos t ON t.id = d."tecnicoId"
      WHERE d."ordenId" = $1 AND d."empresaId" = $2
      ORDER BY d."createdAt"
    `, [ordenId, empresaId]);
  }

  // ── CHECKLIST ──────────────────────────────────────────────────────────────

  async guardarChecklist(ordenId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const camposChecklist = [
      'motorAceite','motorRefrigerante','motorCorreas','motorFiltroAire','motorBujias',
      'frenosPastillas','frenosDiscos','frenosLiquido','frenosMano',
      'suspensionAmortiguadores','suspensionBrazos','suspensionBujes',
      'llantaDelanteraIzq','llantaDelanteraDer','llantaTraseraIzq','llantaTraseraDer','llantaRepuesto',
      'electricoBateria','electricoAlternador','electricoLuces',
      'acFuncionamiento','acGas','acFiltro','limpiaparabrisas','nivelLiquidos',
      'observaciones','inspeccionadoPor',
    ];
    const cols = camposChecklist.filter(c => dto[c] !== undefined);
    const vals = cols.map(c => dto[c]);
    const [existing] = await this.ds.query<any[]>(
      `SELECT id FROM tm_checklist WHERE "ordenId" = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    if (existing) {
      if (!cols.length) return existing;
      const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const [row] = await this.ds.query<any[]>(
        `WITH fila AS (
         UPDATE tm_checklist SET ${sets}, "updatedAt" = NOW() WHERE "ordenId" = $${cols.length + 1} AND "empresaId" = $${cols.length + 2} RETURNING *
       ) SELECT * FROM fila`,
        [...vals, ordenId, empresaId],
      );
      return row;
    }
    const colNames = cols.map(c => `"${c}"`).join(', ');
    const phs = cols.map((_, i) => `$${i + 3}`).join(', ');
    const prefix = cols.length ? `, ${colNames}` : '';
    const phSuffix = cols.length ? `, ${phs}` : '';
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO tm_checklist ("empresaId","ordenId"${prefix}) VALUES ($1,$2${phSuffix}) RETURNING *`,
      [empresaId, ordenId, ...vals],
    );
    return row;
  }

  async obtenerChecklist(ordenId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ordenOr404(empresaId, ordenId);
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM tm_checklist WHERE "ordenId" = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    return row ?? null;
  }

  // ── CITAS ──────────────────────────────────────────────────────────────────

  async listarCitas(fecha?: string, tecnicoId?: number, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId" = $1`;
    if (fecha) { params.push(fecha); where += ` AND c.fecha = $${params.length}`; }
    if (tecnicoId) { params.push(tecnicoId); where += ` AND c."tecnicoId" = $${params.length}`; }
    if (estado) { params.push(estado); where += ` AND c.estado = $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT c.*, v.placa, v.marca, v.modelo, t.nombre AS "tecnicoNombre"
      FROM tm_citas c
      LEFT JOIN tm_vehiculos v ON v.id = c."vehiculoId"
      LEFT JOIN tm_tecnicos  t ON t.id = c."tecnicoId"
      ${where} ORDER BY c.fecha, c.hora
    `, params);
  }

  async crearCita(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'CIT-', 0, empresaId);
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_citas ("empresaId",numero,"vehiculoId","clienteId","tecnicoId",
        fecha,hora,"duracionMinutos","tipoServicio",descripcion,estado,notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [
      empresaId, numero, dto.vehiculoId ?? null, dto.clienteId ?? null, dto.tecnicoId ?? null,
      dto.fecha, dto.hora, dto.duracionMinutos ?? 60,
      dto.tipoServicio ?? null, dto.descripcion ?? null, dto.estado ?? 'programada', dto.notas ?? null,
    ]);
    return row;
  }

  async actualizarCita(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['vehiculoId','clienteId','tecnicoId','fecha','hora','duracionMinutos','tipoServicio','descripcion','estado','notas']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_citas SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    if (!row) throw new NotFoundException(`Cita #${id} no encontrada`);
    return row;
  }

  // ── CATÁLOGO ────────────────────────────────────────────────────────────────

  async listarCatalogo() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM tm_catalogo_servicios WHERE "empresaId" = $1 ORDER BY categoria, nombre`,
      [empresaId],
    );
  }

  async crearServicioCatalogo(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO tm_catalogo_servicios ("empresaId",nombre,descripcion,categoria,"precioBase","horasEstimadas")
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [empresaId, dto.nombre, dto.descripcion ?? null, dto.categoria ?? null, dto.precioBase ?? null, dto.horasEstimadas ?? null]);
    return row;
  }

  async actualizarServicioCatalogo(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['nombre','descripcion','categoria','precioBase','horasEstimadas','isActive']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE tm_catalogo_servicios SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *
       ) SELECT * FROM fila`,
      params,
    );
    if (!row) throw new NotFoundException(`Catálogo #${id} no encontrado`);
    return row;
  }

  // ── REPORTES ───────────────────────────────────────────────────────────────

  async reporteProductividad(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let fw = '';
    if (desde) { params.push(desde); fw += ` AND DATE(o."fechaIngreso") >= $${params.length}`; }
    if (hasta) { params.push(hasta); fw += ` AND DATE(o."fechaIngreso") <= $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT t.nombre AS tecnico,
             COUNT(DISTINCT o.id)::int AS ordenes,
             COALESCE(SUM(s."horasReales"),0)::numeric AS horas,
             COALESCE(SUM(o."subtotalManoObra"),0)::numeric AS ingresos,
             CASE WHEN COUNT(DISTINCT o.id) > 0
               THEN ROUND(COALESCE(SUM(o."subtotalManoObra"),0)::numeric / COUNT(DISTINCT o.id), 2)
               ELSE 0 END AS "promedioOrden"
      FROM tm_tecnicos t
      LEFT JOIN tm_ordenes o ON o."tecnicoId" = t.id AND o."empresaId" = $1 ${fw}
      LEFT JOIN tm_orden_servicios s ON s."ordenId" = o.id AND s."empresaId" = $1
      WHERE t."empresaId" = $1 GROUP BY t.id, t.nombre ORDER BY ingresos DESC
    `, params);
  }

  async reporteServiciosMasSolicitados(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let fw = '';
    if (desde) { params.push(desde); fw += ` AND DATE(o."fechaIngreso") >= $${params.length}`; }
    if (hasta) { params.push(hasta); fw += ` AND DATE(o."fechaIngreso") <= $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT s.descripcion AS servicio, COUNT(*)::int AS veces,
             COALESCE(SUM(s.total),0)::numeric AS "ingresosTotal"
      FROM tm_orden_servicios s
      JOIN tm_ordenes o ON o.id = s."ordenId" AND o."empresaId" = $1 ${fw}
      WHERE s."empresaId" = $1
      GROUP BY s.descripcion ORDER BY veces DESC LIMIT 20
    `, params);
  }

  async reporteIngresos(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let fw = '';
    if (desde) { params.push(desde); fw += ` AND DATE("fechaIngreso") >= $${params.length}`; }
    if (hasta) { params.push(hasta); fw += ` AND DATE("fechaIngreso") <= $${params.length}`; }
    const [totales] = await this.ds.query<any[]>(`
      SELECT COALESCE(SUM("subtotalManoObra"),0)::numeric AS "manoObra",
             COALESCE(SUM("subtotalRepuestos"),0)::numeric AS repuestos,
             COALESCE(SUM(total),0)::numeric AS total,
             COUNT(*)::int AS ordenes
      FROM tm_ordenes WHERE "empresaId" = $1 AND estado != 'cancelado' ${fw}
    `, params);
    const porMes = await this.ds.query<any[]>(`
      SELECT TO_CHAR("fechaIngreso",'YYYY-MM') AS mes,
             COALESCE(SUM("subtotalManoObra"),0)::numeric AS "manoObra",
             COALESCE(SUM("subtotalRepuestos"),0)::numeric AS repuestos,
             COALESCE(SUM(total),0)::numeric AS total,
             COUNT(*)::int AS ordenes
      FROM tm_ordenes WHERE "empresaId" = $1 AND estado != 'cancelado' ${fw}
      GROUP BY mes ORDER BY mes
    `, params);
    return { totales, porMes };
  }

  async reporteVehiculosFrecuentes(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let fw = '';
    if (desde) { params.push(desde); fw += ` AND DATE(o."fechaIngreso") >= $${params.length}`; }
    if (hasta) { params.push(hasta); fw += ` AND DATE(o."fechaIngreso") <= $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT v.placa, v.marca, v.modelo, v.anio,
             COUNT(o.id)::int AS visitas,
             COALESCE(SUM(o.total),0)::numeric AS "gastoTotal"
      FROM tm_vehiculos v
      LEFT JOIN tm_ordenes o ON o."vehiculoId" = v.id AND o."empresaId" = $1 ${fw}
      WHERE v."empresaId" = $1
      GROUP BY v.id, v.placa, v.marca, v.modelo, v.anio
      HAVING COUNT(o.id) > 0
      ORDER BY visitas DESC LIMIT 20
    `, params);
  }
}
