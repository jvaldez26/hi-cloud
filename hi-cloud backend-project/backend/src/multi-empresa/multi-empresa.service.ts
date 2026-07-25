import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UsuarioEmpresa } from './entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { User } from '../users/users.entity';
import {
  AsignarUsuarioEmpresaDto,
  CambiarEmpresaDto,
  CreateEmpresaTenantDto,
} from './dto/multi-empresa.dto';
import {
  UserRole,
  ROLES_ASIGNABLES_EMPRESA,
  esRolAsignablePorEmpresa,
} from '../users/enums/user-role.enum';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';
import { EmailService }        from '../notificaciones/services/email.service';
import { invalidateMembresiaCache, invalidateRoleCache } from '../auth/guards/roles.guard';

@Injectable()
export class MultiEmpresaService {
  private readonly logger = new Logger(MultiEmpresaService.name);

  constructor(
    @InjectRepository(UsuarioEmpresa)
    private usuarioEmpresaRepo: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private empresaRepo:        Repository<Empresa>,
    @InjectRepository(Sucursal)
    private sucursalRepo:       Repository<Sucursal>,
    @InjectRepository(User)
    private usuarioRepo:        Repository<User>,
    private contabilidadSvc:    ContabilidadService,
    private emailSvc:           EmailService,
    @InjectDataSource() private ds: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: any,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // S-61 — Control de acceso por pertenencia
  // ──────────────────────────────────────────────────────────────────

  /**
   * S-61: exige que el solicitante pertenezca a `empresaId`.
   *
   * /multi-empresa está protegido con @Roles(ADMIN) — el rol de cualquier admin
   * de cualquier empresa cliente — y el RolesGuard solo valida la membresía de la
   * empresa del JWT, NUNCA la del :empresaId de la ruta. Sin esta comprobación un
   * admin de la empresa A opera sobre la empresa B.
   *
   * El super_admin queda exento: gestiona la plataforma y no tiene filas en
   * usuario_empresa. Se verifica contra el rol real de BD (JwtStrategy carga la
   * entidad User), nunca contra un valor del cliente.
   */
  private async assertAccesoEmpresa(
    empresaId: number,
    solicitanteId?: number,
    solicitanteRole?: string,
    accion = 'acceder a esta empresa',
  ): Promise<void> {
    if (solicitanteRole === UserRole.SUPER_ADMIN) return;

    if (!solicitanteId) {
      throw new ForbiddenException('No se pudo identificar al solicitante');
    }

    const membresia = await this.usuarioEmpresaRepo.findOne({
      where: { userId: solicitanteId, empresaId, isActive: true },
    });

    if (!membresia) {
      this.logger.warn(
        `[S-61] Solicitante #${solicitanteId} intentó ${accion} en la empresa ` +
        `#${empresaId} sin pertenecer a ella`,
      );
      throw new ForbiddenException(`No tienes acceso a la empresa #${empresaId}`);
    }
  }

  /** IDs de las empresas activas donde el usuario tiene membresía. */
  private async empresaIdsDeUsuario(userId: number): Promise<number[]> {
    const filas = await this.usuarioEmpresaRepo.find({
      where: { userId, isActive: true },
      select: ['empresaId'],
    });
    return filas.map(f => f.empresaId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Gestión de empresas
  // ──────────────────────────────────────────────────────────────────

  /**
   * S-61: un admin normal solo ve SUS empresas. Antes devolvía todas las del
   * sistema (RNC + razón social de toda la cartera de clientes) a cualquier admin.
   */
  async getTodasEmpresas(solicitanteId?: number, solicitanteRole?: string) {
    if (solicitanteRole === UserRole.SUPER_ADMIN) {
      return this.empresaRepo.find({ where: { isActive: true }, order: { nombre: 'ASC' } });
    }

    if (!solicitanteId) throw new ForbiddenException('No se pudo identificar al solicitante');

    const ids = await this.empresaIdsDeUsuario(solicitanteId);
    if (ids.length === 0) return [];

    return this.empresaRepo.find({
      where: { id: In(ids), isActive: true },
      order: { nombre: 'ASC' },
    });
  }

  async createEmpresa(dto: CreateEmpresaTenantDto): Promise<Empresa> {
    const existe = await this.empresaRepo.findOne({ where: { rnc: dto.rnc } });
    if (existe) throw new ConflictException(`RNC ${dto.rnc} ya está registrado`);

    const empresa = this.empresaRepo.create({
      ...dto,
      moneda:            'DOP',
      zonaHoraria:       'America/Santo_Domingo',
      estadoAprobacion:  'pendiente',
    });
    return this.empresaRepo.save(empresa);
  }

  async createEmpresaConAdmin(dto: CreateEmpresaTenantDto, adminId: number): Promise<Empresa & { empresaId: number; pendienteAprobacion: true }> {
    const empresa = await this.createEmpresa(dto);

    // Vincular al creador como admin principal de la empresa
    const asignacion = new UsuarioEmpresa();
    asignacion.userId      = adminId;
    asignacion.empresaId   = empresa.id;
    asignacion.rol         = UserRole.ADMIN;
    asignacion.isPrincipal = true;
    await this.usuarioEmpresaRepo.save(asignacion);

    // Si el creador era VIEWER (registro Google pendiente sin empresa),
    // promoverlo a ADMIN ahora que tiene su empresa.
    // Esto permite que /auth/mis-empresas funcione correctamente.
    await this.usuarioRepo.update(
      { id: adminId, role: UserRole.VIEWER },
      { role: UserRole.ADMIN },
    );

    // Crear sucursal principal por defecto
    await this.sucursalRepo.save(
      this.sucursalRepo.create({
        empresaId:   empresa.id,
        codigo:      'PRIN',
        nombre:      'Sucursal Principal',
        ciudad:      dto.ciudad ?? 'Santo Domingo',
        esPrincipal: true,
      }),
    );

    // Sembrar Plan de Cuentas dominicano para la nueva empresa
    try {
      await this.contabilidadSvc.seedPlanCuentas(empresa.id);
    } catch (err: any) {
      this.logger.warn(`seedPlanCuentas empresa ${empresa.id}: ${err?.message ?? err}`);
    }

    // Notificar al Super Admin de la nueva solicitud
    const [solicitante] = await this.ds.query<any[]>(
      `SELECT nombre, email FROM users WHERE id = $1 LIMIT 1`, [adminId],
    );
    const adminEmail    = process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@hicloudrd.com';
    const frontendUrl   = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

    this.emailSvc.enviar({
      to:      adminEmail,
      subject: `Nueva solicitud de empresa — ${empresa.nombre}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1a56db">Nueva solicitud de empresa</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px;color:#555">Empresa:</td><td style="padding:6px;font-weight:700">${empresa.nombre}</td></tr>
          <tr><td style="padding:6px;color:#555">RNC:</td><td style="padding:6px">${empresa.rnc}</td></tr>
          <tr><td style="padding:6px;color:#555">Solicitante:</td><td style="padding:6px">${solicitante?.nombre ?? '—'} (${solicitante?.email ?? '—'})</td></tr>
          <tr><td style="padding:6px;color:#555">Sector:</td><td style="padding:6px">${empresa.sector ?? '—'}</td></tr>
        </table>
        <p style="margin-top:16px">
          <a href="${frontendUrl}/super-admin" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
            Revisar en el panel →
          </a>
        </p>
      </div>`,
    }).catch(err => this.logger.warn(`Email notif super admin empresa #${empresa.id}: ${err?.message}`));

    return Object.assign({}, empresa, { empresaId: empresa.id, pendienteAprobacion: true as const });
  }

  async getEmpresaById(id: number): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id, isActive: true } });
    if (!empresa) throw new NotFoundException(`Empresa #${id} no encontrada`);
    return empresa;
  }

  /** S-61: detalle de empresa — solo la propia (o cualquiera si es super_admin). */
  async getEmpresaDetalle(id: number, solicitanteId?: number, solicitanteRole?: string): Promise<Empresa> {
    await this.assertAccesoEmpresa(id, solicitanteId, solicitanteRole, 'consultar la empresa');
    return this.getEmpresaById(id);
  }

  async updateEmpresa(
    id: number,
    dto: Partial<CreateEmpresaTenantDto>,
    solicitanteId?: number,
    solicitanteRole?: string,
  ): Promise<Empresa> {
    // S-61: sin esto, un admin de otra empresa podía reescribir RNC, razón social
    // o datos fiscales de cualquier empresa de la plataforma.
    await this.assertAccesoEmpresa(id, solicitanteId, solicitanteRole, 'modificar la empresa');
    await this.getEmpresaById(id);
    await this.empresaRepo.update(id, dto);
    return this.getEmpresaById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Gestión de accesos de usuarios a empresas
  // ──────────────────────────────────────────────────────────────────

  async getEmpresasDeUsuario(userId: number, isGlobalAdmin = false) {
    // IS NOT FALSE captura isActive=true Y isActive=NULL (registros legados)
    // sin depender de quotes ni naming strategy de TypeORM
    const accesos = await this.usuarioEmpresaRepo
      .createQueryBuilder('ue')
      .leftJoinAndSelect('ue.empresa', 'e')
      .where({ userId })
      .andWhere('ue.isActive IS NOT FALSE')
      .orderBy('ue.isPrincipal', 'DESC')
      .getMany();

    if (accesos.length > 0) {
      const filtradas = accesos.filter((a) => a.empresa?.isActive !== false);
      const empresaIds = filtradas.map(a => a.empresaId);

      let planMap: Record<number, string> = {};
      if (empresaIds.length > 0) {
        const rows = await this.ds.query<{ empresaId: number; plan: string }[]>(
          `SELECT "empresaId", plan FROM suscripciones WHERE "empresaId" = ANY($1::int[]) ORDER BY id DESC`,
          [empresaIds],
        );
        for (const r of rows) {
          if (!planMap[r.empresaId]) planMap[r.empresaId] = r.plan;
        }
      }

      return filtradas.map((a) => ({
        empresaId:          a.empresaId,
        nombre:             a.empresa.nombre,
        rnc:                a.empresa.rnc,
        rol:                a.rol,
        isPrincipal:        a.isPrincipal,
        plan:               planMap[a.empresaId] ?? null,
        estadoAprobacion:   (a.empresa as any).estadoAprobacion  ?? 'aprobada',
        motivoRechazo:      (a.empresa as any).motivoRechazo     ?? null,
      }));
    }

    // S-61: solo el SUPER_ADMIN sin vinculación ve todas las empresas. El caller
    // pasaba `role === ADMIN`, así que un admin de empresa sin membresías activas
    // recibía la cartera completa de clientes (nombre + RNC).
    if (isGlobalAdmin) {
      const todas = await this.empresaRepo.find({ where: { isActive: true }, order: { nombre: 'ASC' } });
      return todas.map((e) => ({
        empresaId:   e.id,
        nombre:      e.nombre,
        rnc:         e.rnc,
        rol:         'admin',
        isPrincipal: false,
      }));
    }

    return [];
  }

  async getUsuariosDeEmpresa(empresaId: number, solicitanteId?: number, solicitanteRole?: string) {
    // S-61: exponía nombre, email y rol de los usuarios de cualquier empresa.
    await this.assertAccesoEmpresa(empresaId, solicitanteId, solicitanteRole, 'listar usuarios');
    await this.getEmpresaById(empresaId);
    return this.usuarioEmpresaRepo.find({
      where: { empresaId, isActive: true },
      relations: ['user'],
      order: { rol: 'ASC' },
    });
  }

  async asignarUsuario(
    empresaId: number,
    dto: AsignarUsuarioEmpresaDto,
    adminId: number,
    solicitanteRole?: string,
  ) {
    // S-61: sin esto, un admin podía auto-asignarse a CUALQUIER empresa de la
    // plataforma y obtener acceso completo al ERP de ese cliente.
    await this.assertAccesoEmpresa(empresaId, adminId, solicitanteRole, 'asignar usuarios');

    // S-60.1: misma lista blanca que cambiarRolUsuario — asignar a un usuario con
    // rol 'super_admin' en usuario_empresa hacía que buildToken() emitiera un JWT
    // con role='super_admin' (auth.service usa empresaRole ?? user.role).
    if (!esRolAsignablePorEmpresa(dto.rol)) {
      this.logger.warn(
        `[S-60] Intento de asignar rol no permitido "${dto.rol}" a usuario #${dto.userId} ` +
        `en empresa #${empresaId} por admin #${adminId}`,
      );
      throw new ForbiddenException(
        `El rol "${dto.rol}" no puede asignarse desde la gestión de empresa. ` +
        `Permitidos: ${ROLES_ASIGNABLES_EMPRESA.join(', ')}.`,
      );
    }

    await this.getEmpresaById(empresaId);

    const usuario = await this.usuarioRepo.findOne({ where: { id: dto.userId, isActive: true } });
    if (!usuario) throw new NotFoundException(`Usuario #${dto.userId} no encontrado`);

    const yaAsignado = await this.usuarioEmpresaRepo.findOne({
      where: { userId: dto.userId, empresaId, isActive: true },
    });
    if (yaAsignado) {
      await this.usuarioEmpresaRepo.update(yaAsignado.id, {
        rol:        dto.rol,
        isPrincipal: dto.isPrincipal ?? yaAsignado.isPrincipal,
      });
      return this.usuarioEmpresaRepo.findOne({ where: { id: yaAsignado.id }, relations: ['user'] });
    }

    // SEGURIDAD: Al invitar a un usuario a otra empresa, NUNCA desplazar su
    // empresa propia (la que él creó, isPrincipal=true). Esto evita que aceptar
    // una invitación mezcle el contexto de tenant del usuario invitado.
    // Solo se asigna isPrincipal=true si el usuario no tiene ninguna empresa propia.
    const tienePrincipal = await this.usuarioEmpresaRepo.count({
      where: { userId: dto.userId, isPrincipal: true, isActive: true },
    });
    const asignarPrincipal = (dto.isPrincipal ?? false) && tienePrincipal === 0;

    const asignacion = this.usuarioEmpresaRepo.create({
      userId:      dto.userId,
      empresaId,
      rol:         dto.rol,
      isPrincipal: asignarPrincipal,
    });

    return this.usuarioEmpresaRepo.save(asignacion);
  }

  async cambiarRolUsuario(
    empresaId: number,
    userId: number,
    rol: string,
    solicitanteId?: number,
    solicitanteRole?: string,
  ) {
    const esSuperAdmin = solicitanteRole === UserRole.SUPER_ADMIN;

    // ── S-60.1: lista blanca de roles ────────────────────────────────────────
    // Defensa en profundidad: el DTO ya valida con @IsIn, pero este servicio no
    // debe depender de que todos sus llamadores lo hagan. 'super_admin' es un rol
    // de plataforma y solo se concede vía PATCH /admin/usuarios/:id/rol.
    if (!esRolAsignablePorEmpresa(rol)) {
      this.logger.warn(
        `[S-60] Intento de asignar rol no permitido "${rol}" a usuario #${userId} ` +
        `en empresa #${empresaId} por solicitante #${solicitanteId ?? 'desconocido'}`,
      );
      throw new ForbiddenException(
        `El rol "${rol}" no puede asignarse desde la gestión de empresa. ` +
        `Permitidos: ${ROLES_ASIGNABLES_EMPRESA.join(', ')}.`,
      );
    }

    // S-60.2: el solicitante debe pertenecer a la empresa que dice gestionar.
    // Se comprueba ANTES de tocar el usuario objetivo para no revelar si existe.
    await this.assertAccesoEmpresa(empresaId, solicitanteId, solicitanteRole, 'cambiar roles');

    // Prevenir auto-degradación: un admin no puede quitarse a sí mismo el rol de admin
    if (solicitanteId && solicitanteId === userId && rol !== 'admin') {
      throw new BadRequestException('No puedes cambiar tu propio rol de administrador');
    }

    // El usuario objetivo debe pertenecer también a esta empresa
    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
      relations: ['user'],
    });
    if (!asignacion) throw new NotFoundException(`El usuario #${userId} no pertenece a esta empresa`);

    // ── S-60.3: nunca degradar/alterar a un super_admin desde la gestión de empresa ─
    if (asignacion.user?.role === UserRole.SUPER_ADMIN && !esSuperAdmin) {
      throw new ForbiddenException('No puedes modificar el rol de un Super Administrador');
    }

    await this.usuarioEmpresaRepo.update(asignacion.id, { rol: rol as UserRole });

    // Sincronizar el rol en users si esta empresa es la principal del usuario
    if (asignacion.isPrincipal) {
      // S-31: incrementar roleVersion invalida los JWT emitidos con el rol anterior;
      // sin esto una degradación no surtía efecto hasta que el token expirara.
      await this.usuarioRepo.update(userId, {
        role:        rol as UserRole,
        roleVersion: () => 'COALESCE("roleVersion", 1) + 1',
      } as any);
      await invalidateRoleCache(this.cacheManager, userId);
    }

    return this.usuarioEmpresaRepo.findOne({ where: { id: asignacion.id }, relations: ['user'] });
  }

  async asignarSucursalUsuario(
    empresaId: number,
    userId: number,
    sucursalId: number | null,
    solicitanteId?: number,
    solicitanteRole?: string,
  ) {
    // S-61: mismo patrón que los demás endpoints de :empresaId — no estaba en el
    // listado original de la auditoría pero comparte exactamente el mismo fallo.
    await this.assertAccesoEmpresa(empresaId, solicitanteId, solicitanteRole, 'asignar sucursales');

    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
    });
    if (!asignacion) throw new NotFoundException(`El usuario #${userId} no pertenece a esta empresa`);

    if (sucursalId !== null) {
      const sucursal = await this.sucursalRepo.findOne({
        where: { id: sucursalId, empresaId, isActive: true },
      });
      if (!sucursal) throw new BadRequestException(`La sucursal #${sucursalId} no pertenece a esta empresa`);
    }

    // Raw SQL para manejar correctamente tanto NULL como valores enteros
    await this.usuarioEmpresaRepo.manager.query(
      'UPDATE usuario_empresa SET "sucursalId" = $1 WHERE id = $2',
      [sucursalId, asignacion.id],
    );
    return this.usuarioEmpresaRepo.findOne({ where: { id: asignacion.id }, relations: ['user'] });
  }

  async removerUsuario(
    empresaId: number,
    userId: number,
    solicitanteId?: number,
    solicitanteRole?: string,
  ) {
    // S-61: sin esto, un admin podía cortar el acceso de usuarios de otras empresas.
    await this.assertAccesoEmpresa(empresaId, solicitanteId, solicitanteRole, 'remover usuarios');

    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
    });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');

    await this.usuarioEmpresaRepo.update(asignacion.id, { isActive: false });
    // B-03: invalidar cache de membresía para que el RolesGuard detecte la remoción en ≤30s
    await invalidateMembresiaCache(this.cacheManager, userId, empresaId);
    return { message: `Usuario #${userId} removido de empresa #${empresaId}` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cambio de contexto empresarial
  // ──────────────────────────────────────────────────────────────────

  async validarAccesoEmpresa(userId: number, empresaId: number) {
    const usuario = await this.usuarioRepo.findOne({ where: { id: userId } });

    // S-61: SOLO el super_admin cambia a cualquier empresa. Antes bastaba con
    // role === ADMIN — el rol de cualquier admin de cualquier empresa cliente —
    // para obtener contexto de un tenant ajeno sin membresía alguna.
    if (usuario?.role === UserRole.SUPER_ADMIN) {
      const empresa = await this.getEmpresaById(empresaId);
      return { empresaId, empresaNombre: empresa.nombre, rnc: empresa.rnc, rol: UserRole.SUPER_ADMIN };
    }

    const acceso = await this.usuarioEmpresaRepo.findOne({
      where: { userId, empresaId, isActive: true },
      relations: ['empresa'],
    });

    if (!acceso) {
      throw new ForbiddenException(`Sin acceso a empresa #${empresaId}`);
    }

    const estado = (acceso.empresa as any).estadoAprobacion ?? 'aprobada';
    // Rechazadas: acceso bloqueado totalmente
    if (estado === 'rechazada') {
      throw new ForbiddenException('Esta empresa fue rechazada. Contacta al administrador para más información');
    }
    // Pendientes: el propietario (isPrincipal) puede cambiar a la empresa para ver
    // su nombre en el sidebar. Las APIs de datos siguen devolviendo datos vacíos
    // porque la empresa aún no tiene operaciones registradas.
    // Otros usuarios no propietarios no pueden acceder a una empresa pendiente.
    if (estado === 'pendiente' && !acceso.isPrincipal) {
      throw new ForbiddenException('Esta empresa está pendiente de aprobación por el administrador');
    }

    return {
      empresaId,
      empresaNombre:    acceso.empresa.nombre,
      rnc:              acceso.empresa.rnc,
      rol:              acceso.rol,
      estadoAprobacion: estado,  // frontend lo usa para mostrar el banner
    };
  }

  async getEmpresaPrincipal(userId: number) {
    const principal = await this.usuarioEmpresaRepo.findOne({
      where: { userId, isPrincipal: true, isActive: true },
      relations: ['empresa'],
    });

    if (principal) {
      return {
        empresaId:    principal.empresaId,
        empresaNombre: principal.empresa.nombre,
        rnc:          principal.empresa.rnc,
        rol:          principal.rol,
      };
    }

    // S-61: si no hay principal, caer a otra empresa DEL USUARIO — nunca a "la
    // primera del sistema", que devolvía nombre y RNC de una empresa ajena y
    // colocaba al usuario en un contexto de tenant que no le corresponde.
    const cualquiera = await this.usuarioEmpresaRepo.findOne({
      where: { userId, isActive: true },
      relations: ['empresa'],
      order: { id: 'ASC' },
    });

    if (cualquiera?.empresa) {
      return {
        empresaId:     cualquiera.empresaId,
        empresaNombre: cualquiera.empresa.nombre,
        rnc:           cualquiera.empresa.rnc,
        rol:           cualquiera.rol,
      };
    }

    return null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen
  // ──────────────────────────────────────────────────────────────────

  async getResumen() {
    const [totalEmpresas, totalAsignaciones] = await Promise.all([
      this.empresaRepo.count({ where: { isActive: true } }),
      this.usuarioEmpresaRepo.count({ where: { isActive: true } }),
    ]);

    const empresas = await this.empresaRepo.find({ where: { isActive: true }, order: { nombre: 'ASC' } });

    const detalle = await Promise.all(
      empresas.map(async (e) => {
        const usuarios = await this.usuarioEmpresaRepo.count({
          where: { empresaId: e.id, isActive: true },
        });
        return { id: e.id, nombre: e.nombre, rnc: e.rnc, usuarios };
      }),
    );

    return { totalEmpresas, totalAsignaciones, empresas: detalle };
  }
}
