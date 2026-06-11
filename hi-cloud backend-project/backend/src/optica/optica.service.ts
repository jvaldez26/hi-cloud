import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { PreFacturaService } from '../pre-factura/pre-factura.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreatePacienteDto {
  nombre: string; apellido: string;
  cedula?: string; fechaNacimiento?: string; genero?: string;
  telefono?: string; email?: string; direccion?: string;
  ocupacion?: string; notas?: string;
}
export interface UpdatePacienteDto extends Partial<CreatePacienteDto> { isActive?: boolean; }

export interface CreateMedicoDto {
  nombre: string; apellido: string;
  especialidad?: string; exequatur?: string;
  telefono?: string; email?: string;
  direccion?: string; notas?: string;
}
export interface UpdateMedicoDto extends Partial<CreateMedicoDto> {}

export interface CreateCitaDto {
  pacienteId: number; medicoId?: number;
  fechaHora: string; duracionMinutos?: number;
  tipo?: string; motivoConsulta?: string; notas?: string;
}
export interface UpdateCitaDto extends Partial<Omit<CreateCitaDto, 'pacienteId'>> {
  estado?: string;
}

export interface CreateConsultaDto {
  pacienteId: number; medicoId?: number; citaId?: number;
  fecha: string; motivoConsulta?: string;
  agudezaVisualOD?: string; agudezaVisualOI?: string;
  presionOcularOD?: number; presionOcularOI?: number;
  hallazgos?: string; diagnostico?: string;
  tratamiento?: string; proximaCita?: string; notas?: string;
  costoConsulta?: number;
  avOdLejos?: string; avOiLejos?: string; avOdCerca?: string; avOiCerca?: string;
  refEsferaOD?: number; refCilindroOD?: number; refEjeOD?: number; refAdicionOD?: number;
  refEsferaOI?: number; refCilindroOI?: number; refEjeOI?: number; refAdicionOI?: number;
  observaciones?: string;
}
export interface UpdateConsultaDto extends Partial<Omit<CreateConsultaDto, 'pacienteId'>> {}

export interface CreateRecetaDto {
  pacienteId: number; medicoId?: number; consultaId?: number;
  fecha: string; tipo?: string;
  esferaOD?: number; cilindroOD?: number; ejeOD?: number; adicionOD?: number;
  esferaOI?: number; cilindroOI?: number; ejeOI?: number; adicionOI?: number;
  dipLejos?: number; dipCerca?: number;
  marcaContacto?: string; tipoContacto?: string;
  instrucciones?: string; vigenciaAnos?: number; notas?: string;
}
export interface UpdateRecetaDto extends Partial<Omit<CreateRecetaDto, 'pacienteId'>> {}

export interface CreateOrdenTrabajoDto {
  pacienteId: number; recetaId?: number; fecha: string;
  tipoLente?: string; materialLente?: string; tratamientoLente?: string;
  tipoMontura?: string; colorMontura?: string; marcaMontura?: string; modeloMontura?: string;
  laboratorio?: string;
  subtotal?: number; itbis?: number; total?: number; abono?: number;
  notas?: string; observaciones?: string; fechaEntrega?: string;
}
export interface UpdateOrdenTrabajoDto extends Partial<Omit<CreateOrdenTrabajoDto, 'pacienteId'>> {
  estado?: string; facturaId?: number; balance?: number;
}

export interface CreateReclamacionArsDto {
  pacienteId: number; arsNombre: string; arsNumeroAfiliado?: string;
  arsNumeroAutorizacion?: string;
  consultaId?: number; recetaId?: number; ordenTrabajoId?: number;
  fecha: string;
  montoReclamado?: number; montoCubierto?: number; montoPaciente?: number;
  observaciones?: string;
}
export interface UpdateReclamacionArsDto extends Partial<Omit<CreateReclamacionArsDto, 'pacienteId' | 'arsNombre'>> {
  estado?: string; motivoRechazo?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OpticaService {
  private readonly logger = new Logger(OpticaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly preFacturaSvc: PreFacturaService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  private async pacienteOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_pacientes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Paciente #${id} no encontrado`);
    return row;
  }

  private async medicoOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_medicos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Médico #${id} no encontrado`);
    return row;
  }

  private async citaOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_citas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Cita #${id} no encontrada`);
    return row;
  }

  private async consultaOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_consultas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Consulta #${id} no encontrada`);
    return row;
  }

  private async recetaOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_recetas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Receta #${id} no encontrada`);
    return row;
  }

  private async otOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_ordenes_trabajo WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Orden de trabajo #${id} no encontrada`);
    return row;
  }

  private async arsOr404(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM op_reclamaciones_ars WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Reclamación ARS #${id} no encontrada`);
    return row;
  }

  // ── PACIENTES ──────────────────────────────────────────────────────────────

  async listarPacientes(page = 1, limit = 20, search?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1 AND "isActive" = true`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (nombre ILIKE $${params.length} OR apellido ILIKE $${params.length} OR cedula ILIKE $${params.length})`;
    }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_pacientes ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT id, "empresaId", nombre, apellido, cedula, "fechaNacimiento", genero,
              telefono, email, direccion, ocupacion, notas, "isActive", "createdAt", "updatedAt"
       FROM op_pacientes ${where}
       ORDER BY apellido, nombre
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearPaciente(dto: CreatePacienteDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_pacientes
         ("empresaId", nombre, apellido, cedula, "fechaNacimiento", genero,
          telefono, email, direccion, ocupacion, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [empresaId, dto.nombre, dto.apellido,
       dto.cedula ?? null, dto.fechaNacimiento ?? null, dto.genero ?? null,
       dto.telefono ?? null, dto.email ?? null, dto.direccion ?? null,
       dto.ocupacion ?? null, dto.notas ?? null],
    );
    return row;
  }

  async obtenerPaciente(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.pacienteOr404(empresaId, id);
  }

  async actualizarPaciente(id: number, dto: UpdatePacienteDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.pacienteOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.nombre !== undefined)          add('nombre', dto.nombre);
    if (dto.apellido !== undefined)        add('apellido', dto.apellido);
    if (dto.cedula !== undefined)          add('cedula', dto.cedula);
    if (dto.fechaNacimiento !== undefined) add('fechaNacimiento', dto.fechaNacimiento);
    if (dto.genero !== undefined)          add('genero', dto.genero);
    if (dto.telefono !== undefined)        add('telefono', dto.telefono);
    if (dto.email !== undefined)           add('email', dto.email);
    if (dto.direccion !== undefined)       add('direccion', dto.direccion);
    if (dto.ocupacion !== undefined)       add('ocupacion', dto.ocupacion);
    if (dto.notas !== undefined)           add('notas', dto.notas);
    if (dto.isActive !== undefined)        add('isActive', dto.isActive);
    if (!sets.length) return this.pacienteOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_pacientes SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  async eliminarPaciente(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.pacienteOr404(empresaId, id);
    await this.ds.query(
      `UPDATE op_pacientes SET "isActive" = false, "updatedAt" = NOW()
       WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    return { message: 'Paciente eliminado' };
  }

  // ── MÉDICOS ────────────────────────────────────────────────────────────────

  async listarMedicos() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM op_medicos WHERE "empresaId" = $1 AND "isActive" = true ORDER BY apellido, nombre`,
      [empresaId],
    );
  }

  async crearMedico(dto: CreateMedicoDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_medicos
         ("empresaId", nombre, apellido, especialidad, exequatur, telefono, email, direccion, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [empresaId, dto.nombre, dto.apellido,
       dto.especialidad ?? 'Optometría', dto.exequatur ?? null,
       dto.telefono ?? null, dto.email ?? null,
       dto.direccion ?? null, dto.notas ?? null],
    );
    return row;
  }

  async obtenerMedico(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.medicoOr404(empresaId, id);
  }

  async actualizarMedico(id: number, dto: UpdateMedicoDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.medicoOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.nombre !== undefined)       add('nombre', dto.nombre);
    if (dto.apellido !== undefined)     add('apellido', dto.apellido);
    if (dto.especialidad !== undefined) add('especialidad', dto.especialidad);
    if (dto.exequatur !== undefined)    add('exequatur', dto.exequatur);
    if (dto.telefono !== undefined)     add('telefono', dto.telefono);
    if (dto.email !== undefined)        add('email', dto.email);
    if (dto.direccion !== undefined)    add('direccion', dto.direccion);
    if (dto.notas !== undefined)        add('notas', dto.notas);
    if (!sets.length) return this.medicoOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_medicos SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  async eliminarMedico(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.medicoOr404(empresaId, id);
    await this.ds.query(
      `UPDATE op_medicos SET "isActive" = false, "updatedAt" = NOW()
       WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    return { message: 'Médico eliminado' };
  }

  // ── CITAS ──────────────────────────────────────────────────────────────────

  async listarCitas(page = 1, limit = 20, estado?: string, medicoId?: number, pacienteId?: number, fecha?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId" = $1`;
    if (estado)     { params.push(estado);     where += ` AND c.estado = $${params.length}`; }
    if (medicoId)   { params.push(medicoId);   where += ` AND c."medicoId" = $${params.length}`; }
    if (pacienteId) { params.push(pacienteId); where += ` AND c."pacienteId" = $${params.length}`; }
    if (fecha)      { params.push(fecha);      where += ` AND c."fechaHora"::date = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_citas c ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT c.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_citas c
       LEFT JOIN op_pacientes p ON p.id = c."pacienteId" AND p."empresaId" = c."empresaId"
       LEFT JOIN op_medicos   m ON m.id = c."medicoId"   AND m."empresaId" = c."empresaId"
       ${where}
       ORDER BY c."fechaHora" DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearCita(dto: CreateCitaDto, userId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'op_citas', 'numero', '^CIT-[0-9]+$', 'CIT-', 1, empresaId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_citas
         ("empresaId", numero, "pacienteId", "medicoId", "fechaHora",
          "duracionMinutos", tipo, estado, "motivoConsulta", notas, "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [empresaId, numero, dto.pacienteId, dto.medicoId ?? null,
       dto.fechaHora, dto.duracionMinutos ?? 30,
       dto.tipo ?? 'consulta', 'programada',
       dto.motivoConsulta ?? null, dto.notas ?? null, userId],
    );
    return row;
  }

  async obtenerCita(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `SELECT c.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_citas c
       LEFT JOIN op_pacientes p ON p.id = c."pacienteId" AND p."empresaId" = c."empresaId"
       LEFT JOIN op_medicos   m ON m.id = c."medicoId"   AND m."empresaId" = c."empresaId"
       WHERE c.id = $1 AND c."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Cita #${id} no encontrada`);
    return row;
  }

  async actualizarCita(id: number, dto: UpdateCitaDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.citaOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.medicoId !== undefined)        add('medicoId', dto.medicoId);
    if (dto.fechaHora !== undefined)       add('fechaHora', dto.fechaHora);
    if (dto.duracionMinutos !== undefined) add('duracionMinutos', dto.duracionMinutos);
    if (dto.tipo !== undefined)            add('tipo', dto.tipo);
    if (dto.estado !== undefined)          add('estado', dto.estado);
    if (dto.motivoConsulta !== undefined)  add('motivoConsulta', dto.motivoConsulta);
    if (dto.notas !== undefined)           add('notas', dto.notas);
    if (!sets.length) return this.citaOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_citas SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  // ── CONSULTAS ──────────────────────────────────────────────────────────────

  async listarConsultas(page = 1, limit = 20, pacienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId" = $1`;
    if (pacienteId) { params.push(pacienteId); where += ` AND c."pacienteId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_consultas c ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT c.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_consultas c
       LEFT JOIN op_pacientes p ON p.id = c."pacienteId" AND p."empresaId" = c."empresaId"
       LEFT JOIN op_medicos   m ON m.id = c."medicoId"   AND m."empresaId" = c."empresaId"
       ${where} ORDER BY c.fecha DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearConsulta(dto: CreateConsultaDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'op_consultas', 'numero', '^CONS-[0-9]+$', 'CONS-', 1, empresaId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_consultas
         ("empresaId", numero, "pacienteId", "medicoId", "citaId", fecha,
          "motivoConsulta", "agudezaVisualOD", "agudezaVisualOI",
          "presionOcularOD", "presionOcularOI",
          hallazgos, diagnostico, tratamiento, "proximaCita", notas,
          "costoConsulta", "avOdLejos", "avOiLejos", "avOdCerca", "avOiCerca",
          "refEsferaOD", "refCilindroOD", "refEjeOD", "refAdicionOD",
          "refEsferaOI", "refCilindroOI", "refEjeOI", "refAdicionOI",
          observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`,
      [empresaId, numero, dto.pacienteId, dto.medicoId ?? null, dto.citaId ?? null,
       dto.fecha, dto.motivoConsulta ?? null,
       dto.agudezaVisualOD ?? null, dto.agudezaVisualOI ?? null,
       dto.presionOcularOD ?? null, dto.presionOcularOI ?? null,
       dto.hallazgos ?? null, dto.diagnostico ?? null, dto.tratamiento ?? null,
       dto.proximaCita ?? null, dto.notas ?? null,
       dto.costoConsulta ?? 0, dto.avOdLejos ?? null, dto.avOiLejos ?? null,
       dto.avOdCerca ?? null, dto.avOiCerca ?? null,
       dto.refEsferaOD ?? null, dto.refCilindroOD ?? null, dto.refEjeOD ?? null, dto.refAdicionOD ?? null,
       dto.refEsferaOI ?? null, dto.refCilindroOI ?? null, dto.refEjeOI ?? null, dto.refAdicionOI ?? null,
       dto.observaciones ?? null],
    );
    // Si viene de una cita, marcarla como completada
    if (dto.citaId) {
      await this.ds.query(
        `UPDATE op_citas SET estado = 'completada', "updatedAt" = NOW()
         WHERE id = $1 AND "empresaId" = $2`,
        [dto.citaId, empresaId],
      ).catch(err => this.logger.error(`Error actualizando cita #${dto.citaId}: ${err.message}`, err.stack));
    }
    return row;
  }

  async obtenerConsulta(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `SELECT c.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_consultas c
       LEFT JOIN op_pacientes p ON p.id = c."pacienteId" AND p."empresaId" = c."empresaId"
       LEFT JOIN op_medicos   m ON m.id = c."medicoId"   AND m."empresaId" = c."empresaId"
       WHERE c.id = $1 AND c."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Consulta #${id} no encontrada`);
    return row;
  }

  async actualizarConsulta(id: number, dto: UpdateConsultaDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.consultaOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.medicoId !== undefined)        add('medicoId', dto.medicoId);
    if (dto.fecha !== undefined)           add('fecha', dto.fecha);
    if (dto.motivoConsulta !== undefined)  add('motivoConsulta', dto.motivoConsulta);
    if (dto.agudezaVisualOD !== undefined) add('agudezaVisualOD', dto.agudezaVisualOD);
    if (dto.agudezaVisualOI !== undefined) add('agudezaVisualOI', dto.agudezaVisualOI);
    if (dto.presionOcularOD !== undefined) add('presionOcularOD', dto.presionOcularOD);
    if (dto.presionOcularOI !== undefined) add('presionOcularOI', dto.presionOcularOI);
    if (dto.hallazgos !== undefined)       add('hallazgos', dto.hallazgos);
    if (dto.diagnostico !== undefined)     add('diagnostico', dto.diagnostico);
    if (dto.tratamiento !== undefined)     add('tratamiento', dto.tratamiento);
    if (dto.proximaCita !== undefined)     add('proximaCita', dto.proximaCita);
    if (dto.notas !== undefined)           add('notas', dto.notas);
    if (dto.costoConsulta !== undefined)   add('costoConsulta', dto.costoConsulta);
    if (dto.avOdLejos !== undefined)       add('avOdLejos', dto.avOdLejos);
    if (dto.avOiLejos !== undefined)       add('avOiLejos', dto.avOiLejos);
    if (dto.avOdCerca !== undefined)       add('avOdCerca', dto.avOdCerca);
    if (dto.avOiCerca !== undefined)       add('avOiCerca', dto.avOiCerca);
    if (dto.refEsferaOD !== undefined)     add('refEsferaOD', dto.refEsferaOD);
    if (dto.refCilindroOD !== undefined)   add('refCilindroOD', dto.refCilindroOD);
    if (dto.refEjeOD !== undefined)        add('refEjeOD', dto.refEjeOD);
    if (dto.refAdicionOD !== undefined)    add('refAdicionOD', dto.refAdicionOD);
    if (dto.refEsferaOI !== undefined)     add('refEsferaOI', dto.refEsferaOI);
    if (dto.refCilindroOI !== undefined)   add('refCilindroOI', dto.refCilindroOI);
    if (dto.refEjeOI !== undefined)        add('refEjeOI', dto.refEjeOI);
    if (dto.refAdicionOI !== undefined)    add('refAdicionOI', dto.refAdicionOI);
    if (dto.observaciones !== undefined)   add('observaciones', dto.observaciones);
    if (!sets.length) return this.consultaOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_consultas SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  // ── RECETAS ────────────────────────────────────────────────────────────────

  async listarRecetas(page = 1, limit = 20, pacienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE r."empresaId" = $1`;
    if (pacienteId) { params.push(pacienteId); where += ` AND r."pacienteId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_recetas r ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT r.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_recetas r
       LEFT JOIN op_pacientes p ON p.id = r."pacienteId" AND p."empresaId" = r."empresaId"
       LEFT JOIN op_medicos   m ON m.id = r."medicoId"   AND m."empresaId" = r."empresaId"
       ${where} ORDER BY r.fecha DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearReceta(dto: CreateRecetaDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'op_recetas', 'numero', '^ROPT-[0-9]+$', 'ROPT-', 1, empresaId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_recetas
         ("empresaId", numero, "pacienteId", "medicoId", "consultaId", fecha, tipo,
          "esferaOD","cilindroOD","ejeOD","adicionOD",
          "esferaOI","cilindroOI","ejeOI","adicionOI",
          "dipLejos","dipCerca","marcaContacto","tipoContacto",
          instrucciones,"vigenciaAnos",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [empresaId, numero, dto.pacienteId, dto.medicoId ?? null, dto.consultaId ?? null,
       dto.fecha, dto.tipo ?? 'lentes',
       dto.esferaOD ?? null, dto.cilindroOD ?? null, dto.ejeOD ?? null, dto.adicionOD ?? null,
       dto.esferaOI ?? null, dto.cilindroOI ?? null, dto.ejeOI ?? null, dto.adicionOI ?? null,
       dto.dipLejos ?? null, dto.dipCerca ?? null,
       dto.marcaContacto ?? null, dto.tipoContacto ?? null,
       dto.instrucciones ?? null, dto.vigenciaAnos ?? 1, dto.notas ?? null],
    );
    return row;
  }

  async obtenerReceta(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `SELECT r.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_recetas r
       LEFT JOIN op_pacientes p ON p.id = r."pacienteId" AND p."empresaId" = r."empresaId"
       LEFT JOIN op_medicos   m ON m.id = r."medicoId"   AND m."empresaId" = r."empresaId"
       WHERE r.id = $1 AND r."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Receta #${id} no encontrada`);
    return row;
  }

  async actualizarReceta(id: number, dto: UpdateRecetaDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.recetaOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.medicoId !== undefined)     add('medicoId', dto.medicoId);
    if (dto.fecha !== undefined)        add('fecha', dto.fecha);
    if (dto.tipo !== undefined)         add('tipo', dto.tipo);
    if (dto.esferaOD !== undefined)     add('esferaOD', dto.esferaOD);
    if (dto.cilindroOD !== undefined)   add('cilindroOD', dto.cilindroOD);
    if (dto.ejeOD !== undefined)        add('ejeOD', dto.ejeOD);
    if (dto.adicionOD !== undefined)    add('adicionOD', dto.adicionOD);
    if (dto.esferaOI !== undefined)     add('esferaOI', dto.esferaOI);
    if (dto.cilindroOI !== undefined)   add('cilindroOI', dto.cilindroOI);
    if (dto.ejeOI !== undefined)        add('ejeOI', dto.ejeOI);
    if (dto.adicionOI !== undefined)    add('adicionOI', dto.adicionOI);
    if (dto.dipLejos !== undefined)     add('dipLejos', dto.dipLejos);
    if (dto.dipCerca !== undefined)     add('dipCerca', dto.dipCerca);
    if (dto.marcaContacto !== undefined) add('marcaContacto', dto.marcaContacto);
    if (dto.tipoContacto !== undefined) add('tipoContacto', dto.tipoContacto);
    if (dto.instrucciones !== undefined) add('instrucciones', dto.instrucciones);
    if (dto.vigenciaAnos !== undefined) add('vigenciaAnos', dto.vigenciaAnos);
    if (dto.notas !== undefined)        add('notas', dto.notas);
    if (!sets.length) return this.recetaOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_recetas SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  // ── ÓRDENES DE TRABAJO ─────────────────────────────────────────────────────

  async listarOrdenesTrabajo(page = 1, limit = 20, estado?: string, pacienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE ot."empresaId" = $1`;
    if (estado)     { params.push(estado);     where += ` AND ot.estado = $${params.length}`; }
    if (pacienteId) { params.push(pacienteId); where += ` AND ot."pacienteId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_ordenes_trabajo ot ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT ot.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre"
       FROM op_ordenes_trabajo ot
       LEFT JOIN op_pacientes p ON p.id = ot."pacienteId" AND p."empresaId" = ot."empresaId"
       ${where} ORDER BY ot.fecha DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearOrdenTrabajo(dto: CreateOrdenTrabajoDto, userId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'op_ordenes_trabajo', 'numero', '^OT-[0-9]+$', 'OT-', 1, empresaId);
    const subtotal = dto.subtotal ?? 0;
    const itbis    = dto.itbis ?? 0;
    const total    = dto.total ?? subtotal + itbis;
    const abono    = dto.abono ?? 0;
    const balance  = total - abono;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_ordenes_trabajo
         ("empresaId", numero, "pacienteId", "recetaId", fecha, estado,
          "tipoLente","materialLente","tratamientoLente",
          "tipoMontura","colorMontura","marcaMontura","modeloMontura",
          laboratorio,
          subtotal, itbis, total, abono, balance,
          notas, observaciones, "fechaEntrega", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [empresaId, numero, dto.pacienteId, dto.recetaId ?? null,
       dto.fecha, 'pendiente',
       dto.tipoLente ?? null, dto.materialLente ?? null, dto.tratamientoLente ?? null,
       dto.tipoMontura ?? null, dto.colorMontura ?? null, dto.marcaMontura ?? null, dto.modeloMontura ?? null,
       dto.laboratorio ?? null,
       subtotal, itbis, total, abono, balance,
       dto.notas ?? null, dto.observaciones ?? null, dto.fechaEntrega ?? null, userId],
    );
    return row;
  }

  async obtenerOrdenTrabajo(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `SELECT ot.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre"
       FROM op_ordenes_trabajo ot
       LEFT JOIN op_pacientes p ON p.id = ot."pacienteId" AND p."empresaId" = ot."empresaId"
       WHERE ot.id = $1 AND ot."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Orden de trabajo #${id} no encontrada`);
    return row;
  }

  async actualizarOrdenTrabajo(id: number, dto: UpdateOrdenTrabajoDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.otOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.estado !== undefined)           add('estado', dto.estado);
    if (dto.tipoLente !== undefined)        add('tipoLente', dto.tipoLente);
    if (dto.materialLente !== undefined)    add('materialLente', dto.materialLente);
    if (dto.tratamientoLente !== undefined) add('tratamientoLente', dto.tratamientoLente);
    if (dto.tipoMontura !== undefined)      add('tipoMontura', dto.tipoMontura);
    if (dto.colorMontura !== undefined)     add('colorMontura', dto.colorMontura);
    if (dto.marcaMontura !== undefined)     add('marcaMontura', dto.marcaMontura);
    if (dto.modeloMontura !== undefined)    add('modeloMontura', dto.modeloMontura);
    if (dto.laboratorio !== undefined)      add('laboratorio', dto.laboratorio);
    if (dto.subtotal !== undefined)         add('subtotal', dto.subtotal);
    if (dto.itbis !== undefined)            add('itbis', dto.itbis);
    if (dto.total !== undefined)            add('total', dto.total);
    if (dto.abono !== undefined)            add('abono', dto.abono);
    if (dto.balance !== undefined)          add('balance', dto.balance);
    if (dto.facturaId !== undefined)        add('facturaId', dto.facturaId);
    if (dto.notas !== undefined)            add('notas', dto.notas);
    if (dto.observaciones !== undefined)    add('observaciones', dto.observaciones);
    if (dto.fechaEntrega !== undefined)     add('fechaEntrega', dto.fechaEntrega);
    if (!sets.length) return this.otOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_ordenes_trabajo SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  async entregarOrdenTrabajo(id: number, dto: { montoCobrado: number; metodoPago: string; notas?: string }) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const ot = await this.otOr404(empresaId, id);
    if (ot.estado === 'entregada') throw new BadRequestException('Esta orden ya fue entregada');
    if (ot.estado === 'cancelada') throw new BadRequestException('No se puede entregar una orden cancelada');
    const balance = Number(ot.balance ?? 0);
    if (dto.montoCobrado < balance) {
      throw new BadRequestException(
        `El monto cobrado (${dto.montoCobrado}) es menor al saldo pendiente (${balance})`,
      );
    }
    const nuevoBalance = Math.max(0, balance - dto.montoCobrado);
    const nuevoAbono   = Number(ot.abono ?? 0) + dto.montoCobrado;
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_ordenes_trabajo
       SET estado = 'entregada', "fechaEntrega" = NOW()::date,
           abono = $1, balance = $2, "updatedAt" = NOW()
       WHERE id = $3 AND "empresaId" = $4 RETURNING *`,
      [nuevoAbono, nuevoBalance, id, empresaId],
    );
    return { ...row, montoCobrado: dto.montoCobrado, metodoPago: dto.metodoPago };
  }

  // ── RECLAMACIONES ARS ──────────────────────────────────────────────────────

  async listarReclamacionesArs(page = 1, limit = 20, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE a."empresaId" = $1`;
    if (estado) { params.push(estado); where += ` AND a.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM op_reclamaciones_ars a ${where}`, params,
    );
    const data = await this.ds.query<any[]>(
      `SELECT a.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre"
       FROM op_reclamaciones_ars a
       LEFT JOIN op_pacientes p ON p.id = a."pacienteId" AND p."empresaId" = a."empresaId"
       ${where} ORDER BY a.fecha DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearReclamacionArs(dto: CreateReclamacionArsDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'op_reclamaciones_ars', 'numero', '^ARS-[0-9]+$', 'ARS-', 1, empresaId);
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_reclamaciones_ars
         ("empresaId", numero, "pacienteId", "arsNombre", "arsNumeroAfiliado",
          "arsNumeroAutorizacion",
          "consultaId","recetaId","ordenTrabajoId",fecha,estado,
          "montoReclamado","montoCubierto","montoPaciente",observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, numero, dto.pacienteId, dto.arsNombre, dto.arsNumeroAfiliado ?? null,
       dto.arsNumeroAutorizacion ?? null,
       dto.consultaId ?? null, dto.recetaId ?? null, dto.ordenTrabajoId ?? null,
       dto.fecha, 'borrador',
       dto.montoReclamado ?? 0, dto.montoCubierto ?? 0, dto.montoPaciente ?? 0,
       dto.observaciones ?? null],
    );
    return row;
  }

  async obtenerReclamacionArs(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `SELECT a.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre"
       FROM op_reclamaciones_ars a
       LEFT JOIN op_pacientes p ON p.id = a."pacienteId" AND p."empresaId" = a."empresaId"
       WHERE a.id = $1 AND a."empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Reclamación ARS #${id} no encontrada`);
    return row;
  }

  async actualizarReclamacionArs(id: number, dto: UpdateReclamacionArsDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.arsOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.arsNumeroAfiliado !== undefined)      add('arsNumeroAfiliado', dto.arsNumeroAfiliado);
    if (dto.arsNumeroAutorizacion !== undefined)  add('arsNumeroAutorizacion', dto.arsNumeroAutorizacion);
    if (dto.consultaId !== undefined)             add('consultaId', dto.consultaId);
    if (dto.recetaId !== undefined)          add('recetaId', dto.recetaId);
    if (dto.ordenTrabajoId !== undefined)    add('ordenTrabajoId', dto.ordenTrabajoId);
    if (dto.fecha !== undefined)             add('fecha', dto.fecha);
    if (dto.estado !== undefined)            add('estado', dto.estado);
    if (dto.montoReclamado !== undefined)    add('montoReclamado', dto.montoReclamado);
    if (dto.montoCubierto !== undefined)     add('montoCubierto', dto.montoCubierto);
    if (dto.montoPaciente !== undefined)     add('montoPaciente', dto.montoPaciente);
    if (dto.motivoRechazo !== undefined)     add('motivoRechazo', dto.motivoRechazo);
    if (dto.observaciones !== undefined)     add('observaciones', dto.observaciones);
    if (!sets.length) return this.arsOr404(empresaId, id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_reclamaciones_ars SET ${sets.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  // ── FACTURACIÓN ───────────────────────────────────────────────────────────

  async facturarOrdenTrabajo(id: number, clienteId: number, usuarioId: number, tipoNcf?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [ot] = await this.ds.query<any[]>(
      `SELECT ot.*,
              p.nombre || ' ' || p.apellido AS "pacienteNombre"
       FROM op_ordenes_trabajo ot
       LEFT JOIN op_pacientes p ON p.id = ot."pacienteId" AND p."empresaId" = ot."empresaId"
       WHERE ot.id = $1 AND ot."empresaId" = $2`,
      [id, empresaId],
    );
    if (!ot) throw new NotFoundException(`Orden de trabajo #${id} no encontrada`);

    // Construir ítems de la pre-factura a partir de los datos de la OT
    const detalles: any[] = [];
    if (ot.tipoLente || ot.materialLente) {
      detalles.push({
        descripcion:    `Lentes${ot.tipoLente ? ` ${ot.tipoLente}` : ''}${ot.materialLente ? ` (${ot.materialLente})` : ''}${ot.tratamientoLente ? ` — ${ot.tratamientoLente}` : ''}`,
        cantidad:       1,
        precioUnitario: Number(ot.subtotal ?? ot.total ?? 0),
        porcentajeIva:  0,
      });
    }
    if ((ot.marcaMontura || ot.tipoMontura) && !detalles.length) {
      detalles.push({
        descripcion:    `Montura${ot.tipoMontura ? ` ${ot.tipoMontura}` : ''}${ot.marcaMontura ? ` — ${ot.marcaMontura}` : ''}`,
        cantidad:       1,
        precioUnitario: Number(ot.subtotal ?? ot.total ?? 0),
        porcentajeIva:  0,
      });
    }
    if (!detalles.length) {
      detalles.push({
        descripcion:    `Orden de trabajo óptica #${ot.numero} — ${ot.pacienteNombre}`,
        cantidad:       1,
        precioUnitario: Number(ot.total ?? 0),
        porcentajeIva:  0,
      });
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const preFactura = await this.preFacturaSvc.crear(
      { clienteId, fecha, tipoNcf: tipoNcf ?? 'E32', detalles,
        notas: `Generada desde OT óptica #${ot.numero} — ${ot.pacienteNombre}` },
      usuarioId,
    );

    // Marcar la OT con el ID de la pre-factura generada
    await this.ds.query(
      `UPDATE op_ordenes_trabajo SET "facturaId" = $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
      [preFactura.id, id, empresaId],
    );

    return preFactura;
  }

  // ── ESTADÍSTICAS ──────────────────────────────────────────────────────────

  async getEstadisticas() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [citasPorMes, ingresosPorMes, pacientesNuevosPorMes, topDiagnosticos] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT TO_CHAR(DATE_TRUNC('month', "fechaHora"), 'YYYY-MM') AS mes,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE estado = 'completada')::int AS completadas,
                COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas
         FROM op_citas
         WHERE "empresaId" = $1 AND "fechaHora" >= NOW() - INTERVAL '6 months'
         GROUP BY mes ORDER BY mes`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT TO_CHAR(DATE_TRUNC('month', fecha), 'YYYY-MM') AS mes,
                COALESCE(SUM(total), 0)::numeric AS totalIngresos,
                COUNT(*)::int AS totalOrdenes
         FROM op_ordenes_trabajo
         WHERE "empresaId" = $1 AND fecha >= NOW() - INTERVAL '6 months'
           AND estado != 'cancelada'
         GROUP BY mes ORDER BY mes`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS mes,
                COUNT(*)::int AS total
         FROM op_pacientes
         WHERE "empresaId" = $1 AND "createdAt" >= NOW() - INTERVAL '6 months'
         GROUP BY mes ORDER BY mes`,
        [empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT diagnostico, COUNT(*)::int AS total
         FROM op_consultas
         WHERE "empresaId" = $1 AND diagnostico IS NOT NULL AND diagnostico != ''
           AND fecha >= NOW() - INTERVAL '12 months'
         GROUP BY diagnostico ORDER BY total DESC LIMIT 8`,
        [empresaId],
      ),
    ]);
    return { citasPorMes, ingresosPorMes, pacientesNuevosPorMes, topDiagnosticos };
  }

  // ── HISTORIAL PACIENTE ─────────────────────────────────────────────────────

  async getHistorialPaciente(pacienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const paciente = await this.pacienteOr404(empresaId, pacienteId);
    const [citas, consultas, recetas, ordenes, reclamaciones] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT c.*,
                m.nombre || ' ' || m.apellido AS "medicoNombre"
         FROM op_citas c
         LEFT JOIN op_medicos m ON m.id = c."medicoId" AND m."empresaId" = c."empresaId"
         WHERE c."pacienteId" = $1 AND c."empresaId" = $2
         ORDER BY c."fechaHora" DESC LIMIT 50`,
        [pacienteId, empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT c.*,
                m.nombre || ' ' || m.apellido AS "medicoNombre"
         FROM op_consultas c
         LEFT JOIN op_medicos m ON m.id = c."medicoId" AND m."empresaId" = c."empresaId"
         WHERE c."pacienteId" = $1 AND c."empresaId" = $2
         ORDER BY c.fecha DESC LIMIT 50`,
        [pacienteId, empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT r.*,
                m.nombre || ' ' || m.apellido AS "medicoNombre"
         FROM op_recetas r
         LEFT JOIN op_medicos m ON m.id = r."medicoId" AND m."empresaId" = r."empresaId"
         WHERE r."pacienteId" = $1 AND r."empresaId" = $2
         ORDER BY r.fecha DESC LIMIT 50`,
        [pacienteId, empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT * FROM op_ordenes_trabajo
         WHERE "pacienteId" = $1 AND "empresaId" = $2
         ORDER BY fecha DESC LIMIT 50`,
        [pacienteId, empresaId],
      ),
      this.ds.query<any[]>(
        `SELECT * FROM op_reclamaciones_ars
         WHERE "pacienteId" = $1 AND "empresaId" = $2
         ORDER BY fecha DESC LIMIT 50`,
        [pacienteId, empresaId],
      ),
    ]);
    return { paciente, citas, consultas, recetas, ordenes, reclamaciones };
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────

  async getDashboard() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [stats] = await this.ds.query<any[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM op_pacientes   WHERE "empresaId"=$1 AND "isActive"=true) AS "totalPacientes",
         (SELECT COUNT(*)::int FROM op_citas        WHERE "empresaId"=$1 AND "fechaHora"::date = CURRENT_DATE) AS "citasHoy",
         (SELECT COUNT(*)::int FROM op_citas        WHERE "empresaId"=$1 AND estado IN ('programada','confirmada')) AS "citasPendientes",
         (SELECT COUNT(*)::int FROM op_ordenes_trabajo WHERE "empresaId"=$1 AND estado IN ('pendiente','en_proceso')) AS "ordenesActivas",
         (SELECT COUNT(*)::int FROM op_reclamaciones_ars WHERE "empresaId"=$1 AND estado IN ('borrador','enviada')) AS "reclamacionesPendientes",
         (SELECT COALESCE(SUM(balance),0) FROM op_ordenes_trabajo WHERE "empresaId"=$1 AND estado != 'cancelado') AS "saldoPendienteOt"`,
      [empresaId],
    );
    const citasProximas = await this.ds.query<any[]>(
      `SELECT c.*, p.nombre || ' ' || p.apellido AS "pacienteNombre",
              m.nombre || ' ' || m.apellido AS "medicoNombre"
       FROM op_citas c
       LEFT JOIN op_pacientes p ON p.id = c."pacienteId" AND p."empresaId" = c."empresaId"
       LEFT JOIN op_medicos   m ON m.id = c."medicoId"   AND m."empresaId" = c."empresaId"
       WHERE c."empresaId" = $1 AND estado IN ('programada','confirmada')
         AND "fechaHora" >= NOW()
       ORDER BY "fechaHora" LIMIT 5`,
      [empresaId],
    );
    return { ...stats, citasProximas };
  }

  // ── INVENTARIO ─────────────────────────────────────────────────────────────

  async listarInventario(page = 1, limit = 50, tipo?: string, search?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset    = (page - 1) * limit;
    const conds: string[] = [`i."empresaId" = $1`, `i.activo = true`];
    const params: any[]   = [empresaId];
    let p = 2;
    if (tipo)   { conds.push(`i.tipo = $${p++}`);  params.push(tipo); }
    if (search) { conds.push(`(i.marca ILIKE $${p} OR i.modelo ILIKE $${p} OR i.codigo ILIKE $${p})`); params.push(`%${search}%`); p++; }

    const where = conds.join(' AND ');
    const [total, data] = await Promise.all([
      this.ds.query<any[]>(`SELECT COUNT(*)::int AS cnt FROM op_inventario i WHERE ${where}`, params),
      this.ds.query<any[]>(
        `SELECT * FROM op_inventario i WHERE ${where} ORDER BY i.marca, i.modelo LIMIT $${p} OFFSET $${p+1}`,
        [...params, limit, offset],
      ),
    ]);
    return { total: total[0]?.cnt ?? 0, page, limit, data };
  }

  async crearInventario(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO op_inventario
         ("empresaId", tipo, codigo, marca, modelo, color, material, genero,
          precio, costo, "stockActual", "stockMinimo", descripcion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [empresaId, dto.tipo ?? 'montura', dto.codigo ?? null, dto.marca ?? null,
       dto.modelo ?? null, dto.color ?? null, dto.material ?? null, dto.genero ?? null,
       dto.precio ?? 0, dto.costo ?? 0, dto.stockActual ?? 0, dto.stockMinimo ?? 5,
       dto.descripcion ?? null],
    );
    return row;
  }

  async actualizarInventario(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const fields: string[] = [];
    const params: any[]    = [];
    let p = 1;
    const updatable = ['tipo','codigo','marca','modelo','color','material','genero',
                       'precio','costo','stockActual','stockMinimo','descripcion','activo'];
    for (const key of updatable) {
      if (dto[key] !== undefined) { fields.push(`"${key}" = $${p++}`); params.push(dto[key]); }
    }
    if (!fields.length) throw new NotFoundException('Sin campos para actualizar');
    fields.push(`"updatedAt" = NOW()`);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_inventario SET ${fields.join(', ')} WHERE id = $${p++} AND "empresaId" = $${p} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Item inventario #${id} no encontrado`);
    return row;
  }

  async ajustarStock(id: number, delta: number, motivo?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `UPDATE op_inventario
       SET "stockActual" = GREATEST(0, "stockActual" + $1), "updatedAt" = NOW()
       WHERE id = $2 AND "empresaId" = $3 RETURNING *`,
      [delta, id, empresaId],
    );
    if (!row) throw new NotFoundException(`Item inventario #${id} no encontrado`);
    this.logger.log(`Inventario #${id}: stock ajustado ${delta > 0 ? '+' : ''}${delta}${motivo ? ` — ${motivo}` : ''}`);
    return row;
  }

  async eliminarInventario(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.ds.query(
      `UPDATE op_inventario SET activo = false, "updatedAt" = NOW() WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    return { ok: true };
  }

  async resumenInventario() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.ds.query<any[]>(
      `SELECT
         tipo,
         COUNT(*)::int                                AS total,
         SUM("stockActual")::int                     AS stockTotal,
         SUM(CASE WHEN "stockActual" <= "stockMinimo" THEN 1 ELSE 0 END)::int AS bajosStock,
         ROUND(SUM(precio * "stockActual")::numeric, 2) AS valorInventario
       FROM op_inventario
       WHERE "empresaId" = $1 AND activo = true
       GROUP BY tipo ORDER BY tipo`,
      [empresaId],
    );
    return rows;
  }

  // ── REPORTE ARS ───────────────────────────────────────────────────────────

  async getReporteArs(desde?: string, hasta?: string, arsNombre?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const conds: string[] = [`r."empresaId" = $1`];
    const params: any[]   = [empresaId];
    let p = 2;
    if (desde)     { conds.push(`r.fecha >= $${p++}`);           params.push(desde); }
    if (hasta)     { conds.push(`r.fecha <= $${p++}`);           params.push(hasta); }
    if (arsNombre) { conds.push(`r."arsNombre" ILIKE $${p++}`);  params.push(`%${arsNombre}%`); }

    const where = conds.join(' AND ');
    const [reclamaciones, resumen] = await Promise.all([
      this.ds.query<any[]>(
        `SELECT r.*,
                p.nombre || ' ' || p.apellido AS "pacienteNombre",
                p.cedula AS "pacienteCedula"
         FROM op_reclamaciones_ars r
         LEFT JOIN op_pacientes p ON p.id = r."pacienteId" AND p."empresaId" = r."empresaId"
         WHERE ${where}
         ORDER BY r.fecha DESC, r."arsNombre"`,
        params,
      ),
      this.ds.query<any[]>(
        `SELECT
           "arsNombre",
           COUNT(*)::int                                       AS total,
           SUM(CASE WHEN estado = 'aprobada' THEN 1 ELSE 0 END)::int  AS aprobadas,
           SUM(CASE WHEN estado = 'rechazada' THEN 1 ELSE 0 END)::int AS rechazadas,
           SUM(CASE WHEN estado IN ('borrador','enviada') THEN 1 ELSE 0 END)::int AS pendientes,
           ROUND(COALESCE(SUM("montoReclamado"),0)::numeric, 2)  AS totalReclamado,
           ROUND(COALESCE(SUM("montoCubierto"),0)::numeric, 2)   AS totalCubierto,
           ROUND(COALESCE(SUM("montoPaciente"),0)::numeric, 2)   AS totalPaciente
         FROM op_reclamaciones_ars r
         WHERE ${where}
         GROUP BY "arsNombre"
         ORDER BY "arsNombre"`,
        params,
      ),
    ]);
    return { reclamaciones, resumen };
  }
}
