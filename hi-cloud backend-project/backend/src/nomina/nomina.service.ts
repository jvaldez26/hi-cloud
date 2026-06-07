import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Empleado, EstadoEmpleado, TipoContrato } from './entities/empleado.entity';
import { NominaPeriodo, EstadoNomina } from './entities/nomina-periodo.entity';
import { NominaLinea } from './entities/nomina-linea.entity';
import { NominaNovedadEmpleado, TipoNovedad } from './entities/nomina-novedad.entity';
import { ContratoLaboral, EstadoContrato } from './entities/contrato-laboral.entity';
import { PrestamoEmpleado, EstadoPrestamo } from './entities/prestamo-empleado.entity';
import { AnticipoNomina, EstadoAnticipo } from './entities/anticipo-nomina.entity';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { CreateNominaPeriodoDto } from './dto/create-nomina-periodo.dto';
import { FiltroEmpleadoDto, FiltroNominaPeriodoDto } from './dto/filtro-nomina.dto';
import { NominaCalculosService } from './services/nomina-calculos.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { TenantService } from '../tenant/tenant.service';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { EmailService } from '../notificaciones/services/email.service';
import { UserRole } from '../users/enums/user-role.enum';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import PDFDocument from 'pdfkit';

@Injectable()
export class NominaService {
  private readonly logger = new Logger(NominaService.name);

  constructor(
    @InjectRepository(Empleado)
    private empleadoRepository: Repository<Empleado>,
    @InjectRepository(NominaPeriodo)
    private periodoRepository: Repository<NominaPeriodo>,
    @InjectRepository(NominaLinea)
    private lineaRepository: Repository<NominaLinea>,
    @InjectRepository(NominaNovedadEmpleado)
    private novedadRepository: Repository<NominaNovedadEmpleado>,
    @InjectRepository(ContratoLaboral)
    private contratoRepository: Repository<ContratoLaboral>,
    @InjectRepository(PrestamoEmpleado)
    private prestamoRepository: Repository<PrestamoEmpleado>,
    @InjectRepository(AnticipoNomina)
    private anticipoRepository: Repository<AnticipoNomina>,
    private calculos:         NominaCalculosService,
    private asientosService:  AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private tenantService:    TenantService,
    private emailService:     EmailService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Empleados
  // ──────────────────────────────────────────────────────────────────

  async createEmpleado(dto: CreateEmpleadoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.empleadoRepository.findOne({
      where: { cedula: dto.cedula, empresaId },
    });
    if (existe) throw new ConflictException(`Cédula ${dto.cedula} ya está registrada en esta empresa`);

    const emp = this.empleadoRepository.create({ ...dto, empresaId });
    return this.empleadoRepository.save(emp);
  }

  async getEmpleados(filtro: FiltroEmpleadoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, estado, departamento } = filtro;

    const qb = this.empleadoRepository
      .createQueryBuilder('e')
      .where('e.empresaId = :eid', { eid: empresaId })
      .andWhere('e.isActive = :active', { active: true });

    if (estado)       qb.andWhere('e.estado = :estado', { estado });
    if (departamento) qb.andWhere('e.departamento ILIKE :dep', { dep: `%${departamento}%` });
    if (search) {
      qb.andWhere(
        '(e.nombre ILIKE :s OR e.apellido ILIKE :s OR e.cedula ILIKE :s OR e.cargo ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('e.apellido', 'ASC')
      .addOrderBy('e.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findEmpleadoById(id: number) {
    const emp = await this.empleadoRepository.findOne({
      where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true },
    });
    if (!emp) throw new NotFoundException(`Empleado #${id} no encontrado`);
    return emp;
  }

  async updateEmpleado(id: number, dto: UpdateEmpleadoDto) {
    await this.findEmpleadoById(id);
    await this.empleadoRepository.update(id, dto as any);
    return this.findEmpleadoById(id);
  }

  async removeEmpleado(id: number) {
    const emp = await this.findEmpleadoById(id);
    await this.empleadoRepository.update(id, {
      isActive: false,
      estado: EstadoEmpleado.INACTIVO,
    });
    return { message: `Empleado "${emp.nombre} ${emp.apellido}" desactivado` };
  }

  /**
   * Vincula un empleado con un usuario del sistema (para Portal del Empleado).
   * Permite al usuario ver su portal, recibos y vacaciones.
   */
  async vincularUsuario(empleadoId: number, userId: number | null) {
    const empresaId = this.tenantService.getEmpresaId();
    const emp = await this.empleadoRepository.findOne({
      where: { id: empleadoId, empresaId, isActive: true },
    });
    if (!emp) throw new NotFoundException(`Empleado #${empleadoId} no encontrado`);

    // Verificar que el userId pertenece al tenant (mismo empresaId en usuarios_empresas)
    if (userId !== null) {
      const [rows] = await this.dataSource.query<any[]>(`
        SELECT 1 FROM usuarios_empresas
        WHERE "usuarioId" = $1 AND "empresaId" = $2
        LIMIT 1
      `, [userId, empresaId]);
      if (!rows) throw new BadRequestException('El usuario no pertenece a esta empresa');

      // Verificar que ningún otro empleado activo en esta empresa ya tenga ese userId
      const conflicto = await this.empleadoRepository.findOne({
        where: { userId, empresaId, isActive: true },
      });
      if (conflicto && conflicto.id !== empleadoId) {
        throw new BadRequestException(
          `El usuario ya está vinculado al empleado "${conflicto.nombre} ${conflicto.apellido}"`
        );
      }
    }

    await this.empleadoRepository.update(empleadoId, { userId: userId ?? undefined });
    return this.findEmpleadoById(empleadoId);
  }

  /**
   * Invita a un empleado al Portal del Empleado:
   * - Si ya tiene usuario vinculado → devuelve info del usuario existente
   * - Si no tiene → crea usuario con rol 'empleado', lo vincula, genera setup token (48h) y envía email
   */
  async invitarEmpleado(empleadoId: number, emailOverride?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const emp = await this.empleadoRepository.findOne({
      where: { id: empleadoId, empresaId, isActive: true },
    });
    if (!emp) throw new NotFoundException(`Empleado #${empleadoId} no encontrado`);

    // Obtener nombre de la empresa para el email
    const [empresa] = await this.dataSource.query<any[]>(
      `SELECT nombre FROM empresa WHERE id = $1 LIMIT 1`, [empresaId],
    );
    const empresaNombre = empresa?.nombre ?? 'HiCloud ERP';

    // Si ya tiene usuario vinculado → retornar estado
    if (emp.userId) {
      const [user] = await this.dataSource.query<any[]>(
        `SELECT id, email, "accountStatus" FROM users WHERE id = $1 LIMIT 1`, [emp.userId],
      );
      if (user) {
        return {
          yaVinculado: true,
          userId:      user.id,
          email:       user.email,
          estado:      user.accountStatus ?? 'activo',
          mensaje:     `${emp.nombre} ya tiene acceso al portal con el email ${user.email}`,
        };
      }
    }

    // Email a usar: el override o el del empleado
    const emailDestino = emailOverride ?? emp.email;
    if (!emailDestino) throw new BadRequestException(
      'El empleado no tiene email registrado. Ingresa un email para enviar la invitación.',
    );

    // Verificar si ya existe un usuario con ese email en el tenant
    const [existingUser] = await this.dataSource.query<any[]>(
      `SELECT u.id, u.email, u.role, u."accountStatus"
       FROM users u
       JOIN usuarios_empresas ue ON ue."usuarioId" = u.id
       WHERE LOWER(u.email) = LOWER($1) AND ue."empresaId" = $2 LIMIT 1`,
      [emailDestino, empresaId],
    );

    let userId: number;

    if (existingUser) {
      // Usuario ya existe en el tenant — solo vincularlo y enviar nuevo token
      userId = existingUser.id;
      this.logger.log(`[INVITAR-PORTAL] Usuario #${userId} ya existe — enviando nuevo setup token`);
    } else {
      // Crear nuevo usuario con rol 'empleado'
      const nombre   = emp.nombre;
      const apellido = emp.apellido;
      const passTemp = await bcrypt.hash(randomBytes(16).toString('hex'), 10); // password temporal bloqueado

      const [newUser] = await this.dataSource.query<any[]>(`
        INSERT INTO users
          (email, nombre, apellido, password, role, "isActive", "emailVerified",
           "passwordConfigured", "accountStatus", "roleVersion", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, true, true, false, 'activo', 1, NOW(), NOW())
        RETURNING id
      `, [emailDestino, nombre, apellido, passTemp, UserRole.EMPLEADO]);

      userId = newUser.id;

      // Vincular empresa al nuevo usuario
      await this.dataSource.query(`
        INSERT INTO usuarios_empresas ("usuarioId", "empresaId", rol, "isPrincipal", "isActive", "createdAt", "updatedAt")
        VALUES ($1, $2, 'empleado', true, true, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [userId, empresaId]);

      this.logger.log(`[INVITAR-PORTAL] Nuevo usuario empleado #${userId} (${emailDestino}) creado para empresa #${empresaId}`);
    }

    // Vincular empleado ↔ usuario
    await this.empleadoRepository.update(empleadoId, { userId });

    // Generar setup token (48h — más tiempo que el estándar de 24h)
    await this.dataSource.query(
      `UPDATE setup_tokens SET used = true WHERE "userId" = $1 AND used = false`,
      [userId],
    );
    const rawToken  = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas
    await this.dataSource.query(
      `INSERT INTO setup_tokens ("userId", "tokenHash", "expiresAt", used) VALUES ($1, $2, $3, false)`,
      [userId, tokenHash, expiresAt],
    );

    // Enviar email de invitación
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const setupUrl    = `${frontendUrl}/setup-password?token=${rawToken}`;

    await this.emailService.enviar({
      to:      emailDestino,
      subject: `Acceso a tu Portal del Empleado — ${empresaNombre}`,
      html:    this.buildInvitacionHtml(emp.nombre, empresaNombre, setupUrl),
    });

    this.logger.log(`[INVITAR-PORTAL] Invitación enviada a ${emailDestino} (empleado #${empleadoId}, usuario #${userId})`);

    return {
      ok:      true,
      userId,
      email:   emailDestino,
      mensaje: `Invitación enviada a ${emailDestino}. El empleado tiene 48 horas para configurar su contraseña.`,
    };
  }

  private buildInvitacionHtml(nombreEmpleado: string, empresaNombre: string, setupUrl: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family:'Inter',sans-serif; background:#f5f5f5; margin:0; padding:20px; }
    .card { background:#fff; max-width:540px; margin:0 auto; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.1); }
    .header { background:linear-gradient(135deg,#1a2c5b 0%,#0f1d3e 100%); padding:32px; color:#fff; text-align:center; }
    .header h2 { margin:0 0 6px; font-size:22px; }
    .header p  { margin:0; color:rgba(255,255,255,.75); font-size:14px; }
    .body { padding:32px; }
    .features { background:#f8fafc; border-radius:10px; padding:20px; margin:20px 0; }
    .features li { margin:8px 0; color:#475569; font-size:14px; }
    .btn { display:inline-block; background:linear-gradient(135deg,#1677ff,#0ea5e9); color:#fff !important; text-decoration:none; padding:14px 36px; border-radius:10px; font-weight:700; font-size:15px; margin:8px 0; }
    .note { color:#94a3b8; font-size:12px; margin-top:16px; }
    .footer { padding:16px; text-align:center; font-size:12px; color:#9ca3af; border-top:1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>🏢 Portal del Empleado</h2>
      <p>${empresaNombre} te ha dado acceso a HiCloud ERP</p>
    </div>
    <div class="body">
      <p>Hola <strong>${nombreEmpleado}</strong>,</p>
      <p>${empresaNombre} te ha invitado a acceder a tu <strong>Portal del Empleado</strong> donde podrás consultar:</p>
      <div class="features">
        <ul style="margin:0;padding-left:20px;">
          <li>📄 Tus recibos de nómina</li>
          <li>🏖️ Tu saldo de vacaciones y solicitar permisos</li>
          <li>📑 Tu contrato laboral</li>
          <li>💰 Tu desglose mensual de sueldo</li>
        </ul>
      </div>
      <p>Para activar tu cuenta, configura tu contraseña haciendo clic aquí:</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${setupUrl}" class="btn">Configurar mi contraseña →</a>
      </p>
      <p class="note">⏱️ Este enlace expira en <strong>48 horas</strong>. Si no lo solicitaste, ignora este mensaje.</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} HiCloud ERP · República Dominicana</div>
  </div>
</body>
</html>`;
  }

  /**
   * Lista todos los usuarios activos del tenant (para el dropdown de vinculación).
   */
  async getUsuariosTenant() {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.dataSource.query<any[]>(`
      SELECT u.id, u.email, u.nombre, u.apellido, u.role
      FROM users u
      JOIN usuarios_empresas ue ON ue."usuarioId" = u.id
      WHERE ue."empresaId" = $1
        AND u."isActive" = true
      ORDER BY u.nombre, u.apellido
    `, [empresaId]);
    return rows;
  }

  async getPrestaciones(empleadoId: number) {
    const emp = await this.findEmpleadoById(empleadoId);
    return this.calculos.calcularPrestaciones(emp);
  }

  async getHistorialEmpleado(empleadoId: number) {
    await this.findEmpleadoById(empleadoId);
    return this.lineaRepository.find({
      where: { empleadoId, isActive: true },
      relations: ['periodo'],
      order: { createdAt: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Novedades
  // ──────────────────────────────────────────────────────────────────

  async createNovedad(dto: {
    empleadoId: number;
    periodoId?: number;
    tipo: TipoNovedad;
    descripcion: string;
    monto?: number;
    horasExtras?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findEmpleadoById(dto.empleadoId);

    const novedad = this.novedadRepository.create({
      ...dto,
      empresaId,
      monto:       dto.monto       ?? 0,
      horasExtras: dto.horasExtras ?? 0,
      aplicado:    false,
    });
    return this.novedadRepository.save(novedad);
  }

  async getNovedades(empleadoId?: number, periodoId?: number, soloSinAplicar = false) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.novedadRepository
      .createQueryBuilder('n')
      .where('n.empresaId = :eid', { eid: empresaId })
      .andWhere('n.isActive = :active', { active: true });

    if (empleadoId)    qb.andWhere('n.empleadoId = :eid2', { eid2: empleadoId });
    if (periodoId)     qb.andWhere('(n.periodoId = :pid OR n.periodoId IS NULL)', { pid: periodoId });
    if (soloSinAplicar) qb.andWhere('n.aplicado = false');

    return qb.orderBy('n.createdAt', 'DESC').getMany();
  }

  async deleteNovedad(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const nov = await this.novedadRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!nov) throw new NotFoundException(`Novedad #${id} no encontrada`);
    if (nov.aplicado) throw new BadRequestException('No se puede eliminar una novedad ya aplicada');
    await this.novedadRepository.update(id, { isActive: false });
    return { message: 'Novedad eliminada' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Contratos Laborales
  // ──────────────────────────────────────────────────────────────────

  async createContrato(dto: {
    empleadoId: number;
    numero?: string;
    tipo: TipoContrato;
    fechaInicio: string;
    fechaFin?: string;
    salario: number;
    cargo: string;
    departamento?: string;
    clausulas?: string;
    lugarTrabajo?: string;
    horasSemana?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findEmpleadoById(dto.empleadoId);

    const numero = dto.numero ?? await this.generarNumeroContrato();

    const contrato = this.contratoRepository.create({
      ...dto,
      numero,
      empresaId,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin:    dto.fechaFin ? new Date(dto.fechaFin) : undefined,
      estado:      EstadoContrato.ACTIVO,
    });
    return this.contratoRepository.save(contrato);
  }

  private async generarNumeroContrato(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource,
      'contratos_laborales',
      'numero',
      '^CONT-[0-9]+$',
      'CONT-',
      4,
      empresaId,
    );
  }

  async getContratos(empleadoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.contratoRepository
      .createQueryBuilder('c')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (empleadoId) qb.andWhere('c.empleadoId = :eid2', { eid2: empleadoId });

    return qb.orderBy('c.fechaInicio', 'DESC').getMany();
  }

  async findContratoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.contratoRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Contrato #${id} no encontrado`);
    return c;
  }

  async updateContrato(id: number, dto: Partial<{ estado: string; clausulas: string; fechaFin: string }>) {
    await this.findContratoById(id);
    await this.contratoRepository.update(id, dto as any);
    return this.findContratoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Contrato Laboral — PDF y Firma Digital
  // ──────────────────────────────────────────────────────────────────

  /** Obtiene los datos necesarios y genera el PDF del contrato. */
  async getContratoPdf(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantService.getEmpresaId();
    const contrato  = await this.contratoRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!contrato) throw new NotFoundException(`Contrato #${id} no encontrado`);

    const empresa = await this.dataSource.getRepository(Empresa).findOne({ where: { id: empresaId, isActive: true } });
    if (!empresa) throw new NotFoundException('Empresa no configurada');

    return this.generarContratoPdf(contrato, empresa);
  }

  /** Marca el contrato como firmado (registro de que el físico fue firmado). */
  async marcarContratoFirmado(id: number): Promise<ContratoLaboral> {
    const empresaId = this.tenantService.getEmpresaId();
    const contrato  = await this.contratoRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!contrato) throw new NotFoundException(`Contrato #${id} no encontrado`);
    if (contrato.estadoFirma === 'firmado') throw new BadRequestException('El contrato ya está marcado como firmado');
    await this.contratoRepository.update(id, { estadoFirma: 'firmado', firmadoEn: new Date() } as any);
    return this.contratoRepository.findOne({ where: { id, empresaId } }) as Promise<ContratoLaboral>;
  }

  /**
   * Genera un PDF legal de contrato laboral (Ley 16-92 RD) con PDFKit.
   * No requiere Chrome — puro Node.js.
   */
  private async generarContratoPdf(
    contrato: ContratoLaboral,
    empresa:  Empresa,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const emp = contrato.empleado;
    const W   = 595.28;   // A4 pts
    const MAR = 60;

    const tipoMap: Record<string, string> = {
      indefinido: 'INDEFINIDO', fijo: 'PLAZO FIJO', temporal: 'TEMPORAL',
    };
    const tipoLabel    = tipoMap[contrato.tipo] ?? contrato.tipo.toUpperCase();
    const periodoLabel = (emp as any)?.tipoPago === 'quincenal' ? 'quincenal' : 'mensual';
    const ciudad       = empresa.ciudad ?? 'Santo Domingo';

    const fmtD = (d: any) =>
      d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const fmtM = (v: number) =>
      `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.toLocaleDateString('es-DO', { month: 'long' });
    const año = hoy.getFullYear();

    this.logger.log(
      `[ContratoPDF] Generando — contrato: "${contrato.numero}", empleado: "${emp?.nombre ?? 'N/A'} ${emp?.apellido ?? ''}"`,
    );

    try {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({
          size:   'A4',
          margin: MAR,
          info:   { Title: `Contrato de Trabajo — ${contrato.numero}`, Author: empresa.nombre },
        });
        doc.on('data',  (c: Buffer) => chunks.push(c));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Helpers ────────────────────────────────────────────────────────────
        const sectionTitle = (t: string) => {
          doc.moveDown(0.7);
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a56db').text(t);
          const ly = doc.y;
          doc.moveTo(MAR, ly).lineTo(W - MAR, ly).lineWidth(0.4).stroke('#c7d7f4');
          doc.moveDown(0.35);
          doc.fillColor('#1e293b');
        };
        const body = (t: string) => {
          doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b')
             .text(t, { lineGap: 2, paragraphGap: 0 });
        };

        // ── HEADER (fondo azul, dibujado sobre el margen) ───────────────────────
        doc.rect(0, 0, W, 88).fill('#1a56db');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19)
           .text('CONTRATO DE TRABAJO', 0, 16, { align: 'center', width: W });
        doc.font('Helvetica-Bold').fontSize(10).fillColor('rgba(255,255,255,0.85)')
           .text(`TIPO: ${tipoLabel}`, 0, 44, { align: 'center', width: W });
        doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.65)')
           .text(`${contrato.numero}  ·  ${empresa.nombre}`, 0, 62, { align: 'center', width: W });

        // Posicionar cursor debajo del header
        doc.y = 106;
        doc.fillColor('#1e293b');

        // ── COMPARECIENTES ─────────────────────────────────────────────────────
        sectionTitle('COMPARECIENTES');
        body(
          `Entre:\n` +
          `${empresa.nombre ?? 'LA EMPRESA'}, con RNC ${empresa.rnc ?? 'N/A'}, con domicilio en ` +
          `${empresa.direccion ?? 'su dirección registrada'}, representada por ` +
          `${empresa.representanteLegal ?? 'su Representante Legal'}, en lo adelante "EL EMPLEADOR".\n\n` +
          `Y:\n` +
          `${emp?.nombre ?? ''} ${emp?.apellido ?? ''}, portador de la Cédula de Identidad y Electoral ` +
          `No. ${emp?.cedula ?? 'N/A'}, de nacionalidad dominicana, mayor de edad, en lo adelante "EL TRABAJADOR".`,
        );

        // ── CLÁUSULA PRIMERA — OBJETO ──────────────────────────────────────────
        sectionTitle('CLÁUSULA PRIMERA — OBJETO');
        body(
          `El EMPLEADOR contrata los servicios del TRABAJADOR para desempeñar el cargo de ` +
          `${contrato.cargo ?? emp?.cargo ?? 'N/A'} en el departamento de ` +
          `${contrato.departamento ?? emp?.departamento ?? 'la empresa'}, ` +
          `en ${contrato.lugarTrabajo ?? (emp as any)?.lugarTrabajo ?? ciudad}.\n` +
          `El TRABAJADOR se obliga a prestar sus servicios con dedicación, eficiencia y en condiciones ` +
          `de subordinación y dependencia económica hacia el EMPLEADOR, conforme al Código de Trabajo de la RD.`,
        );

        // ── CLÁUSULA SEGUNDA — DURACIÓN ────────────────────────────────────────
        sectionTitle('CLÁUSULA SEGUNDA — DURACIÓN');
        if (contrato.tipo === 'indefinido' || !contrato.fechaFin) {
          body(
            `El presente contrato es de naturaleza INDEFINIDA. Inicia el ${fmtD(contrato.fechaInicio)} ` +
            `y tendrá vigencia indefinida conforme al Art. 26 del Código de Trabajo de la República Dominicana.`,
          );
        } else {
          body(
            `El presente contrato es de naturaleza DETERMINADA (${tipoLabel}).\n` +
            `Fecha de inicio: ${fmtD(contrato.fechaInicio)} — Fecha de vencimiento: ${fmtD(contrato.fechaFin)}.\n` +
            `Al vencimiento del plazo, el contrato podrá renovarse o convertirse en indefinido conforme a la ley.`,
          );
        }

        // ── CLÁUSULA TERCERA — JORNADA ─────────────────────────────────────────
        sectionTitle('CLÁUSULA TERCERA — JORNADA DE TRABAJO');
        body(
          `El TRABAJADOR laborará ${contrato.horasSemana ?? 44} horas semanales, conforme al Art. 147 del ` +
          `Código de Trabajo, que establece un máximo de 44 horas semanales para trabajo diurno.\n` +
          `Las horas trabajadas en exceso serán compensadas a una tasa no inferior al 135% del valor ` +
          `de la hora ordinaria, conforme al Art. 203 del Código de Trabajo.`,
        );

        // ── CLÁUSULA CUARTA — SALARIO ──────────────────────────────────────────
        sectionTitle('CLÁUSULA CUARTA — SALARIO');
        body(
          `El EMPLEADOR pagará al TRABAJADOR un salario de ${fmtM(Number(contrato.salario))} ${periodoLabel}.\n` +
          `Este salario no podrá ser inferior al Salario Mínimo Nacional establecido por el ` +
          `Comité Nacional de Salarios, conforme a las disposiciones del Código de Trabajo de la RD.`,
        );

        // ── CLÁUSULA QUINTA — PRESTACIONES ────────────────────────────────────
        sectionTitle('CLÁUSULA QUINTA — PRESTACIONES DE LEY');
        body(
          `El TRABAJADOR gozará de todos los beneficios establecidos por el Código de Trabajo de la ` +
          `República Dominicana, incluyendo:\n` +
          `  • Vacaciones: 14 días laborables después del primer año (Art. 177).\n` +
          `  • Preaviso: conforme a la escala establecida en el Art. 76.\n` +
          `  • Cesantía: conforme a la escala establecida en el Art. 80.\n` +
          `  • Seguro Familiar de Salud (SFS) y Fondo de Pensiones (AFP): según Ley 87-01.\n` +
          `  • Regalía Pascual: equivalente a un salario mensual ordinario (Art. 219).`,
        );

        // ── CLÁUSULA SEXTA — LUGAR ─────────────────────────────────────────────
        sectionTitle('CLÁUSULA SEXTA — LUGAR DE TRABAJO');
        body(
          `El TRABAJADOR prestará sus servicios en ` +
          `${contrato.lugarTrabajo ?? (emp as any)?.lugarTrabajo ?? ciudad}, ` +
          `pudiendo ser requerido en otros lugares por necesidades del servicio, previa notificación ` +
          `y sin detrimento de sus condiciones laborales establecidas en este contrato.`,
        );

        // ── CLÁUSULA SÉPTIMA — ADICIONALES ────────────────────────────────────
        sectionTitle('CLÁUSULA SÉPTIMA — CLÁUSULAS ADICIONALES');
        body(
          contrato.clausulas?.trim()
            ? contrato.clausulas
            : 'No aplica. Las condiciones generales de trabajo se rigen íntegramente por el Código de Trabajo de la RD.',
        );

        // ── CLÁUSULA OCTAVA — LEGISLACIÓN ─────────────────────────────────────
        sectionTitle('CLÁUSULA OCTAVA — LEGISLACIÓN APLICABLE');
        body(
          `El presente contrato se rige por las disposiciones del Código de Trabajo de la ` +
          `República Dominicana (Ley 16-92) y sus modificaciones. Para cualquier controversia ` +
          `que surja en relación con este contrato, las partes se someten a la jurisdicción de ` +
          `los Tribunales de Trabajo de la República Dominicana.`,
        );

        // ── FE DE LAS PARTES ────────────────────────────────────────────────────
        doc.moveDown(1.2);
        doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b')
           .text(
             `En fe de lo cual, las partes firman el presente contrato en dos (2) ejemplares de un ` +
             `mismo tenor y a un solo efecto, en la ciudad de ${ciudad}, a los ${dia} días del mes ` +
             `de ${mes} del año ${año}.`,
             { lineGap: 2 },
           );

        // ── FIRMAS ─────────────────────────────────────────────────────────────
        doc.moveDown(2.2);
        const fw = (W - MAR * 2 - 30) / 2;
        const sy = doc.y;

        // Empleador
        doc.moveTo(MAR, sy + 26).lineTo(MAR + fw, sy + 26).lineWidth(0.5).stroke('#374151');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
           .text('EL EMPLEADOR', MAR, sy + 30, { width: fw, align: 'center' });
        doc.font('Helvetica').fontSize(8).fillColor('#374151')
           .text(empresa.representanteLegal ?? 'Representante Legal', MAR, sy + 43, { width: fw, align: 'center' });
        doc.text(`RNC: ${empresa.rnc ?? ''}`, MAR, sy + 55, { width: fw, align: 'center' });

        // Trabajador
        doc.moveTo(MAR + fw + 30, sy + 26).lineTo(W - MAR, sy + 26).lineWidth(0.5).stroke('#374151');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
           .text('EL TRABAJADOR', MAR + fw + 30, sy + 30, { width: fw, align: 'center' });
        doc.font('Helvetica').fontSize(8).fillColor('#374151')
           .text(`${emp?.nombre ?? ''} ${emp?.apellido ?? ''}`, MAR + fw + 30, sy + 43, { width: fw, align: 'center' });
        doc.text(`Cédula: ${emp?.cedula ?? ''}`, MAR + fw + 30, sy + 55, { width: fw, align: 'center' });

        // ── FOOTER ─────────────────────────────────────────────────────────────
        doc.moveDown(2.5);
        const fy = doc.y;
        doc.moveTo(MAR, fy).lineTo(W - MAR, fy).lineWidth(0.4).stroke('#e2e8f0');
        doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af')
           .text(
             `Registro ${contrato.numero}  ·  HiCloud ERP  ·  Generado el: ${hoy.toLocaleString('es-DO')}`,
             MAR, fy + 6, { width: W - MAR * 2, align: 'center' },
           );

        doc.end();
      });

      const nombre   = `${emp?.nombre ?? 'Empleado'}-${emp?.apellido ?? ''}`.replace(/\s+/g, '-');
      const filename = `Contrato-${contrato.numero}-${nombre}.pdf`;
      this.logger.log(`[ContratoPDF] ✅ PDF generado — ${filename} (${buffer.length} bytes)`);
      return { buffer, filename };

    } catch (err: any) {
      this.logger.error(
        `[ContratoPDF] ❌ Error — contrato: "${contrato.numero}"`,
        err?.stack ?? err?.message ?? String(err),
      );
      throw new InternalServerErrorException(
        `Error al generar contrato PDF: ${err?.message ?? 'error desconocido'}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Períodos de Nómina
  // ──────────────────────────────────────────────────────────────────

  async crearPeriodo(dto: CreateNominaPeriodoDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.periodoRepository.findOne({
      where: { periodo: dto.periodo, isActive: true, empresaId } as any,
    });
    if (existe) throw new ConflictException(`Ya existe una nómina para el período ${dto.periodo}`);

    const empleadosActivos = await this.empleadoRepository.find({
      where: { estado: EstadoEmpleado.ACTIVO, isActive: true, empresaId },
    });

    if (empleadosActivos.length === 0) {
      throw new BadRequestException('No hay empleados activos para generar la nómina');
    }

    const diasPeriodo = dto.diasPeriodo ?? 30;

    const periodoData: any = {
      periodo:     dto.periodo,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin:    new Date(dto.fechaFin),
      fechaPago:   new Date(dto.fechaPago),
      diasPeriodo,
      totalEmpleados: empleadosActivos.length,
      userId,
      empresaId,
    };
    const periodo = await this.periodoRepository.save(
      this.periodoRepository.create(periodoData),
    ) as unknown as NominaPeriodo;

    // Cargar novedades sin aplicar para esta empresa (las sin periodoId se aplican a todos)
    const todasNovedades = await this.novedadRepository.find({
      where: { empresaId, isActive: true, aplicado: false },
    });

    const lineas: Partial<NominaLinea>[] = [];
    let totalBruto = 0, totalTSSEmpl = 0, totalISR = 0;
    let totalOtras = 0, totalNeto = 0, totalTSSPat = 0, totalCosto = 0;

    for (const emp of empleadosActivos) {
      // Novedades del empleado: las sin periodoId (globales) + las de este período
      const novedadesEmp = todasNovedades.filter(
        n => n.empleadoId === emp.id && (n.periodoId == null || n.periodoId === periodo.id),
      );

      // Para empleados con salario en ME, obtener tasa vigente
      const monedaEmp = (emp as any).moneda ?? 'DOP';
      let tasaCambioEmp = 1;
      if (monedaEmp !== 'DOP') {
        const [tasa] = await this.dataSource.query<any[]>(
          `SELECT "tasaVenta" FROM tasas_cambio WHERE moneda = $1 AND "isActive" = true ORDER BY fecha DESC, "createdAt" DESC LIMIT 1`,
          [monedaEmp],
        );
        tasaCambioEmp = tasa ? Number(tasa.tasaVenta) : Number((emp as any).tipoCambio ?? 1);
      }
      const c = this.calculos.calcularLinea(emp, diasPeriodo, diasPeriodo, novedadesEmp, tasaCambioEmp);
      lineas.push({ ...c, periodoId: periodo.id, empleadoId: emp.id });

      totalBruto   += c.salarioBruto;
      totalTSSEmpl += c.totalTSSEmpleado;
      totalISR     += c.isr;
      totalOtras   += c.otrasDeduciones + c.otrosDescuentos;
      totalNeto    += c.salarioNeto;
      totalTSSPat  += c.totalTSSPatronal;
      totalCosto   += c.costoTotalEmpleado;
    }

    await this.lineaRepository.save(this.lineaRepository.create(lineas));

    await this.periodoRepository.update(periodo.id, {
      totalSalariosBruto:    Number(totalBruto.toFixed(2)),
      totalTSSEmpleados:     Number(totalTSSEmpl.toFixed(2)),
      totalISR:              Number(totalISR.toFixed(2)),
      totalOtrasDeducciones: Number(totalOtras.toFixed(2)),
      totalNeto:             Number(totalNeto.toFixed(2)),
      totalTSSPatronal:      Number(totalTSSPat.toFixed(2)),
      totalCostoEmpresa:     Number(totalCosto.toFixed(2)),
    });

    // Marcar novedades sin periodoId como aplicadas (se ejecutaron en este período)
    const novedadesGlobales = todasNovedades.filter(n => n.periodoId == null);
    if (novedadesGlobales.length > 0) {
      await this.novedadRepository
        .createQueryBuilder()
        .update()
        .set({ aplicado: true, periodoId: periodo.id })
        .whereInIds(novedadesGlobales.map(n => n.id))
        .execute();
    }

    return this.findPeriodoById(periodo.id);
  }

  async getPeriodos(filtro: FiltroNominaPeriodoDto) {
    const { limit = 10, page = 1, estado, periodo } = filtro;
    const empresaId = this.tenantService.getEmpresaId();

    const qb = this.periodoRepository
      .createQueryBuilder('p')
      .where('p.isActive = :active', { active: true })
      .andWhere('p.empresaId = :eid', { eid: empresaId });

    if (estado)  qb.andWhere('p.estado = :estado', { estado });
    if (periodo) qb.andWhere('p.periodo LIKE :per', { per: `${periodo}%` });

    const [data, total] = await qb
      .orderBy('p.periodo', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findPeriodoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const p = await this.periodoRepository.findOne({
      where: { id, isActive: true, empresaId } as any,
      relations: ['user'],
    });
    if (!p) throw new NotFoundException(`Período de nómina #${id} no encontrado`);
    return p;
  }

  async getLineasPeriodo(periodoId: number) {
    await this.findPeriodoById(periodoId);
    return this.lineaRepository.find({
      where: { periodoId, isActive: true },
      relations: ['empleado'],
      order: { empleado: { apellido: 'ASC' } },
    });
  }

  async procesarPeriodo(id: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado !== EstadoNomina.BORRADOR) {
      throw new BadRequestException(`Solo se pueden procesar períodos en BORRADOR`);
    }
    await this.periodoRepository.update(id, { estado: EstadoNomina.PROCESADA });
    return this.findPeriodoById(id);
  }

  async pagarPeriodo(id: number, userId: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado !== EstadoNomina.PROCESADA) {
      throw new BadRequestException(`Solo se pueden pagar períodos en estado PROCESADA`);
    }

    await this.periodoRepository.update(id, { estado: EstadoNomina.PAGADA });

    await this.asientosService.asientoNomina(
      periodo.id,
      Number(periodo.totalSalariosBruto),
      Number(periodo.totalNeto),
      Number(periodo.totalTSSEmpleados),
      Number(periodo.totalISR),
      Number(periodo.totalTSSPatronal),
      periodo.periodo,
      userId,
    );

    await this.tesoreriaService.registrarMovimientoAutomatico(
      TipoMovimientoBancario.RETIRO,
      Number(periodo.totalNeto),
      `Pago nómina ${periodo.periodo} — ${periodo.totalEmpleados} empleados`,
      OrigenMovimiento.NOMINA,
      periodo.id,
      userId,
    );

    return this.findPeriodoById(id);
  }

  async anularPeriodo(id: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado === EstadoNomina.PAGADA) {
      throw new BadRequestException('No se puede anular una nómina ya pagada');
    }
    if (periodo.estado === EstadoNomina.ANULADA) {
      throw new BadRequestException('La nómina ya está anulada');
    }
    await this.periodoRepository.update(id, { estado: EstadoNomina.ANULADA });
    return this.findPeriodoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Archivo de Banco (ACH / transferencias masivas)
  // ──────────────────────────────────────────────────────────────────

  async generarArchivoBanco(periodoId: number): Promise<{ csv: string; filename: string; totalLineas: number }> {
    const periodo = await this.findPeriodoById(periodoId);
    const lineas  = await this.getLineasPeriodo(periodoId);

    const rows: string[] = [
      'Banco,Cuenta,Nombre,Cedula,Monto,Periodo',
    ];

    for (const l of lineas) {
      const emp = l.empleado;
      rows.push([
        `"${emp.banco ?? ''}"`,
        `"${emp.cuentaBancaria ?? ''}"`,
        `"${emp.nombre} ${emp.apellido}"`,
        `"${emp.cedula}"`,
        Number(l.salarioNeto ?? 0).toFixed(2),
        `"${periodo.periodo}"`,
      ].join(','));
    }

    return {
      csv:         rows.join('\r\n'),
      filename:    `Nomina-Banco-${periodo.periodo}.csv`,
      totalLineas: lineas.length,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Recibos
  // ──────────────────────────────────────────────────────────────────

  async getReciboEmpleado(periodoId: number, empleadoId: number) {
    const periodo = await this.findPeriodoById(periodoId);
    const linea   = await this.lineaRepository.findOne({
      where: { periodoId, empleadoId, isActive: true },
      relations: ['empleado'],
    });
    if (!linea) {
      throw new NotFoundException(`No se encontró línea de nómina para ese empleado en el período`);
    }

    const emp = linea.empleado;
    let novedades: any[] = [];
    try { novedades = JSON.parse(linea.novedadesDetalle ?? '[]'); } catch { novedades = []; }

    return {
      empresa: { nombre: 'HiCloud ERP', rnc: process.env['ECF_RNC_EMISOR'] ?? '' },
      empleado: {
        cedula:       emp.cedula,
        nombre:       `${emp.nombre} ${emp.apellido}`,
        cargo:        emp.cargo,
        departamento: emp.departamento,
        fechaIngreso: emp.fechaIngreso,
        banco:        emp.banco,
        cuentaBancaria: emp.cuentaBancaria,
      },
      periodo: {
        periodo:       periodo.periodo,
        fechaInicio:   periodo.fechaInicio,
        fechaFin:      periodo.fechaFin,
        fechaPago:     periodo.fechaPago,
        diasTrabajados: linea.diasTrabajados,
      },
      ingresos: {
        salarioBase:      Number(linea.salarioBase),
        horasExtras:      linea.horasExtras ?? 0,
        montoHorasExtras: Number(linea.montoHorasExtras ?? 0),
        bonos:            Number(linea.bonos ?? 0),
        salarioBruto:     Number(linea.salarioBruto),
      },
      deducciones: {
        tssSFS:          Number(linea.tssSfsEmpleado),
        tssAFP:          Number(linea.tssAfpEmpleado),
        totalTSS:        Number(linea.totalTSSEmpleado),
        isr:             Number(linea.isr),
        otras:           Number(linea.otrasDeduciones),
        otrosDescuentos: Number(linea.otrosDescuentos ?? 0),
        total:           Number(linea.totalDeducciones),
      },
      novedades,
      salarioNeto: Number(linea.salarioNeto),
      costoEmpresa: {
        salarioBruto:     Number(linea.salarioBruto),
        tssSFSPatronal:   Number(linea.tssSfsPatronal),
        tssAFPPatronal:   Number(linea.tssAfpPatronal),
        tssSRLPatronal:   Number(linea.tssSrlPatronal),
        totalTSSPatronal: Number(linea.totalTSSPatronal),
        costoTotal:       Number(linea.costoTotalEmpleado),
      },
      generadoEn: new Date().toISOString(),
    };
  }

  /**
   * Genera el recibo de sueldo en PDF usando PDFKit (puro Node.js).
   * No requiere Puppeteer ni Chrome — funciona en cualquier servidor.
   */
  async generarReciboPdf(data: any): Promise<{ buffer: Buffer; filename: string }> {
    const emp  = data.empleado    ?? {};
    const per  = data.periodo     ?? {};
    const ing  = data.ingresos    ?? {};
    const ded  = data.deducciones ?? {};
    const emp2 = data.empresa     ?? {};
    const novedades: any[] = data.novedades ?? [];

    this.logger.log(
      `[ReciboPDF] Generando recibo PDFKit — empleado: "${emp.nombre ?? 'N/A'}", período: "${per.periodo ?? 'N/A'}"`,
    );

    try {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          info: { Title: 'Recibo de Sueldo', Author: emp2.nombre ?? 'HiCloud ERP' },
        });

        doc.on('data',  (c: Buffer) => chunks.push(c));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Helpers ──────────────────────────────────────────────────────────
        const W   = 595.28;   // A4 ancho en pts
        const MAR = 36;       // margen lateral
        const CW  = W - MAR * 2;
        const fmtM = (v: number) =>
          `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
        const fmtD = (d: any) =>
          d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

        // ── HEADER (fondo azul) ───────────────────────────────────────────────
        doc.rect(0, 0, W, 80).fill('#1a56db');
        doc.fillColor('#ffffff')
           .font('Helvetica-Bold').fontSize(7)
           .text('RECIBO DE SUELDO', MAR, 14, { characterSpacing: 1 });
        doc.font('Helvetica-Bold').fontSize(18)
           .text(emp2.nombre ?? 'HiCloud ERP', MAR, 24);
        if (emp2.rnc) {
          doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.8)')
             .text(`RNC: ${emp2.rnc}`, MAR, 47);
        }
        // Período — derecha
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
           .text(per.periodo ?? '', 0, 28, { align: 'right', width: W - MAR });
        doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.85)')
           .text(`${fmtD(per.fechaInicio)} — ${fmtD(per.fechaFin)}`, 0, 47, { align: 'right', width: W - MAR });
        doc.text(`Pago: ${fmtD(per.fechaPago)}`, 0, 59, { align: 'right', width: W - MAR });

        // ── DATOS EMPLEADO ────────────────────────────────────────────────────
        let y = 96;
        doc.rect(MAR, y, CW, 90).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.rect(MAR, y, 4, 90).fill('#1a56db');

        doc.fillColor('#1a56db').font('Helvetica-Bold').fontSize(7)
           .text('DATOS DEL EMPLEADO', MAR + 12, y + 10, { characterSpacing: 0.5 });

        const colW = CW / 2 - 10;
        const campos = [
          ['Nombre',          emp.nombre        ?? '—'],
          ['Cédula',          emp.cedula         ?? '—'],
          ['Cargo',           emp.cargo          ?? '—'],
          ['Departamento',    emp.departamento   ?? '—'],
          ['Banco',           emp.banco          ?? '—'],
          ['Cuenta',          emp.cuentaBancaria ?? '—'],
        ];
        campos.forEach(([lbl, val], i) => {
          const cx = MAR + 12 + (i % 2 === 0 ? 0 : colW + 20);
          const cy = y + 24 + Math.floor(i / 2) * 18;
          doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(`${lbl}: `, cx, cy, { continued: true });
          doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8).text(val);
        });
        // Días trabajados
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Días trabajados: ', MAR + 12, y + 24 + 3 * 18, { continued: true });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(String(per.diasTrabajados ?? 30));

        // ── TABLA INGRESOS / DEDUCCIONES ──────────────────────────────────────
        y += 100;
        const half = (CW - 12) / 2;

        // Cabecera INGRESOS
        doc.rect(MAR, y, half, 18).fill('#059669');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
           .text('INGRESOS', MAR + 6, y + 6, { characterSpacing: 0.5 });

        // Cabecera DEDUCCIONES
        doc.rect(MAR + half + 12, y, half, 18).fill('#dc2626');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
           .text('DEDUCCIONES', MAR + half + 18, y + 6, { characterSpacing: 0.5 });

        y += 18;

        // Filas ingresos
        const ingFilas: [string, number][] = [
          ['Salario Base', ing.salarioBase ?? 0],
          ...(ing.montoHorasExtras > 0 ? [[`Horas Extras (${ing.horasExtras}h)`, ing.montoHorasExtras]] as [string,number][] : []),
          ...(ing.bonos > 0             ? [['Bonos', ing.bonos]]                                        as [string,number][] : []),
          ['Salario Bruto', ing.salarioBruto ?? 0],
        ];
        // Filas deducciones
        const dedFilas: [string, number][] = [
          ['TSS — SFS',   ded.tssSFS  ?? 0],
          ['TSS — AFP',   ded.tssAFP  ?? 0],
          ['ISR',         ded.isr     ?? 0],
          ...(ded.otras > 0           ? [['Otras fijas',        ded.otras]]         as [string,number][] : []),
          ...(ded.otrosDescuentos > 0 ? [['Descuentos/Ausencias', ded.otrosDescuentos]] as [string,number][] : []),
          ['Total deducciones', ded.total ?? 0],
        ];
        const rowH = 16;
        const maxRows = Math.max(ingFilas.length, dedFilas.length);

        for (let i = 0; i < maxRows; i++) {
          const ry = y + i * rowH;
          const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
          doc.rect(MAR,             ry, half, rowH).fill(bg);
          doc.rect(MAR + half + 12, ry, half, rowH).fill(bg);

          if (ingFilas[i]) {
            const [lbl, val] = ingFilas[i];
            const isBruto = lbl === 'Salario Bruto';
            doc.fillColor(isBruto ? '#1a56db' : '#374151')
               .font(isBruto ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
               .text(lbl, MAR + 6, ry + 4, { width: half - 80 });
            doc.fillColor(isBruto ? '#1a56db' : '#111111')
               .font('Helvetica-Bold').fontSize(8)
               .text(fmtM(val), MAR + 6, ry + 4, { width: half - 8, align: 'right' });
          }
          if (dedFilas[i]) {
            const [lbl, val] = dedFilas[i];
            const isTotal = lbl === 'Total deducciones';
            doc.fillColor(isTotal ? '#dc2626' : '#374151')
               .font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
               .text(lbl, MAR + half + 18, ry + 4, { width: half - 80 });
            doc.fillColor(isTotal ? '#dc2626' : '#111111')
               .font('Helvetica-Bold').fontSize(8)
               .text(fmtM(val), MAR + half + 18, ry + 4, { width: half - 8, align: 'right' });
          }
        }
        y += maxRows * rowH + 6;

        // ── NOVEDADES ─────────────────────────────────────────────────────────
        if (novedades.length > 0) {
          doc.rect(MAR, y, CW, 16).fill('#7c3aed');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
             .text('NOVEDADES DEL PERÍODO', MAR + 6, y + 5, { characterSpacing: 0.5 });
          y += 16;
          novedades.forEach((n: any, i: number) => {
            const esDesc = n.tipo === 'ausencia' || n.tipo === 'descuento';
            doc.rect(MAR, y, CW, 15).fill(i % 2 === 0 ? '#faf5ff' : '#ffffff');
            doc.fillColor('#374151').font('Helvetica').fontSize(8)
               .text(`${n.descripcion}${n.horas ? ` (${n.horas}h)` : ''}`, MAR + 6, y + 3, { width: CW - 120 });
            doc.fillColor(esDesc ? '#dc2626' : '#059669')
               .font('Helvetica-Bold').fontSize(8)
               .text(`${esDesc ? '-' : '+'}${fmtM(Math.abs(n.monto))}`, MAR + 6, y + 3, { width: CW - 8, align: 'right' });
            y += 15;
          });
          y += 4;
        }

        // ── CAJA SALARIO NETO ─────────────────────────────────────────────────
        y += 4;
        doc.rect(MAR, y, CW, 44).fill('#1a56db');
        doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica-Bold').fontSize(8)
           .text('SALARIO NETO A COBRAR', MAR + 14, y + 10, { characterSpacing: 1 });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
           .text(fmtM(data.salarioNeto ?? 0), MAR + 14, y + 19, { width: CW - 20, align: 'right' });
        y += 54;

        // ── FIRMAS ────────────────────────────────────────────────────────────
        y += 24;
        const fw = (CW - 20) / 2;
        doc.moveTo(MAR, y + 24).lineTo(MAR + fw, y + 24).stroke('#374151');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Firma del Empleado', MAR, y + 27, { width: fw, align: 'center' });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(emp.nombre ?? '', MAR, y + 38, { width: fw, align: 'center' });

        doc.moveTo(MAR + fw + 20, y + 24).lineTo(MAR + CW, y + 24).stroke('#374151');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Recursos Humanos', MAR + fw + 20, y + 27, { width: fw, align: 'center' });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(emp2.nombre ?? '', MAR + fw + 20, y + 38, { width: fw, align: 'center' });

        // ── FOOTER ────────────────────────────────────────────────────────────
        doc.moveTo(MAR, 800).lineTo(W - MAR, 800).stroke('#e2e8f0');
        doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
           .text('HiCloud ERP · Recibo generado automáticamente', MAR, 806)
           .text(new Date().toLocaleString('es-DO'), 0, 806, { align: 'right', width: W - MAR });

        doc.end();
      });

      const nombre   = `${emp.nombre ?? 'Empleado'}`.replace(/\s+/g, '-');
      const filename = `Recibo-${nombre}-${per.periodo ?? ''}.pdf`;
      this.logger.log(`[ReciboPDF] ✅ PDF generado (PDFKit) — ${filename} (${buffer.length} bytes)`);
      return { buffer, filename };

    } catch (err: any) {
      this.logger.error(
        `[ReciboPDF] ❌ Error — empleado: "${emp.nombre ?? 'N/A'}", período: "${per.periodo ?? 'N/A'}"`,
        err?.stack ?? err?.message ?? String(err),
      );
      throw new InternalServerErrorException(
        `Error al generar el recibo PDF: ${err?.message ?? 'error desconocido'}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen general
  // ──────────────────────────────────────────────────────────────────

  async getResumenNomina() {
    const empresaId = this.tenantService.getEmpresaId();
    const [totalEmpleados, empleadosActivos] = await Promise.all([
      this.empleadoRepository.count({ where: { isActive: true, empresaId } }),
      this.empleadoRepository.count({ where: { estado: EstadoEmpleado.ACTIVO, isActive: true, empresaId } }),
    ]);

    const ultimoPeriodo = await this.periodoRepository.findOne({
      where: { estado: EstadoNomina.PAGADA, isActive: true, empresaId } as any,
      order: { periodo: 'DESC' },
    });

    const periodosEnProceso = await this.periodoRepository.count({
      where: { estado: EstadoNomina.PROCESADA, isActive: true, empresaId } as any,
    });

    const novedadesPendientes = await this.novedadRepository.count({
      where: { empresaId, isActive: true, aplicado: false },
    });

    return {
      empleados: { total: totalEmpleados, activos: empleadosActivos },
      ultimoPeriodoPagado: ultimoPeriodo
        ? {
          periodo:   ultimoPeriodo.periodo,
          totalNeto: Number(ultimoPeriodo.totalNeto),
          empleados: ultimoPeriodo.totalEmpleados,
        }
        : null,
      periodosEnProceso,
      novedadesPendientes,
      generadoEn: new Date().toISOString(),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Préstamos a Empleados
  // ──────────────────────────────────────────────────────────────────

  async createPrestamo(dto: {
    empleadoId: number;
    monto: number;
    cuotas: number;
    fechaDesembolso: string;
    descripcion?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const empleado = await this.empleadoRepository.findOne({
      where: { id: dto.empleadoId, empresaId, isActive: true },
    });
    if (!empleado) throw new NotFoundException(`Empleado #${dto.empleadoId} no encontrado`);

    const montoMensual = Math.ceil((dto.monto / dto.cuotas) * 100) / 100;

    const prestamo = this.prestamoRepository.create({
      empleadoId: dto.empleadoId,
      monto: dto.monto,
      cuotas: dto.cuotas,
      cuotasPagadas: 0,
      montoMensual,
      saldoPendiente: dto.monto,
      fechaDesembolso: new Date(dto.fechaDesembolso),
      descripcion: dto.descripcion,
      estado: EstadoPrestamo.ACTIVO,
      empresaId,
    });
    return this.prestamoRepository.save(prestamo);
  }

  async getPrestamos(empleadoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.prestamoRepository
      .createQueryBuilder('p')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = true');

    if (empleadoId) qb.andWhere('p.empleadoId = :eid2', { eid2: empleadoId });

    return qb
      .orderBy('p.createdAt', 'DESC')
      .getMany();
  }

  async registrarCuotaPrestamo(prestamoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const prestamo = await this.prestamoRepository.findOne({
      where: { id: prestamoId, empresaId, isActive: true },
    });
    if (!prestamo) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    if (prestamo.estado !== EstadoPrestamo.ACTIVO) {
      throw new BadRequestException(`El préstamo ya está ${prestamo.estado}`);
    }

    const nuevasCuotas = prestamo.cuotasPagadas + 1;
    const nuevoSaldo = Math.max(0, Number(prestamo.saldoPendiente) - Number(prestamo.montoMensual));
    const nuevoEstado = nuevasCuotas >= prestamo.cuotas || nuevoSaldo <= 0
      ? EstadoPrestamo.SALDADO
      : EstadoPrestamo.ACTIVO;

    await this.prestamoRepository.update(prestamoId, {
      cuotasPagadas: nuevasCuotas,
      saldoPendiente: nuevoSaldo,
      estado: nuevoEstado,
    });

    return this.prestamoRepository.findOneOrFail({ where: { id: prestamoId } });
  }

  async anularPrestamo(prestamoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const prestamo = await this.prestamoRepository.findOne({
      where: { id: prestamoId, empresaId, isActive: true },
    });
    if (!prestamo) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    if (prestamo.estado === EstadoPrestamo.SALDADO) {
      throw new BadRequestException('No se puede anular un préstamo ya saldado');
    }
    await this.prestamoRepository.update(prestamoId, { estado: EstadoPrestamo.ANULADO });
    return { message: 'Préstamo anulado correctamente' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Anticipos de Nómina
  // ──────────────────────────────────────────────────────────────────

  async createAnticipo(dto: {
    empleadoId: number;
    monto: number;
    periodoDescontar: string;
    descripcion?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const empleado = await this.empleadoRepository.findOne({
      where: { id: dto.empleadoId, empresaId, isActive: true },
    });
    if (!empleado) throw new NotFoundException(`Empleado #${dto.empleadoId} no encontrado`);

    if (!/^\d{4}-\d{2}$/.test(dto.periodoDescontar)) {
      throw new BadRequestException('periodoDescontar debe tener formato YYYY-MM');
    }

    const anticipo = this.anticipoRepository.create({
      empleadoId: dto.empleadoId,
      monto: dto.monto,
      periodoDescontar: dto.periodoDescontar,
      descripcion: dto.descripcion,
      estado: EstadoAnticipo.PENDIENTE,
      empresaId,
    });
    return this.anticipoRepository.save(anticipo);
  }

  async getAnticipos(empleadoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.anticipoRepository
      .createQueryBuilder('a')
      .where('a.empresaId = :eid', { eid: empresaId })
      .andWhere('a.isActive = true');

    if (empleadoId) qb.andWhere('a.empleadoId = :eid2', { eid2: empleadoId });

    return qb
      .orderBy('a.createdAt', 'DESC')
      .getMany();
  }

  async anularAnticipo(anticipoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const anticipo = await this.anticipoRepository.findOne({
      where: { id: anticipoId, empresaId, isActive: true },
    });
    if (!anticipo) throw new NotFoundException(`Anticipo #${anticipoId} no encontrado`);
    if (anticipo.estado !== EstadoAnticipo.PENDIENTE) {
      throw new BadRequestException(`El anticipo ya está ${anticipo.estado}`);
    }
    await this.anticipoRepository.update(anticipoId, { estado: EstadoAnticipo.ANULADO });
    return { message: 'Anticipo anulado correctamente' };
  }
}
