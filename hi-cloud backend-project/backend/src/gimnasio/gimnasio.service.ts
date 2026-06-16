import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class GimnasioService {
  private readonly logger = new Logger(GimnasioService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  // ── helpers ─────────────────────────────────────────────────────────────────

  private async miembroOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM gm_miembros WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Miembro #${id} no encontrado`);
    return row;
  }

  private async membresiaOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM gm_membresias WHERE id=$1 AND "empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Membresía #${id} no encontrada`);
    return row;
  }

  private async siguienteNumero(empresaId: number, prefijo: string): Promise<string> {
    const [row] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`,
      [empresaId, prefijo],
    );
    return row?.num ?? `${prefijo}-001`;
  }

  // ── MIEMBROS ────────────────────────────────────────────────────────────────

  async getMiembros(empresaId: number, params: { search?: string; estado?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const offset = (page - 1) * limit;
    const conditions: string[] = [`m."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conditions.push(`m.estado=$${idx++}`); args.push(params.estado); }
    if (params.search) {
      conditions.push(`(m.nombre ILIKE $${idx} OR m.apellidos ILIKE $${idx} OR m.cedula ILIKE $${idx} OR m.numero ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    const where = conditions.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM gm_miembros m WHERE ${where}`, args);
    const rows = await this.ds.query(
      `SELECT m.*, mb.estado as estadoMembresia, mb."fechaFin", p.nombre as planActual
       FROM gm_miembros m
       LEFT JOIN LATERAL (
         SELECT mb2.estado, mb2."fechaFin", mb2."planId"
         FROM gm_membresias mb2
         WHERE mb2."miembroId"=m.id AND mb2.estado='activa'
         ORDER BY mb2."fechaFin" DESC LIMIT 1
       ) mb ON true
       LEFT JOIN gm_planes p ON p.id=mb."planId"
       WHERE ${where} ORDER BY m."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data: rows, total: Number(count), page, limit };
  }

  async getMiembro(id: number, empresaId: number) {
    return this.miembroOr404(empresaId, id);
  }

  async crearMiembro(data: any, empresaId: number) {
    const numero = await this.siguienteNumero(empresaId, 'MEM');
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_miembros ("empresaId",numero,nombre,apellidos,cedula,"fechaNacimiento",sexo,telefono,
        "telefonoEmergencia","contactoEmergencia",email,direccion,foto,"pesoInicial","tallaInicial","imcInicial",
        objetivo,"nivelFitness","condicionesMedicas",lesiones,medicamentos,"codigoAcceso",estado,"clienteId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [empresaId, numero, data.nombre, data.apellidos ?? null, data.cedula ?? null, data.fechaNacimiento ?? null,
       data.sexo ?? null, data.telefono ?? null, data.telefonoEmergencia ?? null, data.contactoEmergencia ?? null,
       data.email ?? null, data.direccion ?? null, data.foto ?? null, data.pesoInicial ?? null,
       data.tallaInicial ?? null, data.imcInicial ?? null, data.objetivo ?? null, data.nivelFitness ?? null,
       data.condicionesMedicas ?? null, data.lesiones ?? null, data.medicamentos ?? null,
       data.codigoAcceso ?? null, data.estado ?? 'activo', data.clienteId ?? null],
    );
    return row;
  }

  async actualizarMiembro(id: number, data: any, empresaId: number) {
    await this.miembroOr404(empresaId, id);
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    const allowed = ['nombre','apellidos','cedula','fechaNacimiento','sexo','telefono','telefonoEmergencia',
      'contactoEmergencia','email','direccion','foto','pesoInicial','tallaInicial','imcInicial','objetivo',
      'nivelFitness','condicionesMedicas','lesiones','medicamentos','codigoAcceso','estado','clienteId','isActive'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    fields.push(`"updatedAt"=NOW()`);
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE gm_miembros SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      args,
    );
    return row;
  }

  async getMiembroByQR(codigo: string, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM gm_miembros WHERE "codigoAcceso"=$1 AND "empresaId"=$2 AND "isActive"=true`,
      [codigo, empresaId],
    );
    if (!row) throw new NotFoundException('Miembro no encontrado');
    return row;
  }

  async getMiembroMembresiaActiva(miembroId: number, empresaId: number) {
    await this.miembroOr404(empresaId, miembroId);
    const hoy = new Date().toISOString().split('T')[0];
    const [row] = await this.ds.query<any[]>(
      `SELECT mb.*, p.nombre as planNombre FROM gm_membresias mb
       JOIN gm_planes p ON p.id=mb."planId"
       WHERE mb."miembroId"=$1 AND mb."empresaId"=$2 AND mb.estado='activa' AND mb."fechaFin">=$3
       ORDER BY mb."fechaFin" DESC LIMIT 1`,
      [miembroId, empresaId, hoy],
    );
    return row ?? null;
  }

  async getMiembroHistorialAccesos(miembroId: number, empresaId: number) {
    await this.miembroOr404(empresaId, miembroId);
    return this.ds.query<any[]>(
      `SELECT * FROM gm_accesos WHERE "miembroId"=$1 AND "empresaId"=$2 ORDER BY "fechaHora" DESC LIMIT 50`,
      [miembroId, empresaId],
    );
  }

  async getMiembroClasesReservadas(miembroId: number, empresaId: number) {
    await this.miembroOr404(empresaId, miembroId);
    return this.ds.query<any[]>(
      `SELECT r.*, s."horaInicio", s."horaFin", s."diaSemana", c.nombre as claseNombre
       FROM gm_reservas_clases r
       JOIN gm_schedule s ON s.id=r."scheduleId"
       JOIN gm_clases c ON c.id=s."claseId"
       WHERE r."miembroId"=$1 AND r."empresaId"=$2
       ORDER BY r.fecha DESC LIMIT 30`,
      [miembroId, empresaId],
    );
  }

  async getMiembroProgreso(miembroId: number, empresaId: number) {
    await this.miembroOr404(empresaId, miembroId);
    return this.ds.query<any[]>(
      `SELECT * FROM gm_progreso WHERE "miembroId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [miembroId, empresaId],
    );
  }

  async getMiembroRutinaActiva(miembroId: number, empresaId: number) {
    await this.miembroOr404(empresaId, miembroId);
    const [rutina] = await this.ds.query<any[]>(
      `SELECT r.*, e.nombre as entrenadorNombre FROM gm_rutinas r
       LEFT JOIN gm_entrenadores e ON e.id=r."entrenadorId"
       WHERE r."miembroId"=$1 AND r."empresaId"=$2 AND r.activa=true
       ORDER BY r."createdAt" DESC LIMIT 1`,
      [miembroId, empresaId],
    );
    if (!rutina) return null;
    return this.getRutinaCompleta(rutina, empresaId);
  }

  // ── PLANES ──────────────────────────────────────────────────────────────────

  async getPlanes(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM gm_planes WHERE "empresaId"=$1 ORDER BY precio`,
      [empresaId],
    );
  }

  async crearPlan(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_planes ("empresaId",nombre,descripcion,tipo,"duracionDias",precio,"precioInscripcion",moneda,
        "incluyeClases","limiteClasesMes","incluyeEntrenadorPersonal","sesionesEntrenadorMes","incluyeNutricion",
        "incluyeLocker","acceso24h","permiteCongelar","diasCongelamientoMax","renovacionAutomatica")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [empresaId, data.nombre, data.descripcion ?? null, data.tipo ?? null, data.duracionDias ?? 30,
       data.precio ?? 0, data.precioInscripcion ?? 0, data.moneda ?? 'DOP',
       data.incluyeClases ?? true, data.limiteClasesMes ?? null,
       data.incluyeEntrenadorPersonal ?? false, data.sesionesEntrenadorMes ?? 0,
       data.incluyeNutricion ?? false, data.incluyeLocker ?? false,
       data.acceso24h ?? false, data.permiteCongelar ?? true,
       data.diasCongelamientoMax ?? 15, data.renovacionAutomatica ?? true],
    );
    return row;
  }

  async actualizarPlan(id: number, data: any, empresaId: number) {
    const [plan] = await this.ds.query<any[]>(`SELECT id FROM gm_planes WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!plan) throw new NotFoundException(`Plan #${id} no encontrado`);
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    const allowed = ['nombre','descripcion','tipo','duracionDias','precio','precioInscripcion','moneda',
      'incluyeClases','limiteClasesMes','incluyeEntrenadorPersonal','sesionesEntrenadorMes','incluyeNutricion',
      'incluyeLocker','acceso24h','permiteCongelar','diasCongelamientoMax','renovacionAutomatica','isActive'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE gm_planes SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      args,
    );
    return row;
  }

  // ── MEMBRESÍAS ──────────────────────────────────────────────────────────────

  async getMembresias(empresaId: number, params: any) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const offset = (page - 1) * limit;
    const conditions: string[] = [`mb."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conditions.push(`mb.estado=$${idx++}`); args.push(params.estado); }
    if (params.miembroId) { conditions.push(`mb."miembroId"=$${idx++}`); args.push(params.miembroId); }
    const where = conditions.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM gm_membresias mb WHERE ${where}`, args);
    const rows = await this.ds.query(
      `SELECT mb.*, m.nombre as miembroNombre, m.apellidos as miembroApellidos, p.nombre as planNombre
       FROM gm_membresias mb
       JOIN gm_miembros m ON m.id=mb."miembroId"
       JOIN gm_planes p ON p.id=mb."planId"
       WHERE ${where} ORDER BY mb."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data: rows, total: Number(count), page, limit };
  }

  async getMembresia(id: number, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT mb.*, m.nombre as miembroNombre, p.nombre as planNombre
       FROM gm_membresias mb
       JOIN gm_miembros m ON m.id=mb."miembroId"
       JOIN gm_planes p ON p.id=mb."planId"
       WHERE mb.id=$1 AND mb."empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Membresía #${id} no encontrada`);
    return row;
  }

  async crearMembresia(data: any, empresaId: number) {
    await this.miembroOr404(empresaId, data.miembroId);
    const numero = await this.siguienteNumero(empresaId, 'MBR');
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_membresias ("empresaId",numero,"miembroId","planId","fechaInicio","fechaFin",
        precio,"precioInscripcion",descuento,total,estado,"renovacionDe","facturaId",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [empresaId, numero, data.miembroId, data.planId, data.fechaInicio, data.fechaFin,
       data.precio ?? 0, data.precioInscripcion ?? 0, data.descuento ?? 0, data.total ?? 0,
       data.estado ?? 'activa', data.renovacionDe ?? null, data.facturaId ?? null, data.notas ?? null],
    );
    // Activar miembro
    await this.ds.query(`UPDATE gm_miembros SET estado='activo', "updatedAt"=NOW() WHERE id=$1`, [data.miembroId]);
    return row;
  }

  async actualizarMembresia(id: number, data: any, empresaId: number) {
    await this.membresiaOr404(empresaId, id);
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    const allowed = ['fechaInicio','fechaFin','precio','precioInscripcion','descuento','total','estado','notas','facturaId'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE gm_membresias SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      args,
    );
    return row;
  }

  async renovarMembresia(id: number, empresaId: number) {
    const mem = await this.membresiaOr404(empresaId, id);
    const [plan] = await this.ds.query<any[]>(`SELECT * FROM gm_planes WHERE id=$1`, [mem.planId]);
    if (!plan) throw new BadRequestException('Plan no encontrado');
    const nuevaInicio = new Date(mem.fechaFin);
    nuevaInicio.setDate(nuevaInicio.getDate() + 1);
    const nuevaFin = new Date(nuevaInicio);
    nuevaFin.setDate(nuevaFin.getDate() + plan.duracionDias);
    const numero = await this.siguienteNumero(empresaId, 'MBR');
    const [nueva] = await this.ds.query<any[]>(
      `INSERT INTO gm_membresias ("empresaId",numero,"miembroId","planId","fechaInicio","fechaFin",
        precio,total,estado,"renovacionDe")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'activa',$9) RETURNING *`,
      [empresaId, numero, mem.miembroId, mem.planId,
       nuevaInicio.toISOString().split('T')[0], nuevaFin.toISOString().split('T')[0],
       plan.precio, plan.precio, id],
    );
    return nueva;
  }

  async congelarMembresia(id: number, data: any, empresaId: number) {
    const mem = await this.membresiaOr404(empresaId, id);
    if (mem.congelada) throw new BadRequestException('La membresía ya está congelada');
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_membresias SET congelada=true,"fechaCongelamiento"=CURRENT_DATE,"motivoCongelamiento"=$1
       WHERE id=$2 AND "empresaId"=$3 RETURNING *`,
      [data.motivo ?? null, id, empresaId],
    );
    return row;
  }

  async descongelarMembresia(id: number, empresaId: number) {
    const mem = await this.membresiaOr404(empresaId, id);
    if (!mem.congelada) throw new BadRequestException('La membresía no está congelada');
    const diasCongelados = Math.ceil((Date.now() - new Date(mem.fechaCongelamiento).getTime()) / 86400000);
    const nuevaFin = new Date(mem.fechaFin);
    nuevaFin.setDate(nuevaFin.getDate() + diasCongelados);
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_membresias SET congelada=false,"diasCongelados"="diasCongelados"+$1,"fechaFin"=$2,"fechaCongelamiento"=null
       WHERE id=$3 AND "empresaId"=$4 RETURNING *`,
      [diasCongelados, nuevaFin.toISOString().split('T')[0], id, empresaId],
    );
    return row;
  }

  async getMembresiasProximasVencer(empresaId: number) {
    const hoy = new Date().toISOString().split('T')[0];
    return this.ds.query<any[]>(
      `SELECT mb.*, m.nombre as miembroNombre, m.telefono, p.nombre as planNombre
       FROM gm_membresias mb
       JOIN gm_miembros m ON m.id=mb."miembroId"
       JOIN gm_planes p ON p.id=mb."planId"
       WHERE mb."empresaId"=$1 AND mb.estado='activa'
       AND mb."fechaFin" BETWEEN $2 AND ($2::date + INTERVAL '7 days')::date
       ORDER BY mb."fechaFin"`,
      [empresaId, hoy],
    );
  }

  // ── ENTRENADORES ─────────────────────────────────────────────────────────────

  async getEntrenadores(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM gm_entrenadores WHERE "empresaId"=$1 AND "isActive"=true ORDER BY nombre`,
      [empresaId],
    );
  }

  async crearEntrenador(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_entrenadores ("empresaId",nombre,apellidos,especialidad,certificaciones,foto,telefono,email,
        "tarifaSesion","tarifaMes",horario,"empleadoId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [empresaId, data.nombre, data.apellidos ?? null, data.especialidad ?? null, data.certificaciones ?? null,
       data.foto ?? null, data.telefono ?? null, data.email ?? null,
       data.tarifaSesion ?? 0, data.tarifaMes ?? 0,
       data.horario ? JSON.stringify(data.horario) : null, data.empleadoId ?? null],
    );
    return row;
  }

  async getEntrenadorAgenda(id: number, empresaId: number) {
    const [ent] = await this.ds.query<any[]>(`SELECT id FROM gm_entrenadores WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!ent) throw new NotFoundException(`Entrenador #${id} no encontrado`);
    const clases = await this.ds.query<any[]>(
      `SELECT s.*, c.nombre as claseNombre FROM gm_schedule s
       JOIN gm_clases c ON c.id=s."claseId"
       WHERE s."entrenadorId"=$1 AND s."empresaId"=$2 AND s."isActive"=true`,
      [id, empresaId],
    );
    const sesiones = await this.ds.query<any[]>(
      `SELECT se.*, m.nombre as miembroNombre FROM gm_sesiones_ep se
       JOIN gm_miembros m ON m.id=se."miembroId"
       WHERE se."entrenadorId"=$1 AND se."empresaId"=$2 AND se.estado='programada'
       ORDER BY se.fecha`,
      [id, empresaId],
    );
    return { clases, sesiones };
  }

  // ── CLASES Y SCHEDULE ───────────────────────────────────────────────────────

  async getClases(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT c.*, e.nombre as entrenadorNombre FROM gm_clases c
       LEFT JOIN gm_entrenadores e ON e.id=c."entrenadorId"
       WHERE c."empresaId"=$1 AND c."isActive"=true ORDER BY c.nombre`,
      [empresaId],
    );
  }

  async crearClase(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_clases ("empresaId",nombre,descripcion,tipo,categoria,"capacidadMaxima","duracionMinutos",
        "costoAdicional","entrenadorId","imagenUrl",color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [empresaId, data.nombre, data.descripcion ?? null, data.tipo ?? null, data.categoria ?? null,
       data.capacidadMaxima ?? 20, data.duracionMinutos ?? 60, data.costoAdicional ?? 0,
       data.entrenadorId ?? null, data.imagenUrl ?? null, data.color ?? '#1E3A8A'],
    );
    return row;
  }

  async getSchedule(empresaId: number, params: any) {
    const conditions: string[] = [`s."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.diaSemana !== undefined) { conditions.push(`s."diaSemana"=$${idx++}`); args.push(params.diaSemana); }
    if (params.claseId) { conditions.push(`s."claseId"=$${idx++}`); args.push(params.claseId); }
    const where = conditions.join(' AND ');
    return this.ds.query<any[]>(
      `SELECT s.*, c.nombre as claseNombre, c.color, e.nombre as entrenadorNombre
       FROM gm_schedule s
       JOIN gm_clases c ON c.id=s."claseId"
       LEFT JOIN gm_entrenadores e ON e.id=s."entrenadorId"
       WHERE ${where} AND s."isActive"=true ORDER BY s."diaSemana", s."horaInicio"`,
      args,
    );
  }

  async crearSchedule(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_schedule ("empresaId","claseId","entrenadorId","diaSemana","horaInicio","horaFin",sala,"fechaDesde","fechaHasta")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [empresaId, data.claseId, data.entrenadorId ?? null, data.diaSemana, data.horaInicio, data.horaFin,
       data.sala ?? null, data.fechaDesde ?? null, data.fechaHasta ?? null],
    );
    return row;
  }

  async getScheduleHoy(empresaId: number) {
    const diaSemana = new Date().getDay();
    return this.ds.query<any[]>(
      `SELECT s.*, c.nombre as claseNombre, c.color, c."capacidadMaxima", e.nombre as entrenadorNombre,
        (SELECT COUNT(*) FROM gm_reservas_clases r WHERE r."scheduleId"=s.id AND r.fecha=CURRENT_DATE AND r.estado!='cancelada') as reservas
       FROM gm_schedule s
       JOIN gm_clases c ON c.id=s."claseId"
       LEFT JOIN gm_entrenadores e ON e.id=s."entrenadorId"
       WHERE s."empresaId"=$1 AND s."diaSemana"=$2 AND s."isActive"=true
       ORDER BY s."horaInicio"`,
      [empresaId, diaSemana],
    );
  }

  async getScheduleAsistentes(scheduleId: number, fecha: string, empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT r.*, m.nombre as miembroNombre, m.foto FROM gm_reservas_clases r
       JOIN gm_miembros m ON m.id=r."miembroId"
       WHERE r."scheduleId"=$1 AND r.fecha=$2 AND r."empresaId"=$3`,
      [scheduleId, fecha, empresaId],
    );
  }

  // ── RESERVAS ────────────────────────────────────────────────────────────────

  async crearReserva(data: any, empresaId: number) {
    try {
      const [row] = await this.ds.query<any[]>(
        `INSERT INTO gm_reservas_clases ("empresaId","miembroId","scheduleId",fecha,estado)
         VALUES ($1,$2,$3,$4,'reservada') RETURNING *`,
        [empresaId, data.miembroId, data.scheduleId, data.fecha],
      );
      return row;
    } catch (err: any) {
      if (err?.code === '23505') throw new BadRequestException('Ya existe una reserva para este miembro en esta clase y fecha');
      this.logger.error('Error al crear reserva', err);
      throw err;
    }
  }

  async cancelarReserva(id: number, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_reservas_clases SET estado='cancelada' WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Reserva #${id} no encontrada`);
    return row;
  }

  async registrarAsistencia(id: number, estado: string, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_reservas_clases SET estado=$1 WHERE id=$2 AND "empresaId"=$3 RETURNING *`,
      [estado, id, empresaId],
    );
    if (!row) throw new NotFoundException(`Reserva #${id} no encontrada`);
    return row;
  }

  // ── SESIONES EP ─────────────────────────────────────────────────────────────

  async getSesionesEP(empresaId: number, params: any) {
    const conditions: string[] = [`se."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.miembroId) { conditions.push(`se."miembroId"=$${idx++}`); args.push(params.miembroId); }
    if (params.entrenadorId) { conditions.push(`se."entrenadorId"=$${idx++}`); args.push(params.entrenadorId); }
    if (params.estado) { conditions.push(`se.estado=$${idx++}`); args.push(params.estado); }
    const where = conditions.join(' AND ');
    return this.ds.query<any[]>(
      `SELECT se.*, m.nombre as miembroNombre, e.nombre as entrenadorNombre
       FROM gm_sesiones_ep se
       JOIN gm_miembros m ON m.id=se."miembroId"
       LEFT JOIN gm_entrenadores e ON e.id=se."entrenadorId"
       WHERE ${where} ORDER BY se.fecha DESC LIMIT 50`,
      args,
    );
  }

  async crearSesionEP(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_sesiones_ep ("empresaId","miembroId","entrenadorId","membresiaId",fecha,"duracionMinutos",tipo,estado,observaciones,"proximaSesion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [empresaId, data.miembroId, data.entrenadorId ?? null, data.membresiaId ?? null,
       data.fecha, data.duracionMinutos ?? 60, data.tipo ?? null,
       data.estado ?? 'programada', data.observaciones ?? null, data.proximaSesion ?? null],
    );
    return row;
  }

  async actualizarSesionEP(id: number, data: any, empresaId: number) {
    const [ses] = await this.ds.query<any[]>(`SELECT id FROM gm_sesiones_ep WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!ses) throw new NotFoundException(`Sesión #${id} no encontrada`);
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    const allowed = ['fecha','duracionMinutos','tipo','estado','observaciones','proximaSesion','pagado','facturaId'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE gm_sesiones_ep SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      args,
    );
    return row;
  }

  // ── RUTINAS ─────────────────────────────────────────────────────────────────

  async getRutinas(empresaId: number, miembroId?: number) {
    const conditions: string[] = [`r."empresaId"=$1`];
    const args: any[] = [empresaId];
    if (miembroId) { conditions.push(`r."miembroId"=$2`); args.push(miembroId); }
    return this.ds.query<any[]>(
      `SELECT r.*, m.nombre as miembroNombre, e.nombre as entrenadorNombre
       FROM gm_rutinas r
       JOIN gm_miembros m ON m.id=r."miembroId"
       LEFT JOIN gm_entrenadores e ON e.id=r."entrenadorId"
       WHERE ${conditions.join(' AND ')} ORDER BY r."createdAt" DESC`,
      args,
    );
  }

  private async getRutinaCompleta(rutina: any, empresaId: number) {
    const dias = await this.ds.query<any[]>(
      `SELECT * FROM gm_rutina_dias WHERE "rutinaId"=$1 AND "empresaId"=$2 AND "isActive"=true ORDER BY "numeroDia"`,
      [rutina.id, empresaId],
    );
    for (const dia of dias) {
      dia.ejercicios = await this.ds.query<any[]>(
        `SELECT * FROM gm_rutina_ejercicios WHERE "rutinaDiaId"=$1 AND "empresaId"=$2 ORDER BY orden`,
        [dia.id, empresaId],
      );
    }
    return { ...rutina, dias };
  }

  async getRutina(id: number, empresaId: number) {
    const [rutina] = await this.ds.query<any[]>(
      `SELECT r.*, m.nombre as miembroNombre, e.nombre as entrenadorNombre
       FROM gm_rutinas r
       JOIN gm_miembros m ON m.id=r."miembroId"
       LEFT JOIN gm_entrenadores e ON e.id=r."entrenadorId"
       WHERE r.id=$1 AND r."empresaId"=$2`,
      [id, empresaId],
    );
    if (!rutina) throw new NotFoundException(`Rutina #${id} no encontrada`);
    return this.getRutinaCompleta(rutina, empresaId);
  }

  async crearRutina(data: any, empresaId: number) {
    const [rutina] = await this.ds.query<any[]>(
      `INSERT INTO gm_rutinas ("empresaId","miembroId","entrenadorId",nombre,objetivo,"duracionSemanas",nivel,"diasSemana","fechaInicio","fechaFin",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [empresaId, data.miembroId, data.entrenadorId ?? null, data.nombre,
       data.objetivo ?? null, data.duracionSemanas ?? 4, data.nivel ?? null,
       data.diasSemana ?? 3, data.fechaInicio ?? null, data.fechaFin ?? null, data.notas ?? null],
    );
    // Crear días y ejercicios si vienen
    if (data.dias?.length) {
      for (const dia of data.dias) {
        const [diaRow] = await this.ds.query<any[]>(
          `INSERT INTO gm_rutina_dias ("empresaId","rutinaId","numeroDia",nombre,"grupoMuscular") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [empresaId, rutina.id, dia.numeroDia, dia.nombre ?? null, dia.grupoMuscular ?? null],
        );
        if (dia.ejercicios?.length) {
          for (let i = 0; i < dia.ejercicios.length; i++) {
            const ej = dia.ejercicios[i];
            await this.ds.query(
              `INSERT INTO gm_rutina_ejercicios ("empresaId","rutinaDiaId",nombre,"grupoMuscular",series,repeticiones,"descansoSegundos","pesoKg",notas,"videoUrl","imagenUrl",orden)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [empresaId, diaRow.id, ej.nombre, ej.grupoMuscular ?? null, ej.series ?? null,
               ej.repeticiones ?? null, ej.descansoSegundos ?? null, ej.pesoKg ?? null,
               ej.notas ?? null, ej.videoUrl ?? null, ej.imagenUrl ?? null, ej.orden ?? i],
            );
          }
        }
      }
    }
    return this.getRutinaCompleta(rutina, empresaId);
  }

  async actualizarRutina(id: number, data: any, empresaId: number) {
    const [rut] = await this.ds.query<any[]>(`SELECT id FROM gm_rutinas WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!rut) throw new NotFoundException(`Rutina #${id} no encontrada`);
    const fields: string[] = [];
    const args: any[] = [];
    let idx = 1;
    const allowed = ['nombre','objetivo','duracionSemanas','nivel','diasSemana','fechaInicio','fechaFin','activa','notas'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`"${key}"=$${idx++}`); args.push(data[key]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `UPDATE gm_rutinas SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *`,
      args,
    );
    return row;
  }

  // ── PROGRESO ────────────────────────────────────────────────────────────────

  async getProgreso(empresaId: number, miembroId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM gm_progreso WHERE "empresaId"=$1 AND "miembroId"=$2 ORDER BY fecha DESC`,
      [empresaId, miembroId],
    );
  }

  async crearProgreso(data: any, empresaId: number) {
    let imc = data.imc;
    if (!imc && data.peso && data.talla) {
      const tallaM = data.talla / 100;
      imc = +(data.peso / (tallaM * tallaM)).toFixed(2);
    }
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_progreso ("empresaId","miembroId","entrenadorId",fecha,peso,talla,imc,"grasaCorporal","masaMuscular",
        pecho,cintura,cadera,"brazoDerecho","brazoIzquierdo","musloDerecho","musloIzquierdo","fotoFrontal","fotoPerfil","fotoEspalda",observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [empresaId, data.miembroId, data.entrenadorId ?? null, data.fecha, data.peso ?? null, data.talla ?? null,
       imc ?? null, data.grasaCorporal ?? null, data.masaMuscular ?? null,
       data.pecho ?? null, data.cintura ?? null, data.cadera ?? null,
       data.brazoDerecho ?? null, data.brazoIzquierdo ?? null,
       data.musloDerecho ?? null, data.musloIzquierdo ?? null,
       data.fotoFrontal ?? null, data.fotoPerfil ?? null, data.fotoEspalda ?? null,
       data.observaciones ?? null],
    );
    return row;
  }

  async getProgresoGrafica(miembroId: number, empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT fecha, peso, imc, "grasaCorporal", "masaMuscular", cintura
       FROM gm_progreso WHERE "miembroId"=$1 AND "empresaId"=$2 ORDER BY fecha`,
      [miembroId, empresaId],
    );
  }

  // ── ACCESOS ─────────────────────────────────────────────────────────────────

  async registrarAcceso(codigo: string, empresaId: number) {
    const [miembro] = await this.ds.query<any[]>(
      `SELECT id, nombre, foto FROM gm_miembros WHERE "codigoAcceso"=$1 AND "empresaId"=$2 AND "isActive"=true`,
      [codigo, empresaId],
    );
    if (!miembro) {
      return { autorizado: false, motivo: 'Miembro no encontrado' };
    }
    const hoy = new Date().toISOString().split('T')[0];
    const [membresia] = await this.ds.query<any[]>(
      `SELECT m.id, m."fechaFin", p.nombre as plan
       FROM gm_membresias m JOIN gm_planes p ON p.id=m."planId"
       WHERE m."miembroId"=$1 AND m.estado='activa' AND m."fechaFin">=$2
       ORDER BY m."fechaFin" DESC LIMIT 1`,
      [miembro.id, hoy],
    );
    if (!membresia) {
      await this.ds.query(
        `INSERT INTO gm_accesos ("empresaId","miembroId",tipo,autorizado,"motivoRechazo") VALUES ($1,$2,'entrada',false,'Membresía vencida')`,
        [empresaId, miembro.id],
      );
      return { autorizado: false, motivo: 'Membresía vencida', miembro: { nombre: miembro.nombre } };
    }
    const diasRestantes = Math.ceil((new Date(membresia.fechaFin).getTime() - Date.now()) / 86400000);
    await this.ds.query(
      `INSERT INTO gm_accesos ("empresaId","miembroId","membresiaId",tipo,autorizado) VALUES ($1,$2,$3,'entrada',true)`,
      [empresaId, miembro.id, membresia.id],
    );
    return {
      autorizado: true,
      miembro: { nombre: miembro.nombre, foto: miembro.foto },
      membresia: { plan: membresia.plan, vence: membresia.fechaFin, diasRestantes },
      advertencia: diasRestantes <= 7 ? `Tu membresía vence en ${diasRestantes} días` : undefined,
    };
  }

  async getAccesosHoy(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT a.*, m.nombre as miembroNombre, m.foto
       FROM gm_accesos a JOIN gm_miembros m ON m.id=a."miembroId"
       WHERE a."empresaId"=$1 AND DATE(a."fechaHora")=CURRENT_DATE
       ORDER BY a."fechaHora" DESC`,
      [empresaId],
    );
  }

  async getAccesos(empresaId: number, params: any) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 50);
    const offset = (page - 1) * limit;
    const conditions: string[] = [`a."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.miembroId) { conditions.push(`a."miembroId"=$${idx++}`); args.push(params.miembroId); }
    if (params.fecha) { conditions.push(`DATE(a."fechaHora")=$${idx++}`); args.push(params.fecha); }
    if (params.autorizado !== undefined) { conditions.push(`a.autorizado=$${idx++}`); args.push(params.autorizado === 'true'); }
    const where = conditions.join(' AND ');
    const rows = await this.ds.query<any[]>(
      `SELECT a.*, m.nombre as miembroNombre FROM gm_accesos a
       JOIN gm_miembros m ON m.id=a."miembroId"
       WHERE ${where} ORDER BY a."fechaHora" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return rows;
  }

  // ── LOCKERS ─────────────────────────────────────────────────────────────────

  async getLockers(empresaId: number, estado?: string) {
    const conditions: string[] = [`"empresaId"=$1`, `"isActive"=true`];
    const args: any[] = [empresaId];
    if (estado) { conditions.push(`estado=$2`); args.push(estado); }
    return this.ds.query<any[]>(
      `SELECT l.*, m.nombre as miembroNombre FROM gm_lockers l
       LEFT JOIN gm_miembros m ON m.id=l."miembroId"
       WHERE ${conditions.join(' AND ')} ORDER BY l.numero`,
      args,
    );
  }

  async asignarLocker(data: any, empresaId: number) {
    const [locker] = await this.ds.query<any[]>(`SELECT * FROM gm_lockers WHERE id=$1 AND "empresaId"=$2`, [data.lockerId, empresaId]);
    if (!locker) throw new NotFoundException('Locker no encontrado');
    if (locker.estado !== 'disponible') throw new BadRequestException('El locker no está disponible');
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_lockers SET estado='ocupado',"miembroId"=$1,"fechaAsignacion"=CURRENT_DATE WHERE id=$2 AND "empresaId"=$3 RETURNING *`,
      [data.miembroId, data.lockerId, empresaId],
    );
    return row;
  }

  async liberarLocker(id: number, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_lockers SET estado='disponible',"miembroId"=null,"fechaAsignacion"=null WHERE id=$1 AND "empresaId"=$2 RETURNING *`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Locker #${id} no encontrado`);
    return row;
  }

  async createLocker(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_lockers ("empresaId", numero, area, "precioMes")
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [empresaId, data.numero, data.area ?? null, data.precioMes ?? 0],
    );
    return row;
  }

  async updateLocker(id: number, data: any, empresaId: number) {
    const fields: string[] = [];
    const args: any[] = [empresaId, id];
    if (data.numero    !== undefined) { fields.push(`numero=$${args.length + 1}`);      args.push(data.numero); }
    if (data.area      !== undefined) { fields.push(`area=$${args.length + 1}`);        args.push(data.area); }
    if (data.estado    !== undefined) { fields.push(`estado=$${args.length + 1}`);      args.push(data.estado); }
    if (data.precioMes !== undefined) { fields.push(`"precioMes"=$${args.length + 1}`); args.push(data.precioMes); }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_lockers SET ${fields.join(',')} WHERE "empresaId"=$1 AND id=$2 AND "isActive"=true RETURNING *`,
      args,
    );
    if (!row) throw new NotFoundException(`Locker #${id} no encontrado`);
    return row;
  }

  async deleteLocker(id: number, empresaId: number) {
    await this.ds.query(`UPDATE gm_lockers SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
  }

  // ── NUTRICION ────────────────────────────────────────────────────────────────

  async getPlanesNutricionales(empresaId: number, miembroId?: number) {
    const conditions: string[] = [`pn."empresaId"=$1`];
    const args: any[] = [empresaId];
    if (miembroId) { conditions.push(`pn."miembroId"=$2`); args.push(miembroId); }
    const planes = await this.ds.query<any[]>(
      `SELECT pn.*, m.nombre as miembroNombre, e.nombre as entrenadorNombre
       FROM gm_planes_nutricionales pn
       JOIN gm_miembros m ON m.id=pn."miembroId"
       LEFT JOIN gm_entrenadores e ON e.id=pn."entrenadorId"
       WHERE ${conditions.join(' AND ')} ORDER BY pn."createdAt" DESC`,
      args,
    );
    for (const plan of planes) {
      plan.comidas = await this.ds.query<any[]>(
        `SELECT * FROM gm_comidas WHERE "planNutricionalId"=$1 ORDER BY orden`,
        [plan.id],
      );
    }
    return planes;
  }

  async crearPlanNutricional(data: any, empresaId: number) {
    const [plan] = await this.ds.query<any[]>(
      `INSERT INTO gm_planes_nutricionales ("empresaId","miembroId","entrenadorId",nombre,objetivo,
        "caloriasObjetivo","proteinasGramos","carbohidratosGramos","grasasGramos","fechaInicio","fechaFin",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [empresaId, data.miembroId, data.entrenadorId ?? null, data.nombre, data.objetivo ?? null,
       data.caloriasObjetivo ?? null, data.proteinasGramos ?? null, data.carbohidratosGramos ?? null,
       data.grasasGramos ?? null, data.fechaInicio ?? null, data.fechaFin ?? null, data.notas ?? null],
    );
    if (data.comidas?.length) {
      for (let i = 0; i < data.comidas.length; i++) {
        const comida = data.comidas[i];
        await this.ds.query(
          `INSERT INTO gm_comidas ("empresaId","planNutricionalId",nombre,hora,alimentos,"caloriasTotal",orden)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [empresaId, plan.id, comida.nombre, comida.hora ?? null,
           comida.alimentos ? JSON.stringify(comida.alimentos) : null,
           comida.caloriasTotal ?? null, comida.orden ?? i],
        );
      }
    }
    plan.comidas = await this.ds.query<any[]>(`SELECT * FROM gm_comidas WHERE "planNutricionalId"=$1 ORDER BY orden`, [plan.id]);
    return plan;
  }

  // ── TIENDA ──────────────────────────────────────────────────────────────────

  async getProductosTienda(empresaId: number) {
    return this.ds.query<any[]>(
      `SELECT * FROM gm_productos_tienda WHERE "empresaId"=$1 AND "isActive"=true ORDER BY nombre`,
      [empresaId],
    );
  }

  async ventaTienda(data: any, empresaId: number) {
    const resultados: any[] = [];
    for (const item of (data.items ?? [])) {
      const [prod] = await this.ds.query<any[]>(`SELECT * FROM gm_productos_tienda WHERE id=$1 AND "empresaId"=$2`, [item.productoId, empresaId]);
      if (!prod) throw new NotFoundException(`Producto #${item.productoId} no encontrado`);
      if (prod.stock < item.cantidad) throw new BadRequestException(`Stock insuficiente para ${prod.nombre}`);
      await this.ds.query(`UPDATE gm_productos_tienda SET stock=stock-$1 WHERE id=$2`, [item.cantidad, item.productoId]);
      resultados.push({ producto: prod.nombre, cantidad: item.cantidad, total: prod.precio * item.cantidad });
    }
    return { ok: true, items: resultados };
  }

  async createProductoTienda(data: any, empresaId: number) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO gm_productos_tienda ("empresaId", nombre, descripcion, categoria, precio, stock)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [empresaId, data.nombre, data.descripcion ?? null, data.categoria ?? null, data.precio ?? 0, data.stock ?? 0],
    );
    return row;
  }

  async updateProductoTienda(id: number, data: any, empresaId: number) {
    const fields: string[] = [];
    const args: any[] = [empresaId, id];
    for (const [k, col] of Object.entries({ nombre: 'nombre', descripcion: 'descripcion', categoria: 'categoria', precio: 'precio', stock: 'stock' })) {
      if ((data as any)[k] !== undefined) { fields.push(`${col}=$${args.length + 1}`); args.push((data as any)[k]); }
    }
    if (!fields.length) throw new BadRequestException('Sin campos para actualizar');
    const [row] = await this.ds.query<any[]>(
      `UPDATE gm_productos_tienda SET ${fields.join(',')} WHERE "empresaId"=$1 AND id=$2 AND "isActive"=true RETURNING *`,
      args,
    );
    if (!row) throw new NotFoundException(`Producto #${id} no encontrado`);
    return row;
  }

  async deleteProductoTienda(id: number, empresaId: number) {
    await this.ds.query(`UPDATE gm_productos_tienda SET "isActive"=false WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────────

  async getDashboard(empresaId: number) {
    const hoy = new Date().toISOString().split('T')[0];
    const [miembrosActivos] = await this.ds.query<any[]>(
      `SELECT COUNT(*) FROM gm_miembros WHERE "empresaId"=$1 AND estado='activo'`,
      [empresaId],
    );
    const [entradasHoy] = await this.ds.query<any[]>(
      `SELECT COUNT(*) FROM gm_accesos WHERE "empresaId"=$1 AND DATE("fechaHora")=$2 AND autorizado=true`,
      [empresaId, hoy],
    );
    const [membresiasVencen] = await this.ds.query<any[]>(
      `SELECT COUNT(*) FROM gm_membresias WHERE "empresaId"=$1 AND estado='activa' AND "fechaFin" BETWEEN $2 AND ($2::date + INTERVAL '7 days')::date`,
      [empresaId, hoy],
    );
    const [clasesHoy] = await this.ds.query<any[]>(
      `SELECT COUNT(*) FROM gm_schedule WHERE "empresaId"=$1 AND "diaSemana"=$2 AND "isActive"=true`,
      [empresaId, new Date().getDay()],
    );
    const ultimosAccesos = await this.ds.query<any[]>(
      `SELECT a.*, m.nombre as miembroNombre, m.foto FROM gm_accesos a
       JOIN gm_miembros m ON m.id=a."miembroId"
       WHERE a."empresaId"=$1 ORDER BY a."fechaHora" DESC LIMIT 10`,
      [empresaId],
    );
    const membresiasAlerta = await this.ds.query<any[]>(
      `SELECT mb.*, m.nombre as miembroNombre, m.telefono, p.nombre as plan
       FROM gm_membresias mb JOIN gm_miembros m ON m.id=mb."miembroId" JOIN gm_planes p ON p.id=mb."planId"
       WHERE mb."empresaId"=$1 AND mb.estado='activa' AND mb."fechaFin" BETWEEN $2 AND ($2::date + INTERVAL '7 days')::date
       ORDER BY mb."fechaFin"`,
      [empresaId, hoy],
    );
    return {
      kpis: {
        miembrosActivos: Number(miembrosActivos.count),
        entradasHoy: Number(entradasHoy.count),
        membresiasVencen: Number(membresiasVencen.count),
        clasesHoy: Number(clasesHoy.count),
      },
      ultimosAccesos,
      membresiasAlerta,
    };
  }
}
