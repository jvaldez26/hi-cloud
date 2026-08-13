import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { ILike, Repository, DataSource } from 'typeorm';
import { randomUUID, randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshTokenService } from './refresh-token.service';
import { TwoFactorService } from './two-factor.service';
import { EmailService } from '../notificaciones/services/email.service';
import { User } from '../users/users.entity';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { LoginAttemptsService } from './login-attempts.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService:       UsersService,
    private jwtService:         JwtService,
    private emailService:       EmailService,
    private blacklistSvc:       TokenBlacklistService,
    private refreshTokenSvc:    RefreshTokenService,
    private twoFactorService:   TwoFactorService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UsuarioEmpresa)
    private ueRepository: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectRepository(Sucursal)
    private sucursalRepository: Repository<Sucursal>,
    private contabilidadService: ContabilidadService,
    @InjectDataSource() private dataSource: DataSource,
    private loginAttempts: LoginAttemptsService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS "sessionToken"      VARCHAR(64),
          ADD COLUMN IF NOT EXISTS "sessionCreatedAt"  TIMESTAMPTZ
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS "IDX_users_sessionToken" ON users("sessionToken")
      `);
      // Columna de estado de cuenta — 'pendiente' bloquea el acceso hasta aprobación del Super Admin
      await this.dataSource.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS "accountStatus" VARCHAR(20) NOT NULL DEFAULT 'activo'
      `);
      // passwordConfigured — false para usuarios Google nuevos hasta que configuren contraseña
      await this.dataSource.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS "passwordConfigured" BOOLEAN NOT NULL DEFAULT true
      `);
      // Tabla de tokens de configuración de contraseña (Google users aprobados)
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS setup_tokens (
          id           SERIAL PRIMARY KEY,
          "userId"     INTEGER      NOT NULL,
          "tokenHash"  VARCHAR(64)  NOT NULL UNIQUE,
          "expiresAt"  TIMESTAMPTZ  NOT NULL,
          used         BOOLEAN      NOT NULL DEFAULT false,
          "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS "IDX_setup_tokens_tokenHash" ON setup_tokens("tokenHash")
      `);
    } catch (e) {
      this.logger.warn('Session/accountStatus/passwordConfigured/setup_tokens migration (ignorado): ' + e);
    }
  }

  /** Inicia nueva sesión: genera sessionToken, revoca refresh tokens anteriores.
   *  Usa SQL raw para garantizar que la escritura llega a BD independiente
   *  de cómo TypeORM resuelva los metadatos de la entidad en producción. */
  private async initNewSession(userId: number): Promise<string> {
    const sessionToken = randomUUID();
    await this.dataSource.query(
      `UPDATE users SET "sessionToken" = $1, "sessionCreatedAt" = NOW() WHERE id = $2`,
      [sessionToken, userId],
    );
    await this.refreshTokenSvc.revocarTodos(userId);
    return sessionToken;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async getEmpresaPrincipal(userId: number): Promise<{ empresaId: number; rol: string } | undefined> {
    const principal = await this.ueRepository
      .createQueryBuilder('ue')
      .where({ userId, isPrincipal: true })
      .andWhere('ue.isActive IS NOT FALSE')
      .getOne();
    if (principal) return { empresaId: principal.empresaId, rol: principal.rol };

    const primera = await this.ueRepository
      .createQueryBuilder('ue')
      .where({ userId })
      .andWhere('ue.isActive IS NOT FALSE')
      .orderBy('ue.id', 'ASC')
      .getOne();
    return primera ? { empresaId: primera.empresaId, rol: primera.rol } : undefined;
  }

  private buildToken(user: User, empresaId?: number, sucursalId?: number, almacenId?: number, empresaRole?: string): string {
    // S-27: jti único por token — permite revocación individual en blacklist
    // S-31: roleVersion en JWT para detectar cambios de rol sin ir a BD en cada request
    // empresaRole: rol específico del usuario en la empresa activa (UsuarioEmpresa.rol)
    // fallback a user.role solo para SUPER_ADMIN (que no tiene UsuarioEmpresa)
    return this.jwtService.sign({
      sub:          user.id,
      email:        user.email,
      role:         empresaRole ?? user.role,
      empresaId:    empresaId  ?? null,
      sucursalId:   sucursalId ?? null,
      almacenId:    almacenId  ?? null,
      jti:          randomUUID(),
      sessionToken: user.sessionToken ?? undefined,
      roleVersion:  (user as any).roleVersion ?? 1,
    });
  }

  /** Resuelve sucursalId, almacenId y sucursalNombre para el contexto del usuario en una empresa */
  private async resolverContextoSucursal(
    userId: number,
    empresaId: number,
  ): Promise<{ sucursalId?: number; almacenId?: number; sucursalNombre?: string }> {
    try {
      // Buscar la sucursal asignada al usuario en esta empresa
      const ue = await this.ueRepository.findOne({
        where: { userId, empresaId, isActive: true },
      });
      const sucursalId: number | undefined = (ue as any)?.sucursalId ?? undefined;

      let sucursal: Sucursal | null = null;

      if (sucursalId) {
        sucursal = await this.sucursalRepository.findOne({ where: { id: sucursalId, isActive: true } });
      } else {
        // Fallback: sucursal principal de la empresa
        sucursal = await this.sucursalRepository.findOne({
          where: { empresaId, esPrincipal: true, isActive: true },
        });
      }

      if (!sucursal) return {};

      const almacenId: number | undefined = (sucursal as any).almacenPrincipalId ?? undefined;
      return { sucursalId: sucursal.id, almacenId, sucursalNombre: sucursal.nombre };
    } catch {
      return {};
    }
  }

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    this.logger.log(`[REGISTER] nombre="${dto.nombre}" | empresa="${dto.empresaNombre ?? 'N/A'}"`);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('El email ya está registrado');

    if (dto.empresaRnc) {
      const rncExiste = await this.empresaRepository.findOne({ where: { rnc: dto.empresaRnc } });
      if (rncExiste) throw new ConflictException(`El RNC ${dto.empresaRnc} ya está registrado`);
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const user = await qr.manager.save(
        qr.manager.create(User, {
          nombre:          dto.nombre,
          email:           dto.email,
          password:        hashed,
          role:            UserRole.ADMIN,
          isActive:        true,
          accountStatus:   'pendiente',   // Requiere aprobación del Super Admin
          emailVerifiedAt: new Date(),    // Skip email verification — el Super Admin es el gate
        } as any),
      );

      if (dto.empresaNombre && dto.empresaRnc) {
        // Usar insert() en lugar de save() en todo este bloque para evitar que TypeORM
        // haga SELECTs post-INSERT usando una conexión diferente del pool, que no vería
        // las filas no-commiteadas de esta misma transacción.
        const empresaResult = await qr.manager.insert(Empresa, {
          nombre:      dto.empresaNombre,
          rnc:         dto.empresaRnc,
          moneda:      'DOP',
          zonaHoraria: 'America/Santo_Domingo',
          isActive:    true,
          telefono:    dto.telefono,
          sector:      dto.sectorEmpresarial,
        });
        const empresaId = empresaResult.identifiers[0].id as number;

        // Crear Sucursal Principal y capturar su ID
        const sucursalInsert = await qr.manager.insert(Sucursal, {
          empresaId,
          codigo:      'PRIN',
          nombre:      'Sucursal Principal',
          ciudad:      'Santo Domingo',
          esPrincipal: true,
          isActive:    true,
        });
        const sucursalId = sucursalInsert.identifiers[0].id as number;

        // Crear Almacén Principal vinculado a la sucursal
        const almacenInsert = await qr.manager.insert(Almacen, {
          empresaId,
          codigo:     'MAIN',
          nombre:     'Almacén Principal',
          ciudad:     'Santo Domingo',
          activo:     true,
          sucursalId,
        });
        const almacenId = almacenInsert.identifiers[0].id as number;

        // Vincular almacén ↔ sucursal (bidireccional)
        await qr.manager.update(Sucursal, { id: sucursalId }, { almacenPrincipalId: almacenId } as any);

        // Asignar sucursal al usuario creador
        await qr.manager.insert(UsuarioEmpresa, {
          userId:      user.id,
          empresaId,
          rol:         UserRole.ADMIN,
          isPrincipal: true,
          isActive:    true,
          sucursalId,
        });

        // Crear suscripción PRUEBA con el plan elegido — el reloj de 15 días empieza aquí
        const planElegido = dto.planElegido ?? 'emprendedor';
        const fechaFinPrueba = new Date(); fechaFinPrueba.setDate(fechaFinPrueba.getDate() + 15);
        await qr.manager.query(
          `INSERT INTO suscripciones
             ("empresaId", plan, estado, "fechaInicio", "fechaVencimiento",
              "fechaFinPrueba", "planElegidoEnRegistro", "modalidad", "diaCorte")
           VALUES ($1, $2, 'prueba', NOW(), $3, $3, $4, 'mensual',
                   EXTRACT(DAY FROM $3::date)::smallint)`,
          [empresaId, planElegido, fechaFinPrueba.toISOString(), planElegido],
        );

        await qr.commitTransaction();
        this.logger.log(`Empresa "${dto.empresaNombre}" (id=${empresaId}) creada para usuario #${user.id} | plan=${planElegido}`);

        // Tareas post-commit: no forman parte de la transacción atómica
        this.contabilidadService.seedPlanCuentas(empresaId).catch(err =>
          this.logger.warn(`seedPlanCuentas empresa ${empresaId}: ${err?.message}`),
        );
      } else {
        await qr.commitTransaction();
      }

      // Notificar a los Super Admins del nuevo registro pendiente (post-commit)
      this.notificarAdminsPendiente(user.nombre, user.email, {
        empresaNombre:     dto.empresaNombre,
        telefono:          dto.telefono,
        sectorEmpresarial: dto.sectorEmpresarial,
      }).catch(err =>
        this.logger.warn(`No se pudo notificar a admins: ${err?.message}`),
      );

      return {
        pendingApproval: true,
        message: 'Tu solicitud fue recibida. Nuestro equipo la revisará y recibirás un email en menos de 24 horas.',
        user: { id: user.id, nombre: user.nombre, email: user.email },
      };
    } catch (e: any) {
      await qr.rollbackTransaction();
      if (e instanceof ConflictException || e instanceof BadRequestException) throw e;
      // S-52: race condition en RNC — dos registros simultáneos del mismo RNC
      if (e?.code === '23505' && e?.detail?.includes('rnc')) {
        throw new ConflictException(`El RNC ${dto.empresaRnc ?? ''} ya está registrado`);
      }
      if (e?.code === '23505' && e?.detail?.includes('email')) {
        throw new ConflictException('El email ya está registrado');
      }
      this.logger.error(`[REGISTER] Error: ${e?.message}`);
      throw new InternalServerErrorException('Error al crear la cuenta. Inténtalo de nuevo.');
    } finally {
      await qr.release();
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip: string) {
    // 1. Verificar bloqueo activo antes de cualquier consulta a BD
    const blockStatus = await this.loginAttempts.isBlocked(dto.email, ip);
    if (blockStatus.blocked) {
      const tiempo = this.loginAttempts.formatTime(blockStatus.remainingSeconds!);
      throw new HttpException(
        {
          message:          `Cuenta temporalmente bloqueada. Intenta de nuevo en ${tiempo}.`,
          remainingSeconds: blockStatus.remainingSeconds,
          error:            'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Buscar usuario y verificar contraseña
    const user        = await this.usersService.findByEmailForAuth(dto.email);
    const isValid     = user?.isActive
      ? await bcrypt.compare(dto.password, user.password)
      : false;

    // Leer maxIntentos de la empresa del usuario (con fallback al global)
    const empresaParaConf = user?.isActive ? await this.getEmpresaPrincipal(user.id) : undefined;
    const maxIntentos     = await this.getEffectiveMaxIntentos(empresaParaConf?.empresaId);

    // 3. Credenciales inválidas (usuario inexistente, inactivo o contraseña incorrecta)
    if (!user || !user.isActive || !isValid) {
      const attempts    = await this.loginAttempts.increment(dto.email, ip);
      const blockSecs   = await this.loginAttempts.block(dto.email, ip, attempts, maxIntentos);

      if (blockSecs > 0) {
        const tiempo = this.loginAttempts.formatTime(blockSecs);
        this.logger.warn(`[LOGIN] Cuenta bloqueada ${tiempo} — email:${dto.email} ip:${ip} intentos:${attempts}`);
        throw new HttpException(
          {
            message:          `Demasiados intentos fallidos. Cuenta bloqueada por ${tiempo}.`,
            remainingSeconds: blockSecs,
            error:            'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      this.logger.warn(`[LOGIN] Intento fallido #${attempts} — email:${dto.email} ip:${ip}`);
      const restantes = Math.max(0, maxIntentos - attempts);
      if (restantes > 0) {
        throw new UnauthorizedException(
          `Credenciales incorrectas. ${restantes} intento(s) antes del bloqueo temporal.`,
        );
      }
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    // 4. Cuenta pendiente de aprobación del Super Admin
    if ((user as any).accountStatus === 'pendiente') {
      throw new ForbiddenException('CUENTA_PENDIENTE');
    }

    // 5. Usuario Google aprobado pero sin contraseña configurada
    if ((user as any).passwordConfigured === false) {
      throw new ForbiddenException('CONTRASEÑA_NO_CONFIGURADA');
    }

    // 6. Correo no verificado — reenviar email y avisar al usuario.
    //    SEGURIDAD (enumeración): este gate está DESPUÉS del bcrypt.compare exitoso
    //    (pasos 2-3). Solo lo alcanza quien YA ingresó la contraseña correcta, así que
    //    devolver 'CORREO_NO_VERIFICADO' no filtra existencia de emails a un atacante:
    //    con clave incorrecta se corta antes en el paso 3 con "Credenciales incorrectas".
    //    El frontend (LoginPage) reconoce este código y muestra "Reenviar correo".
    if (!user.emailVerifiedAt) {
      this.sendVerificationEmail(user.id, user.email, user.nombre).catch(() => null);
      throw new UnauthorizedException('CORREO_NO_VERIFICADO');
    }

    // 7. Si 2FA está activo → devolver indicador + token temporal
    if (user.twoFactorEnabled) {
      // Resetear contador: la contraseña ya fue verificada correctamente
      await this.loginAttempts.reset(dto.email, ip);
      const pending2FAToken = this.jwtService.sign(
        { sub: user.id, tfa: 1 },
        { expiresIn: '5m' },
      );
      return { requiresTwoFactor: true as const, pending2FAToken };
    }

    // 8. Verificar que el usuario tenga al menos una empresa activa (no suspendida por el super admin)
    //    No aplica a SUPER_ADMIN — ellos no tienen membresía en empresas.
    if (user.role !== UserRole.SUPER_ADMIN) {
      const ues = await this.ueRepository.find({
        where: { userId: user.id, isActive: true },
        relations: ['empresa'],
      });
      const tieneEmpresaActiva = ues.some(e => e.empresa?.isActive === true);

      if (!tieneEmpresaActiva) {
        const attempts  = await this.loginAttempts.increment(dto.email, ip);
        const blockSecs = await this.loginAttempts.block(dto.email, ip, attempts, maxIntentos);

        if (blockSecs > 0) {
          const tiempo = this.loginAttempts.formatTime(blockSecs);
          this.logger.warn(`[LOGIN] Empresa suspendida — bloqueado ${tiempo} — email:${dto.email} ip:${ip} intentos:${attempts}`);
          throw new HttpException(
            {
              message:          `Demasiados intentos. Cuenta bloqueada por ${tiempo}.`,
              remainingSeconds: blockSecs,
              error:            'Too Many Requests',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        this.logger.warn(`[LOGIN] Empresa suspendida — intento #${attempts} — email:${dto.email} ip:${ip}`);
        throw new ForbiddenException('Tu empresa ha sido suspendida. Contacta al administrador de HiCloud.');
      }
    }

    // 9. Login exitoso — resetear contador de intentos
    await this.loginAttempts.reset(dto.email, ip);

    // Desplazar sesión anterior: nuevo sessionToken + revocar refresh tokens previos
    const sessionToken = await this.initNewSession(user.id);
    (user as any).sessionToken = sessionToken;

    // Reusar empresaParaConf (ya cargado arriba) para evitar doble consulta
    const empresaPrincipal = empresaParaConf ?? await this.getEmpresaPrincipal(user.id);
    const empresaId   = empresaPrincipal?.empresaId;
    const empresaRole = empresaPrincipal?.rol;
    const { sucursalId, almacenId, sucursalNombre } = empresaId
      ? await this.resolverContextoSucursal(user.id, empresaId)
      : { sucursalId: undefined, almacenId: undefined, sucursalNombre: undefined };
    const accessToken = this.buildToken(user, empresaId, sucursalId, almacenId, empresaRole);

    const empresas = await this.ueRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });

    const sessionLifetimeMs = await this.getEffectiveSessionMs(empresaId);

    return {
      message: 'Login exitoso',
      accessToken,
      sessionLifetimeMs,
      empresaActual:  empresaId      ?? null,
      sucursalActual: sucursalId     ?? null,
      almacenActual:  almacenId      ?? null,
      sucursalNombre: sucursalNombre ?? null,
      empresas: empresas
        .filter(e => e.empresa?.isActive !== false)
        .map(e => ({
          empresaId:   e.empresaId,
          nombre:      e.empresa?.nombre,
          rnc:         e.empresa?.rnc,
          rol:         e.rol,
          isPrincipal: e.isPrincipal,
        })),
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
    };
  }

  // ─── Cambiar empresa activa ───────────────────────────────────────────────────

  async cambiarEmpresa(userId: number, userRole: string, empresaId: number) {
    let empresaRole: string | undefined;

    // Solo SUPER_ADMIN puede cambiar a cualquier empresa sin tener membresía
    if (userRole !== UserRole.SUPER_ADMIN) {
      const acceso = await this.ueRepository.findOne({
        where: { userId, empresaId, isActive: true },
        relations: ['empresa'],
      });
      if (!acceso) throw new ForbiddenException(`Sin acceso a empresa #${empresaId}`);

      // Verificar que la empresa destino no esté explícitamente suspendida
      if (acceso.empresa && acceso.empresa.isActive === false) {
        throw new ForbiddenException(
          'Esta empresa ha sido suspendida. Contacte al administrador de la plataforma HiCloud.',
        );
      }

      // Capturar el rol específico del usuario en la empresa destino
      empresaRole = acceso.rol;
    }

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { sucursalId, almacenId, sucursalNombre } = await this.resolverContextoSucursal(userId, empresaId);
    const accessToken = this.buildToken(user, empresaId, sucursalId, almacenId, empresaRole);

    return {
      message:        `Empresa activa cambiada a #${empresaId}`,
      accessToken,
      empresaActual:  empresaId,
      sucursalActual: sucursalId     ?? null,
      almacenActual:  almacenId      ?? null,
      sucursalNombre: sucursalNombre ?? null,
    };
  }

  // ─── Cambiar sucursal activa ──────────────────────────────────────────────────

  async cambiarSucursal(userId: number, userRole: string, empresaId: number, sucursalId: number) {
    // Verificar que la sucursal pertenece a la empresa del usuario
    const sucursal = await this.sucursalRepository.findOne({
      where: { id: sucursalId, empresaId, isActive: true },
    });
    if (!sucursal) {
      throw new ForbiddenException(`Sucursal #${sucursalId} no encontrada en esta empresa`);
    }

    // Usuarios no-admin solo pueden usar su sucursal asignada
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
      const ue = await this.ueRepository.findOne({ where: { userId, empresaId, isActive: true } });
      const asignada: number | undefined = (ue as any)?.sucursalId;
      if (asignada && asignada !== sucursalId) {
        throw new ForbiddenException('No tienes acceso a esta sucursal');
      }
    }

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Obtener rol específico del usuario en esta empresa para el nuevo token
    const ueRol = userRole !== UserRole.SUPER_ADMIN
      ? await this.ueRepository.findOne({ where: { userId, empresaId, isActive: true } })
      : undefined;

    const almacenId: number | undefined = (sucursal as any).almacenPrincipalId ?? undefined;
    const accessToken = this.buildToken(user, empresaId, sucursal.id, almacenId, ueRol?.rol);

    return {
      message:        `Sucursal activa cambiada a "${sucursal.nombre}"`,
      accessToken,
      sucursalActual: sucursal.id,
      almacenActual:  almacenId ?? null,
      sucursalNombre: sucursal.nombre,
    };
  }

  // ─── Mis sucursales ───────────────────────────────────────────────────────────

  async misSucursales(userId: number, userRole: string, empresaId: number) {
    // Admins pueden ver y cambiar a cualquier sucursal de la empresa
    if (userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN) {
      const sucursales = await this.sucursalRepository.find({
        where: { empresaId, isActive: true },
        order: { esPrincipal: 'DESC', nombre: 'ASC' },
      });
      return sucursales.map(s => ({
        id: s.id,
        nombre: s.nombre,
        esPrincipal: s.esPrincipal,
        almacenPrincipalId: (s as any).almacenPrincipalId ?? null,
      }));
    }

    // Otros roles: solo su sucursal asignada
    const ue = await this.ueRepository.findOne({ where: { userId, empresaId, isActive: true } });
    const sucursalId: number | undefined = (ue as any)?.sucursalId;
    if (!sucursalId) {
      // Sin sucursal asignada → devolver sucursal principal
      const principal = await this.sucursalRepository.findOne({
        where: { empresaId, esPrincipal: true, isActive: true },
      });
      if (!principal) return [];
      return [{ id: principal.id, nombre: principal.nombre, esPrincipal: true, almacenPrincipalId: (principal as any).almacenPrincipalId ?? null }];
    }

    const sucursal = await this.sucursalRepository.findOne({ where: { id: sucursalId, isActive: true } });
    if (!sucursal) return [];
    return [{ id: sucursal.id, nombre: sucursal.nombre, esPrincipal: sucursal.esPrincipal, almacenPrincipalId: (sucursal as any).almacenPrincipalId ?? null }];
  }

  // ─── Mis empresas ─────────────────────────────────────────────────────────────

  async misEmpresas(userId: number, isGlobalAdmin = false) {
    const accesos = await this.ueRepository
      .createQueryBuilder('ue')
      .leftJoinAndSelect('ue.empresa', 'e')
      .where({ userId })
      .andWhere('ue.isActive IS NOT FALSE')
      .orderBy('ue.isPrincipal', 'DESC')
      .getMany();

    if (accesos.length > 0) {
      const filtradas = accesos.filter(a => a.empresa?.isActive !== false);
      const empresaIds = filtradas.map(a => a.empresaId);

      // Buscar el plan real desde suscripciones (no existe en la entidad Empresa)
      let planMap: Record<number, string> = {};
      if (empresaIds.length > 0) {
        const rows = await this.dataSource.query<{ empresaId: number; plan: string }[]>(
          `SELECT "empresaId", plan FROM suscripciones WHERE "empresaId" = ANY($1::int[]) ORDER BY id DESC`,
          [empresaIds],
        );
        // Tomar el plan más reciente por empresa
        for (const r of rows) {
          if (!planMap[r.empresaId]) planMap[r.empresaId] = r.plan;
        }
      }

      return filtradas.map(a => ({
        empresaId:   a.empresaId,
        nombre:      a.empresa?.nombre ?? `Empresa #${a.empresaId}`,
        rnc:         a.empresa?.rnc,
        rol:         a.rol,
        isPrincipal: a.isPrincipal,
        plan:        planMap[a.empresaId] ?? null,
      }));
    }

    // Admin global sin vínculos explícitos → devuelve todas las empresas
    if (isGlobalAdmin) {
      const todas = await this.empresaRepository.find({ where: { isActive: true }, order: { nombre: 'ASC' } });
      return todas.map(e => ({
        empresaId:   e.id,
        nombre:      e.nombre,
        rnc:         e.rnc,
        rol:         'admin',
        isPrincipal: false,
        plan:        (e as any).planSuscripcion ?? 'TRIAL',
      }));
    }

    return [];
  }

  // ─── Password Reset ───────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.userRepository.findOne({ where: { email: ILike(email), isActive: true } });

    if (!user) {
      this.logger.log(`Reset solicitado para email no encontrado: ${email}`);
      return { message: 'Si el email existe, recibirás las instrucciones en breve.' };
    }

    const token  = randomUUID().replace(/-/g, '');
    const expiry = new Date(); expiry.setHours(expiry.getHours() + 1);

    // S-37: guardar token hasheado (SHA-256) — nunca el token en texto plano
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    await this.userRepository.update(user.id, {
      resetPasswordToken:   tokenHash,
      resetPasswordExpires: expiry,
    });

    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com'}/restablecer/${token}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
    .card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,#1a56db,#0ea5e9);padding:28px;color:#fff;text-align:center}
    .body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
    .footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">🔐 Restablece tu contraseña</h2></div>
      <div class="body">
        <p>Hola <strong>${user.nombre}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en HiCloud ERP.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" class="btn">Restablecer contraseña</a>
        </p>
        <p style="color:#6b7280;font-size:13px">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este email.</p>
        <p style="color:#9ca3af;font-size:12px">O copia este enlace en tu navegador:<br/>${resetUrl}</p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;

    await this.emailService.enviar({ to: email, subject: 'Restablece tu contraseña — HiCloud ERP', html });
    this.logger.log(`Token de reset enviado a: ${email}`);
    return { message: 'Si el email existe, recibirás las instrucciones en breve.' };
  }

  async resetPassword(token: string, newPassword: string) {
    // S-37: comparar con el hash del token, nunca buscar por texto plano
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: tokenHash },
      select: ['id', 'resetPasswordToken', 'resetPasswordExpires', 'isActive'],
    });

    if (!user || !user.isActive) throw new BadRequestException('Token inválido o expirado');
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita uno nuevo.');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(user.id, {
      password:             hashed,
      resetPasswordToken:   null as any,
      resetPasswordExpires: null as any,
    });

    this.logger.log(`Contraseña restablecida para usuario #${user.id}`);
    return { message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' };
  }

  // ─── Cambio de contraseña autenticado ────────────────────────────────────────

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.userRepository
      .createQueryBuilder('u')
      .select(['u.id', 'u.isActive'])
      .addSelect('u.password')          // select:false requiere addSelect
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user || !user.isActive) throw new NotFoundException('Usuario no encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new BadRequestException('La contraseña actual es incorrecta');

    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userRepository
      .createQueryBuilder()
      .update()
      .set({ password: hashed })
      .where('id = :id', { id: userId })
      .execute();

    this.logger.log(`Contraseña cambiada por usuario #${userId}`);
    return { message: 'Contraseña actualizada exitosamente' };
  }

  // ─── Email verification ───────────────────────────────────────────────────────

  async sendVerificationEmail(userId: number, email: string, nombre: string): Promise<void> {
    const token   = randomBytes(32).toString('hex');
    // A-03: guardar hash SHA-256 en BD — el token plano solo viaja por email
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expires   = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.userRepository.update(userId, {
      emailVerificationToken:   tokenHash,
      emailVerificationExpires: expires,
    } as any);

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const link = `${frontendUrl}/verificar-correo?token=${token}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#059669,#10b981);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">✅ Verifica tu correo</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Gracias por registrarte en HiCloud ERP. Haz clic en el botón para verificar tu cuenta:</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" class="btn">Verificar mi correo</a></p>
    <p style="color:#6b7280;font-size:13px">Este enlace expira en <strong>24 horas</strong>.</p>
    <p style="color:#9ca3af;font-size:12px">O copia este enlace:<br/>${link}</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailService.enviar({
      to:      email,
      subject: 'Verifica tu correo — HiCloud ERP',
      html,
    });
    this.logger.log(`Correo de verificación enviado a: ${email}`);
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    // A-03: el token en BD es un hash SHA-256 — comparar siempre con hash
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: tokenHash } as any,
      // email y nombre incluidos — necesarios para el email de bienvenida
      select: ['id', 'nombre', 'email', 'emailVerifiedAt', 'emailVerificationExpires', 'isActive'] as any,
    });

    if (!user) throw new BadRequestException('Token inválido o expirado');

    if ((user as any).emailVerifiedAt) {
      return { message: 'Tu correo ya fue verificado. Ya puedes iniciar sesión.' };
    }

    const expires: Date | undefined = (user as any).emailVerificationExpires;
    if (expires && expires < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita un nuevo correo de verificación.');
    }

    // A-04: anular token después del primer uso — previene reutilización
    await this.userRepository.update(user.id, {
      emailVerifiedAt:          new Date(),
      emailVerificationToken:   null,
      emailVerificationExpires: null,
    } as any);

    // La suscripción PRUEBA se crea durante el registro (no aquí).
    // Si por alguna razón no existe, crearla como fallback.
    const ueRow = await this.ueRepository.findOne({
      where: { userId: user.id, isActive: true, isPrincipal: true },
    });
    if (ueRow) {
      const yaExiste = await this.dataSource.query<any[]>(
        `SELECT id FROM suscripciones WHERE "empresaId" = $1 LIMIT 1`,
        [ueRow.empresaId],
      );
      if (!yaExiste.length) {
        const fin = new Date(); fin.setDate(fin.getDate() + 15);
        await this.dataSource.query(
          `INSERT INTO suscripciones
             ("empresaId", plan, estado, "fechaInicio", "fechaVencimiento",
              "fechaFinPrueba", "planElegidoEnRegistro", "modalidad")
           VALUES ($1, 'emprendedor', 'prueba', NOW(), $2, $2, 'emprendedor', 'mensual')`,
          [ueRow.empresaId, fin.toISOString()],
        );
        this.logger.log(`Suscripción PRUEBA fallback creada para empresa #${ueRow.empresaId}`);
      }
    }

    this.logger.log(`Email verificado para usuario #${user.id}`);

    // Email de bienvenida con info del plan elegido (non-fatal)
    if (ueRow) {
      this.enviarEmailBienvenida(user.id, (user as any).nombre, (user as any).email ?? '', ueRow.empresaId)
        .catch(() => null);
    }

    return { message: '¡Correo verificado exitosamente! Ya puedes iniciar sesión.' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: ILike(email), isActive: true },
      select: ['id', 'nombre', 'email', 'emailVerifiedAt'] as any,
    });

    // Respuesta neutra — no revelar si el email existe
    const response = { message: 'Si el correo existe y no está verificado, recibirás un nuevo enlace.' };

    if (!user || (user as any).emailVerifiedAt) return response;

    // Rate limit: no reenviar si el token vigente tiene menos de 5 min
    const existingExpires: Date | undefined = (user as any).emailVerificationExpires;
    const tokenReciente = existingExpires && existingExpires > new Date(Date.now() - 5 * 60_000);
    if (tokenReciente) return response;

    await this.sendVerificationEmail(user.id, user.email, user.nombre).catch(() => null);
    return response;
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────────

  /**
   * Google OAuth: SOLO login para usuarios existentes con empresa activa.
   * NO crea usuarios nuevos — deben registrarse con email/contraseña primero.
   * Errores retornados como UnauthorizedException con código semántico:
   *   'NO_ACCOUNT'  → no existe cuenta con ese email/googleId
   *   'NO_COMPANY'  → existe cuenta pero sin empresa asignada
   */
  async findOrCreateFromGoogle(data: {
    email: string; googleId: string; nombre: string;
  }): Promise<User> {
    // 1. Buscar por googleId primero
    let user = await this.userRepository.findOne({
      where: { googleId: data.googleId } as any,
    });

    // 2. Buscar por email (cuenta local existente → vincular Google ID)
    if (!user) {
      user = await this.userRepository.findOne({ where: { email: ILike(data.email) } });
      if (user) {
        // Vincular Google ID si aún no estaba vinculado
        await this.userRepository.update(user.id, {
          googleId: data.googleId, provider: 'GOOGLE',
        } as any);
        user = { ...user, googleId: data.googleId, provider: 'GOOGLE' } as User;
      }
    }

    // 3. Sin cuenta → bloquear (Google OAuth solo para usuarios registrados)
    if (!user) {
      this.logger.warn(`[GOOGLE] Login denegado — email sin cuenta: ${data.email}`);
      throw new UnauthorizedException('NO_ACCOUNT');
    }

    // 4. Sin empresa → bloquear (debe configurarla con email/contraseña)
    const tieneEmpresa = await this.ueRepository.count({
      where: { userId: user.id, isActive: true },
    });
    if (tieneEmpresa === 0) {
      this.logger.warn(`[GOOGLE] Login denegado — sin empresa: ${data.email} (userId=${user.id})`);
      throw new UnauthorizedException('NO_COMPANY');
    }

    return user;
  }

  async marcarTourCompletado(userId: number): Promise<void> {
    await this.userRepository.update(userId, { tourCompletado: true } as any);
  }

  /** PATCH /auth/tema-sidebar — actualizar tema del sidebar del usuario autenticado. */
  async updateTemaSidebar(userId: number, tema: string): Promise<void> {
    await this.userRepository.update(userId, { temaSidebar: tema } as any);
  }

  /** PATCH /auth/profile — actualizar nombre del usuario autenticado. */
  async updateProfile(userId: number, nombre: string) {
    const trimmed = nombre.trim();
    if (!trimmed || trimmed.length < 3) {
      throw new BadRequestException('El nombre debe tener al menos 3 caracteres');
    }
    if (trimmed.length > 200) {
      throw new BadRequestException('El nombre no puede superar 200 caracteres');
    }
    await this.userRepository.update(userId, { nombre: trimmed });
    this.logger.log(`[PROFILE] Nombre actualizado para usuario #${userId}: "${trimmed}"`);
    return { ok: true, nombre: trimmed };
  }

  private async enviarEmailBienvenida(userId: number, nombre: string, email: string, empresaId: number): Promise<void> {
    try {
      // Leer la suscripción para saber plan y fecha de vencimiento
      const [sus] = await this.dataSource.query<any[]>(
        `SELECT plan, estado, "fechaFinPrueba" FROM suscripciones WHERE "empresaId" = $1 LIMIT 1`,
        [empresaId],
      );
      if (!sus) return;

      const PLAN_NOMBRE: Record<string, string> = {
        emprendedor: 'Emprendedor', pyme: 'Pyme', pro: 'Pro', plus: 'Plus',
      };
      const PLAN_PRECIO: Record<string, number> = {
        emprendedor: 29, pyme: 59, pro: 89, plus: 129,
      };
      const planNombre = PLAN_NOMBRE[sus.plan] ?? sus.plan;
      const precioMes  = PLAN_PRECIO[sus.plan] ?? 0;
      const fechaFin   = sus.fechaFinPrueba
        ? new Date(sus.fechaFinPrueba).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
        : '15 días desde hoy';
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailService.enviar({
        to: email,
        subject: `¡Bienvenido a HiCloud ERP! Tu prueba ${planNombre} empieza ahora`,
        html: `
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>¡Tu cuenta en HiCloud ERP está activa! 🎉</p>
          <p>Tienes acceso completo al plan <strong>${planNombre}</strong> (US$${precioMes}/mes) de forma gratuita hasta el <strong>${fechaFin}</strong>.</p>
          <p>Todos los módulos están habilitados desde el primer día:</p>
          <ul>
            <li>✅ Factura electrónica e-CF DGII</li>
            <li>✅ Contabilidad, inventario y CxC/CxP</li>
            <li>✅ Nómina, compras y reportes 606/607</li>
            <li>✅ Soporte 24/7 incluido</li>
          </ul>
          <p>Al vencer la prueba, un asesor te contactará para coordinar el pago y continuar sin interrupciones.</p>
          <p><a href="${frontendUrl}/dashboard" style="background:#1565C0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700">Entrar al sistema →</a></p>
          <p style="color:#6b7280;font-size:12px">¿Tienes dudas? Escríbenos a soporte@hicloudrd.com</p>
        `,
      });
    } catch (e) {
      this.logger.warn(`Email bienvenida usuario #${userId}: ${(e as Error).message}`);
    }
  }

  /** S-28: Genera un access token para un userId (usado en /auth/refresh) */
  async buildAccessTokenForUser(userId: number): Promise<string> {
    const user = await this.usersService.findById(userId);
    const ep = await this.getEmpresaPrincipal(userId);
    return this.buildToken(user, ep?.empresaId, undefined, undefined, ep?.rol);
  }

  /** POS Screen Lock: verifica que la contraseña coincide con la del usuario autenticado. */
  async verificarPassword(email: string, password: string): Promise<{ ok: true }> {
    const user = await this.usersService.findByEmailForAuth(email);
    // 401 solo si el usuario no existe (token inválido) — jamás por contraseña incorrecta
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const valida = await bcrypt.compare(password, user.password!);
    // 400 Bad Request para contraseña incorrecta — el interceptor de 401 NO hace logout
    if (!valida) {
      this.logger.warn(`[POS-Lock] Intento fallido de desbloqueo para ${email}`);
      throw new BadRequestException('Contraseña incorrecta');
    }
    return { ok: true };
  }

  /**
   * Verifica credenciales de un supervisor (admin/contador/super_admin del mismo tenant).
   * Registra la autorización en pos_supervisor_log para auditoría.
   */
  async listarSupervisores(empresaId: number): Promise<{ id: number; nombre: string; role: string }[]> {
    return this.dataSource.query<any[]>(`
      SELECT u.id, u.nombre, u.role
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      WHERE ue."empresaId" = $1
        AND ue."isActive" = true
        AND u."isActive" = true
        AND u.role IN ('admin', 'contador', 'super_admin')
      ORDER BY u.nombre ASC
    `, [empresaId]);
  }

  async verificarSupervisor(
    supervisorRef: string | number,  // email (string) o id (number)
    supervisorPassword: string,
    cajeroId: number,
    empresaId: number,
    action?: string,
    detail?: string,
  ): Promise<{ ok: true; nombre: string; role: string }> {
    const byId = typeof supervisorRef === 'number';
    // Buscar supervisor en el mismo tenant con rol autorizado
    const rows = await this.dataSource.query<any[]>(`
      SELECT u.id, u.nombre, u.email, u.password, u.role
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      WHERE ${byId ? 'u.id = $1' : 'LOWER(u.email) = LOWER($1)'}
        AND ue."empresaId" = $2
        AND ue."isActive" = true
        AND u."isActive" = true
        AND u.role IN ('admin', 'contador', 'super_admin')
      LIMIT 1
    `, [supervisorRef, empresaId]);

    const sup = rows[0];
    if (!sup) throw new UnauthorizedException(
      byId ? 'Usuario no autorizado como supervisor' : 'No se encontró supervisor con ese correo en esta empresa',
    );

    const valida = await bcrypt.compare(supervisorPassword, sup.password);
    if (!valida) throw new UnauthorizedException('Contraseña incorrecta');

    // Registrar en audit log
    await this.dataSource.query(`
      INSERT INTO pos_supervisor_log
        ("empresaId", "cajeroId", "supervisorId", "supervisorNombre", action, detail, "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT DO NOTHING
    `, [empresaId, cajeroId, sup.id, sup.nombre, action ?? 'SUPERVISOR_LOGIN', detail ?? ''])
      .catch(err => this.logger.warn(`pos_supervisor_log: ${(err as Error).message}`));

    return { ok: true, nombre: sup.nombre, role: sup.role };
  }

  /** Super admin: fuerza el logout de un usuario limpiando su sessionToken. */
  async forzarLogout(userId: number) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new BadRequestException(`Usuario #${userId} no encontrado`);
    // Usar SQL raw: TypeORM ignora `undefined` en .update(), NULL requiere query explícita
    await this.dataSource.query(
      `UPDATE users SET "sessionToken" = NULL, "sessionCreatedAt" = NULL WHERE id = $1`,
      [userId],
    );
    await this.refreshTokenSvc.revocarTodos(userId);
    this.logger.log(`Super admin forzó logout del usuario #${userId}`);
    return { message: `Sesión del usuario #${userId} cerrada correctamente` };
  }

  /** Segundo paso del login cuando 2FA está activo: verifica TOTP y emite JWT completo. */
  async completarLogin2FA(pendingToken: string, codigo: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(pendingToken);
    } catch {
      throw new UnauthorizedException('Sesión de verificación expirada. Inicia sesión de nuevo.');
    }
    if (!payload?.tfa) throw new UnauthorizedException('Token de verificación inválido');

    const valid = await this.twoFactorService.verificarCodigo(payload.sub, codigo);
    if (!valid) throw new UnauthorizedException('Código de autenticación incorrecto');

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) throw new NotFoundException('Usuario no encontrado');

    const sessionToken = await this.initNewSession(user.id);
    (user as any).sessionToken = sessionToken;
    const ep2fa       = await this.getEmpresaPrincipal(user.id);
    const accessToken = this.buildToken(user, ep2fa?.empresaId, undefined, undefined, ep2fa?.rol);
    const empresas   = await this.ueRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });
    return {
      message:       'Login exitoso',
      accessToken,
      empresaActual: ep2fa?.empresaId ?? null,
      empresas: empresas.map(e => ({
        empresaId:   e.empresaId, nombre: e.empresa?.nombre,
        rnc:         e.empresa?.rnc, rol: e.rol, isPrincipal: e.isPrincipal,
      })),
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
    };
  }

  // ─── Notificación de registro pendiente ───────────────────────────────────

  /** Envía email a todos los Super Admins cuando un nuevo usuario se registra. */
  async notificarAdminsPendiente(
    nombre: string,
    email: string,
    empresa?: { empresaNombre?: string; telefono?: string; sectorEmpresarial?: string },
  ): Promise<void> {
    const admins = await this.dataSource.query<any[]>(
      `SELECT email, nombre FROM users WHERE role = 'super_admin' AND "isActive" = true LIMIT 10`,
    );
    if (!admins.length) return;

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const empresaRows = empresa?.empresaNombre ? `
      <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Empresa:</td><td style="font-weight:700">${empresa.empresaNombre}</td></tr>
      ${empresa.telefono ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Teléfono:</td><td style="font-weight:700">${empresa.telefono}</td></tr>` : ''}
      ${empresa.sectorEmpresarial ? `<tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Sector:</td><td style="font-weight:700">${empresa.sectorEmpresarial}</td></tr>` : ''}
    ` : '';

    this.logger.log(
      `🆕 NUEVA EMPRESA: ${empresa?.empresaNombre ?? 'N/A'} | ` +
      `Sector: ${empresa?.sectorEmpresarial ?? 'N/A'} | ` +
      `Tel: ${empresa?.telefono ?? 'N/A'}`,
    );

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">🔔 Nueva solicitud de registro</h2></div>
  <div class="body">
    <p>Un nuevo usuario se ha registrado y está esperando tu aprobación:</p>
    <table style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:16px 0">
      <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Nombre:</td><td style="font-weight:700">${nombre}</td></tr>
      <tr><td style="color:#6b7280;font-size:13px;padding:4px 0">Email:</td><td style="font-weight:700">${email}</td></tr>
      ${empresaRows}
    </table>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontendUrl}/super-admin" class="btn">Revisar en el panel →</a>
    </p>
    <p style="color:#6b7280;font-size:13px">Ve a Super Admin → Pendientes para aprobar o rechazar.</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    for (const admin of admins) {
      await this.emailService.enviar({
        to:      admin.email,
        subject: `Nueva solicitud de registro — ${nombre} (${email})`,
        html,
      }).catch(() => null);
    }
    this.logger.log(`[REGISTRO] Admins notificados del nuevo registro pendiente: ${email}`);
  }

  // ─── Setup Password (Google users) ───────────────────────────────────────────

  /** Genera y persiste un token de configuración de contraseña para un usuario Google.
   *  Invalida tokens anteriores del mismo usuario antes de crear el nuevo. */
  async generarSetupToken(userId: number): Promise<string> {
    // Invalidar tokens anteriores (no-usados) del mismo usuario
    await this.dataSource.query(
      `UPDATE setup_tokens SET used = true WHERE "userId" = $1 AND used = false`,
      [userId],
    );
    const rawToken  = randomBytes(32).toString('hex');
    const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await this.dataSource.query(
      `INSERT INTO setup_tokens ("userId", "tokenHash", "expiresAt", used) VALUES ($1, $2, $3, false)`,
      [userId, tokenHash, expiresAt],
    );
    this.logger.log(`[SETUP-TOKEN] Token generado para usuario #${userId}`);
    return rawToken;
  }

  /** Valida el token de setup, hashea y guarda la contraseña, crea sesión y devuelve JWT.
   *  POST /auth/setup-password — endpoint público (no requiere JWT). */
  async setupPassword(rawToken: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
    const [tokenRow] = await this.dataSource.query<any[]>(
      `SELECT id, "userId", "expiresAt", used FROM setup_tokens WHERE "tokenHash" = $1`,
      [tokenHash],
    );

    if (!tokenRow) {
      throw new BadRequestException('El enlace es inválido o ya fue utilizado');
    }
    if (tokenRow.used) {
      throw new BadRequestException('Este enlace ya fue utilizado. Inicia sesión con Google para obtener uno nuevo.');
    }
    if (new Date(tokenRow.expiresAt) < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Inicia sesión con Google para obtener uno nuevo.');
    }

    const userId = tokenRow.userId;

    // Hashear y guardar contraseña + marcar passwordConfigured = true
    const hashed = await bcrypt.hash(password, 12);
    await this.dataSource.query(
      `UPDATE users SET password = $1, "passwordConfigured" = true WHERE id = $2`,
      [hashed, userId],
    );

    // Marcar token como usado (un solo uso)
    await this.dataSource.query(
      `UPDATE setup_tokens SET used = true WHERE id = $1`,
      [tokenRow.id],
    );

    // Auto-login: crear sesión y devolver JWT
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const sessionToken = await this.initNewSession(userId);
    (user as any).sessionToken = sessionToken;

    const epSetup     = await this.getEmpresaPrincipal(userId);
    const accessToken = this.buildToken(user, epSetup?.empresaId, undefined, undefined, epSetup?.rol);

    const empresas = await this.ueRepository.find({
      where: { userId, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });

    this.logger.log(`[SETUP-PASSWORD] Contraseña configurada para usuario #${userId} — sesión iniciada`);

    return {
      accessToken,
      empresaActual: epSetup?.empresaId ?? null,
      empresas: empresas.map(e => ({
        empresaId:   e.empresaId,
        nombre:      e.empresa?.nombre,
        rnc:         e.empresa?.rnc,
        rol:         e.rol,
        isPrincipal: e.isPrincipal,
      })),
      user: {
        id:             user.id,
        nombre:         user.nombre,
        email:          user.email,
        role:           user.role,
        tourCompletado: (user as any).tourCompletado ?? false,
      },
    };
  }

  /** Genera la respuesta de login completa (token + empresas) para un User */
  async buildLoginResponse(user: User) {
    const sessionToken = await this.initNewSession(user.id);
    (user as any).sessionToken = sessionToken;  // propagar al buildToken
    const epResp      = await this.getEmpresaPrincipal(user.id);
    const accessToken = this.buildToken(user, epResp?.empresaId, undefined, undefined, epResp?.rol);
    const empresas    = await this.ueRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });
    return {
      accessToken,
      empresaActual: epResp?.empresaId ?? null,
      empresas: empresas.map(e => ({
        empresaId:   e.empresaId,
        nombre:      e.empresa?.nombre,
        rnc:         e.empresa?.rnc,
        rol:         e.rol,
        isPrincipal: e.isPrincipal,
      })),
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
    };
  }

  // ─── Security config helpers ────────────────────────────────────────────────

  /**
   * Devuelve el número máximo de intentos de login para una empresa.
   * El global es el TOPE: empresa.override ≤ global siempre.
   * Rango: [3, global].
   */
  async getEffectiveMaxIntentos(empresaId?: number): Promise<number> {
    let global = 5;
    try {
      const rows = await this.dataSource.query<{ valor: string }[]>(
        `SELECT valor FROM configuracion_sistema WHERE clave = 'MAX_INTENTOS_LOGIN' LIMIT 1`,
      );
      const n = parseInt(rows[0]?.valor ?? '5', 10);
      global = isNaN(n) ? 5 : Math.min(10, Math.max(3, n));
    } catch { /* usar 5 */ }

    let effective = global;
    if (empresaId) {
      try {
        const emp = await this.empresaRepository.findOne({ where: { id: empresaId }, select: ['configuracion'] as any });
        const override = (emp?.configuracion as Record<string, unknown> | undefined)?.['maxIntentos'];
        if (typeof override === 'number' && Number.isFinite(override)) {
          effective = Math.min(override, global); // empresa nunca puede ser más laxa que el global
        }
      } catch { /* usar global */ }
    }

    return Math.min(global, Math.max(3, effective));
  }

  // ── Formulario de soporte público ─────────────────────────────────────────
  async enviarMensajeSoporte(dto: { nombre: string; email: string; mensaje: string }): Promise<{ ok: boolean }> {
    const dest = process.env['NOTIF_ADMIN_EMAIL'] ?? 'soporte@hicloudrd.com';
    try {
      await this.emailService.enviar({
        to:      dest,
        replyTo: dto.email,
        subject: `💬 Soporte HiCloud — mensaje de ${dto.nombre}`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
            <div style="background:#1E3A8A;border-radius:10px 10px 0 0;padding:20px 24px">
              <h2 style="color:#fff;margin:0;font-size:18px">💬 Nuevo mensaje de soporte</h2>
            </div>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
              <p style="margin:0 0 8px"><strong>Nombre:</strong> ${dto.nombre}</p>
              <p style="margin:0 0 16px"><strong>Correo:</strong> <a href="mailto:${dto.email}" style="color:#2563EB">${dto.email}</a></p>
              <p style="margin:0 0 8px;font-weight:600">Mensaje:</p>
              <div style="background:#fff;border-left:4px solid #2563EB;border-radius:0 6px 6px 0;padding:12px 16px;color:#1E293B;line-height:1.6">
                ${dto.mensaje.replace(/\n/g, '<br>')}
              </div>
              <p style="color:#94A3B8;font-size:11px;margin:20px 0 0">
                Puedes responder directamente a este correo — llegará a ${dto.email}
              </p>
            </div>
          </div>
        `,
        text: `Nuevo mensaje de soporte\n\nNombre: ${dto.nombre}\nCorreo: ${dto.email}\n\nMensaje:\n${dto.mensaje}`,
      });
    } catch (err) {
      this.logger.warn(`enviarMensajeSoporte: fallo al enviar email — ${(err as Error).message}`);
    }
    // Siempre devolvemos ok:true para no revelar errores de infraestructura
    return { ok: true };
  }

  /**
   * Devuelve el lifetime de sesión en ms para una empresa.
   * El global es el TOPE: empresa.sesionHoras ≤ global siempre.
   * Rango: [1h, global].
   */
  async getEffectiveSessionMs(empresaId?: number): Promise<number> {
    let globalHoras = 24;
    try {
      const rows = await this.dataSource.query<{ valor: string }[]>(
        `SELECT valor FROM configuracion_sistema WHERE clave = 'SESION_HORAS' LIMIT 1`,
      );
      const h = parseInt(rows[0]?.valor ?? '24', 10);
      globalHoras = isNaN(h) ? 24 : Math.min(720, Math.max(1, h));
    } catch { /* usar 24 */ }

    let horas = globalHoras;
    if (empresaId) {
      try {
        const emp = await this.empresaRepository.findOne({ where: { id: empresaId }, select: ['configuracion'] as any });
        const override = (emp?.configuracion as Record<string, unknown> | undefined)?.['sesionHoras'];
        if (typeof override === 'number' && Number.isFinite(override)) {
          horas = Math.min(override, globalHoras); // empresa nunca puede ser más laxa que el global
        }
      } catch { /* usar global */ }
    }

    return Math.min(globalHoras, Math.max(1, horas)) * 3_600_000;
  }

  // ── Stats públicas de plataforma (sin auth, caché 24 h en proceso) ──────────
  private _statsCacheValue: number | null = null;
  private _statsCacheAt = 0;
  private readonly STATS_TTL_MS = 24 * 60 * 60 * 1000;

  async statsPlataforma(): Promise<{ ecfAceptados: number }> {
    if (
      this._statsCacheValue !== null &&
      Date.now() - this._statsCacheAt < this.STATS_TTL_MS
    ) {
      return { ecfAceptados: this._statsCacheValue };
    }
    try {
      const [{ total }] = await this.dataSource.query<[{ total: number }]>(
        `SELECT COUNT(*)::int AS total FROM ecf WHERE "estadoDGII" = 'aceptado'`,
      );
      this._statsCacheValue = total;
      this._statsCacheAt   = Date.now();
      return { ecfAceptados: total };
    } catch {
      // Si la DB no responde, señalamos con -1 para que el frontend use fallback
      return { ecfAceptados: -1 };
    }
  }
}
