import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UsuarioEmpresa } from './entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { User } from '../users/users.entity';
import {
  AsignarUsuarioEmpresaDto,
  CambiarEmpresaDto,
  CreateEmpresaTenantDto,
} from './dto/multi-empresa.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';
import { EmailService }        from '../notificaciones/services/email.service';

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
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Gestión de empresas
  // ──────────────────────────────────────────────────────────────────

  async getTodasEmpresas() {
    return this.empresaRepo.find({
      where: { isActive: true },
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

  async updateEmpresa(id: number, dto: Partial<CreateEmpresaTenantDto>): Promise<Empresa> {
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
        empresaId:   a.empresaId,
        nombre:      a.empresa.nombre,
        rnc:         a.empresa.rnc,
        rol:         a.rol,
        isPrincipal: a.isPrincipal,
        plan:        planMap[a.empresaId] ?? null,
      }));
    }

    // Admin global sin vinculación explícita → devuelve todas las empresas
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

  async getUsuariosDeEmpresa(empresaId: number) {
    await this.getEmpresaById(empresaId);
    return this.usuarioEmpresaRepo.find({
      where: { empresaId, isActive: true },
      relations: ['user'],
      order: { rol: 'ASC' },
    });
  }

  async asignarUsuario(empresaId: number, dto: AsignarUsuarioEmpresaDto, adminId: number) {
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
      return this.usuarioEmpresaRepo.findOne({ where: { id: yaAsignado.id } });
    }

    if (dto.isPrincipal) {
      await this.usuarioEmpresaRepo.update(
        { userId: dto.userId, isPrincipal: true },
        { isPrincipal: false },
      );
    }

    const asignacion = this.usuarioEmpresaRepo.create({
      userId:      dto.userId,
      empresaId,
      rol:         dto.rol,
      isPrincipal: dto.isPrincipal ?? false,
    });

    return this.usuarioEmpresaRepo.save(asignacion);
  }

  async cambiarRolUsuario(empresaId: number, userId: number, rol: string, solicitanteId?: number) {
    // Prevenir auto-degradación: un admin no puede quitarse a sí mismo el rol de admin
    if (solicitanteId && solicitanteId === userId && rol !== 'admin') {
      throw new BadRequestException('No puedes cambiar tu propio rol de administrador');
    }

    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
      relations: ['user'],
    });
    if (!asignacion) throw new NotFoundException(`El usuario #${userId} no pertenece a esta empresa`);

    await this.usuarioEmpresaRepo.update(asignacion.id, { rol: rol as UserRole });

    // Sincronizar el rol en users si esta empresa es la principal del usuario
    if (asignacion.isPrincipal) {
      await this.usuarioRepo.update(userId, { role: rol as UserRole });
    }

    return this.usuarioEmpresaRepo.findOne({ where: { id: asignacion.id }, relations: ['user'] });
  }

  async removerUsuario(empresaId: number, userId: number) {
    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
    });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');

    await this.usuarioEmpresaRepo.update(asignacion.id, { isActive: false });
    return { message: `Usuario #${userId} removido de empresa #${empresaId}` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cambio de contexto empresarial
  // ──────────────────────────────────────────────────────────────────

  async validarAccesoEmpresa(userId: number, empresaId: number) {
    const usuario = await this.usuarioRepo.findOne({ where: { id: userId } });

    // Admins globales acceden a todas las empresas
    if (usuario?.role === UserRole.ADMIN) {
      const empresa = await this.getEmpresaById(empresaId);
      return { empresaId, empresaNombre: empresa.nombre, rnc: empresa.rnc, rol: UserRole.ADMIN };
    }

    const acceso = await this.usuarioEmpresaRepo.findOne({
      where: { userId, empresaId, isActive: true },
      relations: ['empresa'],
    });

    if (!acceso) {
      throw new ForbiddenException(`Sin acceso a empresa #${empresaId}`);
    }

    return {
      empresaId,
      empresaNombre: acceso.empresa.nombre,
      rnc:           acceso.empresa.rnc,
      rol:           acceso.rol,
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

    // Si no tiene empresa principal, usar la primera empresa del sistema
    const primeraEmpresa = await this.empresaRepo.findOne({
      where: { isActive: true },
      order: { id: 'ASC' },
    });

    if (primeraEmpresa) {
      return {
        empresaId:    primeraEmpresa.id,
        empresaNombre: primeraEmpresa.nombre,
        rnc:          primeraEmpresa.rnc,
        rol:          UserRole.VIEWER,
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
