import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { PreFacturaService } from '../pre-factura/pre-factura.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

function calcImc(peso: any, talla: any): number | null {
  const p = Number(peso);
  const t = Number(talla);
  if (!p || !t) return null;
  return Math.round((p / Math.pow(t / 100, 2)) * 100) / 100;
}

@Injectable()
export class ClinicaService {
  private readonly logger = new Logger(ClinicaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly preFacturaSvc: PreFacturaService,
  ) {}

  // ── HELPERS ──────────────────────────────────────────────────────────────

  private async pacienteOr404(empresaId: number, id: number) {
    const [p] = await this.ds.query<any[]>(
      `SELECT * FROM cl_pacientes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!p) throw new NotFoundException(`Paciente #${id} no encontrado`);
    return p;
  }

  private async consultaOr404(empresaId: number, id: number) {
    const [c] = await this.ds.query<any[]>(
      `SELECT * FROM cl_consultas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!c) throw new NotFoundException(`Consulta #${id} no encontrada`);
    return c;
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  async dashboard() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [stats] = await this.ds.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM cl_citas WHERE "empresaId" = $1 AND fecha = CURRENT_DATE AND estado != 'cancelada')::int AS "citasHoy",
        (SELECT COUNT(*) FROM cl_sala_espera WHERE "empresaId" = $1 AND estado IN ('esperando','llamado') AND DATE("horaLlegada") = CURRENT_DATE)::int AS "enSalaEspera",
        (SELECT COUNT(*) FROM cl_consultas WHERE "empresaId" = $1 AND DATE(fecha) = CURRENT_DATE)::int AS "consultasHoy",
        (SELECT COUNT(*) FROM cl_ordenes_laboratorio WHERE "empresaId" = $1 AND estado = 'pendiente')::int AS "labsPendientes",
        (SELECT COUNT(*) FROM cl_autorizaciones_ars WHERE "empresaId" = $1 AND estado = 'pendiente')::int AS "arsPendientes",
        (SELECT COUNT(*) FROM cl_pacientes WHERE "empresaId" = $1 AND "isActive" = true)::int AS "totalPacientes"
    `, [empresaId]);

    const agendaHoy = await this.ds.query<any[]>(`
      SELECT c.id, c.numero, c.hora, c."duracionMinutos", c."tipoCita", c.estado, c.prioridad, c.motivo,
             p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad
      FROM cl_citas c
      JOIN cl_pacientes p ON p.id = c."pacienteId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      WHERE c."empresaId" = $1 AND c.fecha = CURRENT_DATE AND c.estado != 'cancelada'
      ORDER BY c.hora
    `, [empresaId]);

    const salaEspera = await this.ds.query<any[]>(`
      SELECT se.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre", m.especialidad,
             c.hora AS "citaHora", c."tipoCita"
      FROM cl_sala_espera se
      JOIN cl_pacientes p ON p.id = se."pacienteId"
      JOIN cl_citas c ON c.id = se."citaId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      WHERE se."empresaId" = $1 AND se.estado IN ('esperando','llamado','en_consulta') AND DATE(se."horaLlegada") = CURRENT_DATE
      ORDER BY se.turno NULLS LAST, se."horaLlegada"
    `, [empresaId]);

    const arsPendientes = await this.ds.query<any[]>(`
      SELECT a.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos"
      FROM cl_autorizaciones_ars a
      JOIN cl_pacientes p ON p.id = a."pacienteId"
      WHERE a."empresaId" = $1 AND a.estado = 'pendiente'
      ORDER BY a."createdAt" DESC LIMIT 5
    `, [empresaId]);

    return { ...stats, agendaHoy, salaEspera, arsPendientes };
  }

  // ── PACIENTES ─────────────────────────────────────────────────────────────

  async listarPacientes(page = 1, limit = 20, search?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1 AND "isActive" = true`;
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      where += ` AND (nombre ILIKE $${p} OR apellidos ILIKE $${p} OR cedula ILIKE $${p} OR codigo ILIKE $${p} OR telefono ILIKE $${p})`;
    }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_pacientes ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(
      `SELECT * FROM cl_pacientes ${where} ORDER BY nombre, apellidos LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data, total, page, limit };
  }

  async crearPaciente(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const codigo = await generarNumeroSecuencial(this.ds, '', '', '', 'PAC-', 0, empresaId);
    const cols = [
      'empresaId','codigo','cedula','nombre','apellidos','fechaNacimiento','sexo','estadoCivil',
      'telefono','telefonoEmergencia','contactoEmergencia','email','direccion',
      'arsNombre','arsNumeroAfiliado','arsTipo','arsPlan',
      'grupoSanguineo','alergias','antecedentesFamiliares','antecedentesPersonales','medicamentosActuales','clienteId',
    ];
    const vals = [
      empresaId, codigo, dto.cedula ?? null, dto.nombre, dto.apellidos ?? null,
      dto.fechaNacimiento ?? null, dto.sexo ?? null, dto.estadoCivil ?? null,
      dto.telefono ?? null, dto.telefonoEmergencia ?? null, dto.contactoEmergencia ?? null,
      dto.email ?? null, dto.direccion ?? null,
      dto.arsNombre ?? null, dto.arsNumeroAfiliado ?? null, dto.arsTipo ?? null, dto.arsPlan ?? null,
      dto.grupoSanguineo ?? null, dto.alergias ?? null, dto.antecedentesFamiliares ?? null,
      dto.antecedentesPersonales ?? null, dto.medicamentosActuales ?? null, dto.clienteId ?? null,
    ];
    const phs = vals.map((_, i) => `$${i + 1}`).join(',');
    const colNames = cols.map(c => `"${c}"`).join(',');
    try {
      const [row] = await this.ds.query<any[]>(
        `INSERT INTO cl_pacientes (${colNames}) VALUES (${phs}) RETURNING *`,
        vals,
      );
      return row;
    } catch (err: any) {
      this.logger.error(`Error creando paciente: ${err.message}`, err.stack);
      throw err;
    }
  }

  async obtenerPaciente(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [p] = await this.ds.query<any[]>(
      `SELECT p.*, c.nombre AS "clienteNombreERP" FROM cl_pacientes p LEFT JOIN clientes c ON c.id = p."clienteId" WHERE p.id = $1 AND p."empresaId" = $2`,
      [id, empresaId],
    );
    if (!p) throw new NotFoundException(`Paciente #${id} no encontrado`);
    return p;
  }

  async actualizarPaciente(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.pacienteOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of [
      'cedula','nombre','apellidos','fechaNacimiento','sexo','estadoCivil','telefono','telefonoEmergencia',
      'contactoEmergencia','email','direccion','arsNombre','arsNumeroAfiliado','arsTipo','arsPlan',
      'grupoSanguineo','alergias','antecedentesFamiliares','antecedentesPersonales','medicamentosActuales','clienteId','isActive',
    ]) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return this.obtenerPaciente(id);
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_pacientes SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return row;
  }

  async expedientePaciente(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const paciente = await this.obtenerPaciente(id);
    const [consultas, recetas, labs, procedimientos, signos] = await Promise.all([
      this.ds.query<any[]>(`
        SELECT c.*, m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad
        FROM cl_consultas c JOIN cl_medicos m ON m.id = c."medicoId"
        WHERE c."pacienteId" = $1 AND c."empresaId" = $2 ORDER BY c.fecha DESC LIMIT 20
      `, [id, empresaId]),
      this.ds.query<any[]>(`
        SELECT r.*, m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos"
        FROM cl_recetas r JOIN cl_medicos m ON m.id = r."medicoId"
        WHERE r."pacienteId" = $1 AND r."empresaId" = $2 ORDER BY r.fecha DESC LIMIT 20
      `, [id, empresaId]),
      this.ds.query<any[]>(`
        SELECT o.*, m.nombre AS "medicoNombre"
        FROM cl_ordenes_laboratorio o JOIN cl_medicos m ON m.id = o."medicoId"
        WHERE o."pacienteId" = $1 AND o."empresaId" = $2 ORDER BY o.fecha DESC LIMIT 20
      `, [id, empresaId]),
      this.ds.query<any[]>(`
        SELECT p.*, m.nombre AS "medicoNombre"
        FROM cl_procedimientos p JOIN cl_medicos m ON m.id = p."medicoId"
        WHERE p."pacienteId" = $1 AND p."empresaId" = $2 ORDER BY p.fecha DESC LIMIT 20
      `, [id, empresaId]),
      this.ds.query<any[]>(
        `SELECT * FROM cl_signos_vitales WHERE "pacienteId" = $1 AND "empresaId" = $2 ORDER BY fecha DESC LIMIT 50`,
        [id, empresaId],
      ),
    ]);
    return { paciente, consultas, recetas, laboratorios: labs, procedimientos, signosVitales: signos };
  }

  async signosVitalesPaciente(pacienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM cl_signos_vitales WHERE "pacienteId" = $1 AND "empresaId" = $2 ORDER BY fecha DESC LIMIT 100`,
      [pacienteId, empresaId],
    );
  }

  // ── MÉDICOS ───────────────────────────────────────────────────────────────

  async listarMedicos() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(
      `SELECT * FROM cl_medicos WHERE "empresaId" = $1 ORDER BY nombre`,
      [empresaId],
    );
  }

  async crearMedico(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cols = ['empresaId','nombre','apellidos','especialidad','subespecialidad','exequatur','colegiatura',
                  'telefono','email','firma','selloUrl','tarifaConsulta','empleadoId',
                  'horarioLunes','horarioMartes','horarioMiercoles','horarioJueves','horarioViernes','horarioSabado','horarioDomingo'];
    const vals = [
      empresaId, dto.nombre, dto.apellidos ?? null, dto.especialidad ?? null, dto.subespecialidad ?? null,
      dto.exequatur ?? null, dto.colegiatura ?? null, dto.telefono ?? null, dto.email ?? null,
      dto.firma ?? null, dto.selloUrl ?? null, dto.tarifaConsulta ?? null, dto.empleadoId ?? null,
      dto.horarioLunes ?? null, dto.horarioMartes ?? null, dto.horarioMiercoles ?? null,
      dto.horarioJueves ?? null, dto.horarioViernes ?? null, dto.horarioSabado ?? null, dto.horarioDomingo ?? null,
    ];
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO cl_medicos (${cols.map(c => `"${c}"`).join(',')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      vals,
    );
    return row;
  }

  async actualizarMedico(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['nombre','apellidos','especialidad','subespecialidad','exequatur','colegiatura','telefono','email',
                     'firma','selloUrl','tarifaConsulta','empleadoId','isActive',
                     'horarioLunes','horarioMartes','horarioMiercoles','horarioJueves','horarioViernes','horarioSabado','horarioDomingo']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) {
      const [m] = await this.ds.query<any[]>(`SELECT * FROM cl_medicos WHERE id = $1 AND "empresaId" = $2`, [id, empresaId]);
      return m;
    }
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_medicos SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Médico #${id} no encontrado`);
    return row;
  }

  // ── CITAS ─────────────────────────────────────────────────────────────────

  async listarCitas(page = 1, limit = 50, fecha?: string, medicoId?: number, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId" = $1`;
    if (fecha) { params.push(fecha); where += ` AND c.fecha = $${params.length}`; }
    if (medicoId) { params.push(medicoId); where += ` AND c."medicoId" = $${params.length}`; }
    if (estado) { params.push(estado); where += ` AND c.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_citas c ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT c.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos", p.cedula, p."arsNombre",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad
      FROM cl_citas c
      JOIN cl_pacientes p ON p.id = c."pacienteId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      ${where} ORDER BY c.fecha, c.hora
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearCita(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'CIT-', 0, empresaId);
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_citas ("empresaId",numero,"pacienteId","medicoId",fecha,hora,"duracionMinutos","tipoCita",motivo,estado,sala,prioridad,notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId, dto.fecha, dto.hora,
      dto.duracionMinutos ?? 30, dto.tipoCita ?? null, dto.motivo ?? null,
      dto.estado ?? 'programada', dto.sala ?? null, dto.prioridad ?? 'normal', dto.notas ?? null,
    ]);
    return row;
  }

  async actualizarCita(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['pacienteId','medicoId','fecha','hora','duracionMinutos','tipoCita','motivo','estado','sala','prioridad','notas']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_citas SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Cita #${id} no encontrada`);
    return row;
  }

  async cambiarEstadoCita(id: number, estado: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_citas SET estado = $1 WHERE id = $2 AND "empresaId" = $3 RETURNING *`,
      [estado, id, empresaId],
    );
    if (!row) throw new NotFoundException(`Cita #${id} no encontrada`);
    return row;
  }

  async iniciarConsultaDesdeCita(citaId: number, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [cita] = await this.ds.query<any[]>(
      `SELECT * FROM cl_citas WHERE id = $1 AND "empresaId" = $2`,
      [citaId, empresaId],
    );
    if (!cita) throw new NotFoundException(`Cita #${citaId} no encontrada`);
    await this.ds.query(
      `UPDATE cl_citas SET estado = 'en_sala' WHERE id = $1 AND "empresaId" = $2`,
      [citaId, empresaId],
    );
    return this.crearConsulta({ pacienteId: cita.pacienteId, medicoId: cita.medicoId, citaId, motivoConsulta: cita.motivo ?? 'Consulta de cita programada', tipoCita: cita.tipoCita }, usuarioId);
  }

  // ── SALA DE ESPERA ────────────────────────────────────────────────────────

  async getSalaEspera(fecha?: string, medicoId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const fechaFiltro = fecha ?? fechaHoyRD();
    const params: any[] = [empresaId, fechaFiltro];
    let where = `se."empresaId" = $1 AND DATE(se."horaLlegada") = $2`;
    if (medicoId) { params.push(medicoId); where += ` AND c."medicoId" = $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT se.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre", m.especialidad, c.hora AS "citaHora", c."tipoCita", c.motivo AS "citaMotivo"
      FROM cl_sala_espera se
      JOIN cl_pacientes p ON p.id = se."pacienteId"
      JOIN cl_citas c ON c.id = se."citaId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      WHERE ${where}
      ORDER BY se.turno NULLS LAST, se."horaLlegada"
    `, params);
  }

  async registrarLlegada(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [ultimo] = await this.ds.query<any[]>(
      `SELECT COALESCE(MAX(turno), 0) AS max FROM cl_sala_espera WHERE "empresaId" = $1 AND DATE("horaLlegada") = CURRENT_DATE`,
      [empresaId],
    );
    const turno = Number(ultimo?.max ?? 0) + 1;
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_sala_espera ("empresaId","citaId","pacienteId",turno,notas)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [empresaId, dto.citaId, dto.pacienteId, turno, dto.notas ?? null]);
    await this.ds.query(`UPDATE cl_citas SET estado = 'en_sala' WHERE id = $1 AND "empresaId" = $2`, [dto.citaId, empresaId]);
    return row;
  }

  async llamarPaciente(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_sala_espera SET estado = 'llamado', "horaLlamada" = NOW() WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Registro sala espera #${id} no encontrado`);
    return row;
  }

  async marcarAtendido(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_sala_espera SET estado = 'atendido', "horaAtencion" = NOW() WHERE id = $1 AND "empresaId" = $2 RETURNING *`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Registro sala espera #${id} no encontrado`);
    return row;
  }

  // ── CONSULTAS ─────────────────────────────────────────────────────────────

  async listarConsultas(page = 1, limit = 20, pacienteId?: number, medicoId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE c."empresaId" = $1`;
    if (pacienteId) { params.push(pacienteId); where += ` AND c."pacienteId" = $${params.length}`; }
    if (medicoId) { params.push(medicoId); where += ` AND c."medicoId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_consultas c ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT c.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad
      FROM cl_consultas c
      JOIN cl_pacientes p ON p.id = c."pacienteId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      ${where} ORDER BY c.fecha DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearConsulta(dto: any, _usuarioId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'CON-', 0, empresaId);
    const imc = dto.peso && dto.talla ? calcImc(dto.peso, dto.talla) : null;
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_consultas (
        "empresaId",numero,"pacienteId","medicoId","citaId","tipoCita","motivoConsulta","enfermedadActual",
        temperatura,"presionSistolica","presionDiastolica","frecuenciaCardiaca","frecuenciaRespiratoria",
        "saturacionOxigeno",peso,talla,imc,"examenFisico","diagnosticoPrincipal","diagnosticosCIE10",
        "diagnosticosDescripcion","planTratamiento",indicaciones,"proximaCita","proximaCitaMotivo"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId, dto.citaId ?? null, dto.tipoCita ?? null,
      dto.motivoConsulta, dto.enfermedadActual ?? null,
      dto.temperatura ?? null, dto.presionSistolica ?? null, dto.presionDiastolica ?? null,
      dto.frecuenciaCardiaca ?? null, dto.frecuenciaRespiratoria ?? null, dto.saturacionOxigeno ?? null,
      dto.peso ?? null, dto.talla ?? null, imc,
      dto.examenFisico ?? null, dto.diagnosticoPrincipal ?? null, dto.diagnosticosCIE10 ?? null,
      dto.diagnosticosDescripcion ?? null, dto.planTratamiento ?? null, dto.indicaciones ?? null,
      dto.proximaCita ?? null, dto.proximaCitaMotivo ?? null,
    ]);
    // Registrar signos vitales histórico si hay datos
    if (dto.peso || dto.temperatura || dto.presionSistolica) {
      this.ds.query(
        `INSERT INTO cl_signos_vitales ("empresaId","pacienteId","consultaId",temperatura,"presionSistolica","presionDiastolica","frecuenciaCardiaca","frecuenciaRespiratoria","saturacionOxigeno",peso,talla,imc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [empresaId, dto.pacienteId, row.id, dto.temperatura ?? null, dto.presionSistolica ?? null,
         dto.presionDiastolica ?? null, dto.frecuenciaCardiaca ?? null, dto.frecuenciaRespiratoria ?? null,
         dto.saturacionOxigeno ?? null, dto.peso ?? null, dto.talla ?? null, imc],
      ).catch((err: any) => this.logger.error(`Error guardando signos: ${err.message}`, err.stack));
    }
    return row;
  }

  async obtenerConsulta(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [c] = await this.ds.query<any[]>(`
      SELECT c.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos", p.cedula,
             p."arsNombre", p."arsNumeroAfiliado", p."fechaNacimiento",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad,
             m.exequatur, m.firma, m."selloUrl"
      FROM cl_consultas c
      JOIN cl_pacientes p ON p.id = c."pacienteId"
      JOIN cl_medicos m ON m.id = c."medicoId"
      WHERE c.id = $1 AND c."empresaId" = $2
    `, [id, empresaId]);
    if (!c) throw new NotFoundException(`Consulta #${id} no encontrada`);
    return c;
  }

  async actualizarConsulta(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.consultaOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (dto.peso !== undefined && dto.talla !== undefined) {
      add('imc', calcImc(dto.peso, dto.talla));
    }
    for (const c of ['motivoConsulta','enfermedadActual','temperatura','presionSistolica','presionDiastolica',
                     'frecuenciaCardiaca','frecuenciaRespiratoria','saturacionOxigeno','peso','talla',
                     'examenFisico','diagnosticoPrincipal','diagnosticosCIE10','diagnosticosDescripcion',
                     'planTratamiento','indicaciones','proximaCita','proximaCitaMotivo','recetaGenerada','ordenLaboratorioGenerada']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return this.obtenerConsulta(id);
    params.push(id, empresaId);
    await this.ds.query(
      `UPDATE cl_consultas SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length}`,
      params,
    );
    return this.obtenerConsulta(id);
  }

  async registrarSignos(consultaId: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const consulta = await this.consultaOr404(empresaId, consultaId);
    const imc = dto.peso && dto.talla ? calcImc(dto.peso, dto.talla) : null;
    await this.ds.query(
      `INSERT INTO cl_signos_vitales ("empresaId","pacienteId","consultaId",temperatura,"presionSistolica","presionDiastolica","frecuenciaCardiaca","frecuenciaRespiratoria","saturacionOxigeno",peso,talla,imc,glucosa,"registradoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [empresaId, consulta.pacienteId, consultaId, dto.temperatura ?? null, dto.presionSistolica ?? null,
       dto.presionDiastolica ?? null, dto.frecuenciaCardiaca ?? null, dto.frecuenciaRespiratoria ?? null,
       dto.saturacionOxigeno ?? null, dto.peso ?? null, dto.talla ?? null, imc, dto.glucosa ?? null, dto.registradoPor ?? null],
    );
    return { ok: true };
  }

  // ── RECETAS ───────────────────────────────────────────────────────────────

  async listarRecetas(page = 1, limit = 20, pacienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE r."empresaId" = $1`;
    if (pacienteId) { params.push(pacienteId); where += ` AND r."pacienteId" = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_recetas r ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT r.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos"
      FROM cl_recetas r
      JOIN cl_pacientes p ON p.id = r."pacienteId"
      JOIN cl_medicos m ON m.id = r."medicoId"
      ${where} ORDER BY r.fecha DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearReceta(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'REC-', 0, empresaId);
    const [receta] = await this.ds.query<any[]>(`
      INSERT INTO cl_recetas ("empresaId",numero,"pacienteId","medicoId","consultaId",fecha,"fechaVencimiento",diagnostico,"indicacionesGenerales")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId, dto.consultaId ?? null,
      dto.fecha, dto.fechaVencimiento ?? null, dto.diagnostico ?? null, dto.indicacionesGenerales ?? null,
    ]);
    if (dto.medicamentos?.length) {
      for (let i = 0; i < dto.medicamentos.length; i++) {
        const m = dto.medicamentos[i];
        await this.ds.query(
          `INSERT INTO cl_receta_medicamentos ("empresaId","recetaId",medicamento,concentracion,forma,via,dosis,frecuencia,duracion,cantidad,indicaciones,orden)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [empresaId, receta.id, m.medicamento, m.concentracion ?? null, m.forma ?? null, m.via ?? null,
           m.dosis ?? null, m.frecuencia ?? null, m.duracion ?? null, m.cantidad ?? null, m.indicaciones ?? null, i + 1],
        );
      }
    }
    if (dto.consultaId) {
      await this.ds.query(
        `UPDATE cl_consultas SET "recetaGenerada" = true WHERE id = $1 AND "empresaId" = $2`,
        [dto.consultaId, empresaId],
      );
    }
    return this.obtenerReceta(receta.id);
  }

  async obtenerReceta(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [r] = await this.ds.query<any[]>(`
      SELECT r.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos", p.cedula, p."fechaNacimiento",
             p."arsNombre", p."arsNumeroAfiliado",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad, m.exequatur, m.firma, m."selloUrl"
      FROM cl_recetas r
      JOIN cl_pacientes p ON p.id = r."pacienteId"
      JOIN cl_medicos m ON m.id = r."medicoId"
      WHERE r.id = $1 AND r."empresaId" = $2
    `, [id, empresaId]);
    if (!r) throw new NotFoundException(`Receta #${id} no encontrada`);
    r.medicamentos = await this.ds.query<any[]>(
      `SELECT * FROM cl_receta_medicamentos WHERE "recetaId" = $1 AND "empresaId" = $2 ORDER BY orden`,
      [id, empresaId],
    );
    return r;
  }

  // ── LABORATORIO ───────────────────────────────────────────────────────────

  async listarOrdenes(page = 1, limit = 20, pacienteId?: number, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE o."empresaId" = $1`;
    if (pacienteId) { params.push(pacienteId); where += ` AND o."pacienteId" = $${params.length}`; }
    if (estado) { params.push(estado); where += ` AND o.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_ordenes_laboratorio o ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT o.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre"
      FROM cl_ordenes_laboratorio o
      JOIN cl_pacientes p ON p.id = o."pacienteId"
      JOIN cl_medicos m ON m.id = o."medicoId"
      ${where} ORDER BY o.fecha DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearOrdenLab(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'LAB-', 0, empresaId);
    const [orden] = await this.ds.query<any[]>(`
      INSERT INTO cl_ordenes_laboratorio ("empresaId",numero,"pacienteId","medicoId","consultaId",fecha,urgente,"diagnosticoPresuntivo",indicaciones,"laboratorioNombre")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId, dto.consultaId ?? null,
      dto.fecha, dto.urgente ?? false, dto.diagnosticoPresuntivo ?? null, dto.indicaciones ?? null, dto.laboratorioNombre ?? null,
    ]);
    if (dto.examenes?.length) {
      for (const ex of dto.examenes) {
        await this.ds.query(
          `INSERT INTO cl_examenes_laboratorio ("empresaId","ordenId",examen,categoria) VALUES ($1,$2,$3,$4)`,
          [empresaId, orden.id, ex.examen, ex.categoria ?? null],
        );
      }
    }
    if (dto.consultaId) {
      await this.ds.query(
        `UPDATE cl_consultas SET "ordenLaboratorioGenerada" = true WHERE id = $1 AND "empresaId" = $2`,
        [dto.consultaId, empresaId],
      );
    }
    return this.obtenerOrdenLab(orden.id);
  }

  async obtenerOrdenLab(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [o] = await this.ds.query<any[]>(`
      SELECT o.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos", p.cedula,
             p."arsNombre", p."arsNumeroAfiliado", p."fechaNacimiento",
             m.nombre AS "medicoNombre", m.apellidos AS "medicoApellidos", m.especialidad, m.exequatur, m.firma, m."selloUrl"
      FROM cl_ordenes_laboratorio o
      JOIN cl_pacientes p ON p.id = o."pacienteId"
      JOIN cl_medicos m ON m.id = o."medicoId"
      WHERE o.id = $1 AND o."empresaId" = $2
    `, [id, empresaId]);
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);
    o.examenes = await this.ds.query<any[]>(
      `SELECT * FROM cl_examenes_laboratorio WHERE "ordenId" = $1 AND "empresaId" = $2 ORDER BY categoria, id`,
      [id, empresaId],
    );
    return o;
  }

  async actualizarOrdenLab(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['estado','fechaResultados','laboratorioNombre','indicaciones','urgente']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return this.obtenerOrdenLab(id);
    params.push(id, empresaId);
    await this.ds.query(
      `UPDATE cl_ordenes_laboratorio SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length}`,
      params,
    );
    return this.obtenerOrdenLab(id);
  }

  async registrarResultados(ordenId: number, examenes: any[]) {
    const empresaId = this.tenantSvc.getEmpresaId();
    for (const ex of examenes) {
      await this.ds.query(
        `UPDATE cl_examenes_laboratorio SET resultado = $1, unidad = $2, "valorReferencia" = $3, estado = 'recibido' WHERE id = $4 AND "empresaId" = $5`,
        [ex.resultado, ex.unidad ?? null, ex.valorReferencia ?? null, ex.id, empresaId],
      );
    }
    await this.ds.query(
      `UPDATE cl_ordenes_laboratorio SET estado = 'resultados_recibidos', "fechaResultados" = CURRENT_DATE WHERE id = $1 AND "empresaId" = $2`,
      [ordenId, empresaId],
    );
    return this.obtenerOrdenLab(ordenId);
  }

  // ── PROCEDIMIENTOS ────────────────────────────────────────────────────────

  async listarProcedimientos(page = 1, limit = 20, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE p."empresaId" = $1`;
    if (estado) { params.push(estado); where += ` AND p.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_procedimientos p ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT p.*, pa.nombre AS "pacienteNombre", pa.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre"
      FROM cl_procedimientos p
      JOIN cl_pacientes pa ON pa.id = p."pacienteId"
      JOIN cl_medicos m ON m.id = p."medicoId"
      ${where} ORDER BY p.fecha DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearProcedimiento(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'PRO-', 0, empresaId);
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_procedimientos ("empresaId",numero,"pacienteId","medicoId","consultaId",fecha,nombre,descripcion,"duracionMinutos",anestesia,sala,estado,costo,notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId, dto.consultaId ?? null,
      dto.fecha, dto.nombre, dto.descripcion ?? null, dto.duracionMinutos ?? null,
      dto.anestesia ?? null, dto.sala ?? null, dto.estado ?? 'programado', dto.costo ?? null, dto.notas ?? null,
    ]);
    return row;
  }

  async actualizarProcedimiento(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['nombre','descripcion','duracionMinutos','anestesia','sala','estado','complicaciones','notas','costo','facturaId']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_procedimientos SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Procedimiento #${id} no encontrado`);
    return row;
  }

  async facturarProcedimiento(id: number, clienteId: number, usuarioId: number, tipoNcf?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [proc] = await this.ds.query<any[]>(
      `SELECT * FROM cl_procedimientos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!proc) throw new NotFoundException(`Procedimiento #${id} no encontrado`);
    if (proc.facturaId) throw new BadRequestException('Este procedimiento ya fue facturado');
    let preFactura: any;
    try {
      preFactura = await this.preFacturaSvc.crear(
        { clienteId, fecha: fechaHoyRD(), tipoNcf: tipoNcf ?? 'E32',
          detalles: [{ descripcion: `Procedimiento: ${proc.nombre}`, cantidad: 1, precioUnitario: Number(proc.costo ?? 0) }] },
        usuarioId,
      );
    } catch (err: any) {
      this.logger.error(`Error facturando procedimiento #${id}: ${err.message}`, err.stack);
      throw err;
    }
    await this.ds.query(`UPDATE cl_procedimientos SET "facturaId" = $1, estado = 'completado' WHERE id = $2 AND "empresaId" = $3`, [preFactura.id, id, empresaId]);
    return { ...proc, facturaId: preFactura.id };
  }

  // ── ARS ───────────────────────────────────────────────────────────────────

  async listarArs(page = 1, limit = 20, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE a."empresaId" = $1`;
    if (estado) { params.push(estado); where += ` AND a.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(`SELECT COUNT(*)::int AS total FROM cl_autorizaciones_ars a ${where}`, params);
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT a.*, p.nombre AS "pacienteNombre", p.apellidos AS "pacienteApellidos",
             m.nombre AS "medicoNombre"
      FROM cl_autorizaciones_ars a
      JOIN cl_pacientes p ON p.id = a."pacienteId"
      LEFT JOIN cl_medicos m ON m.id = a."medicoId"
      ${where} ORDER BY a."createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async crearArs(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, '', '', '', 'ARS-', 0, empresaId);
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_autorizaciones_ars ("empresaId",numero,"pacienteId","medicoId","arsNombre","arsNumeroAfiliado","tipoServicio",descripcion,"montoAutorizado","montoCubierto","montoPaciente","fechaSolicitud",observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      empresaId, numero, dto.pacienteId, dto.medicoId ?? null, dto.arsNombre, dto.arsNumeroAfiliado ?? null,
      dto.tipoServicio ?? null, dto.descripcion ?? null, dto.montoAutorizado ?? null,
      dto.montoCubierto ?? null, dto.montoPaciente ?? null,
      dto.fechaSolicitud ?? fechaHoyRD(), dto.observaciones ?? null,
    ]);
    return row;
  }

  async actualizarArs(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['estado','codigoAutorizacion','montoAutorizado','montoCubierto','montoPaciente','fechaRespuesta','observaciones','facturaId']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_autorizaciones_ars SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Autorización ARS #${id} no encontrada`);
    return row;
  }

  // ── CATÁLOGO ──────────────────────────────────────────────────────────────

  async listarCatalogo(especialidad?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1 AND "isActive" = true`;
    if (especialidad) { params.push(especialidad); where += ` AND especialidad = $${params.length}`; }
    return this.ds.query<any[]>(`SELECT * FROM cl_catalogo_servicios ${where} ORDER BY especialidad, nombre`, params);
  }

  async crearCatalogo(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<any[]>(`
      INSERT INTO cl_catalogo_servicios ("empresaId",codigo,nombre,descripcion,especialidad,precio,"precioArs","duracionMinutos","requiereAutorizacion")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      empresaId, dto.codigo ?? null, dto.nombre, dto.descripcion ?? null, dto.especialidad ?? null,
      dto.precio ?? null, dto.precioArs ?? null, dto.duracionMinutos ?? 30, dto.requiereAutorizacion ?? false,
    ]);
    return row;
  }

  async actualizarCatalogo(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const c of ['codigo','nombre','descripcion','especialidad','precio','precioArs','duracionMinutos','requiereAutorizacion','isActive']) {
      if (dto[c] !== undefined) add(c, dto[c]);
    }
    if (!sets.length) return null;
    params.push(id, empresaId);
    const [row] = await this.ds.query<any[]>(
      `UPDATE cl_catalogo_servicios SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundException(`Catálogo #${id} no encontrado`);
    return row;
  }

  // ── REPORTES ──────────────────────────────────────────────────────────────

  async reportes(tipo: string, desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let fw = '';
    if (desde) { params.push(desde); fw += ` AND DATE(fecha) >= $${params.length}`; }
    if (hasta) { params.push(hasta); fw += ` AND DATE(fecha) <= $${params.length}`; }

    if (tipo === 'productividad') {
      return this.ds.query<any[]>(`
        SELECT m.nombre AS medico, m.especialidad,
               COUNT(DISTINCT c.id)::int AS consultas,
               COUNT(DISTINCT r.id)::int AS recetas,
               COUNT(DISTINCT o.id)::int AS ordenes
        FROM cl_medicos m
        LEFT JOIN cl_consultas c ON c."medicoId" = m.id AND c."empresaId" = $1 ${fw.replace(/fecha/g,'c.fecha')}
        LEFT JOIN cl_recetas r ON r."medicoId" = m.id AND r."empresaId" = $1
        LEFT JOIN cl_ordenes_laboratorio o ON o."medicoId" = m.id AND o."empresaId" = $1
        WHERE m."empresaId" = $1 GROUP BY m.id, m.nombre, m.especialidad ORDER BY consultas DESC
      `, params);
    }
    if (tipo === 'diagnosticos') {
      return this.ds.query<any[]>(`
        SELECT "diagnosticoPrincipal" AS diagnostico, COUNT(*)::int AS veces
        FROM cl_consultas WHERE "empresaId" = $1 AND "diagnosticoPrincipal" IS NOT NULL ${fw}
        GROUP BY "diagnosticoPrincipal" ORDER BY veces DESC LIMIT 20
      `, params);
    }
    if (tipo === 'ars-pendientes') {
      return this.ds.query<any[]>(`
        SELECT "arsNombre", COUNT(*)::int AS solicitudes, COALESCE(SUM("montoAutorizado"),0)::numeric AS total
        FROM cl_autorizaciones_ars WHERE "empresaId" = $1 AND estado = 'pendiente'
        GROUP BY "arsNombre" ORDER BY total DESC
      `, [empresaId]);
    }
    if (tipo === 'ausentismo') {
      return this.ds.query<any[]>(`
        SELECT m.nombre AS medico, COUNT(c.id)::int AS "noAsistio"
        FROM cl_citas c JOIN cl_medicos m ON m.id = c."medicoId"
        WHERE c."empresaId" = $1 AND c.estado = 'no_asistio' ${fw.replace(/fecha/g,'c.fecha')}
        GROUP BY m.id, m.nombre ORDER BY "noAsistio" DESC
      `, params);
    }
    if (tipo === 'nuevos-pacientes') {
      return this.ds.query<any[]>(`
        SELECT DATE_TRUNC('month',"createdAt")::date AS mes, COUNT(*)::int AS nuevos
        FROM cl_pacientes WHERE "empresaId" = $1 ${fw.replace(/fecha/g,'"createdAt"')}
        GROUP BY mes ORDER BY mes
      `, params);
    }
    return [];
  }
}
