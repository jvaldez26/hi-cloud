import { Injectable, NotFoundException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { UserRole } from './enums/user-role.enum';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tenantService: TenantService,
  ) {}

  async onModuleInit() {
    const total = await this.userRepository.count();
    if (total === 0) {
      const password = await bcrypt.hash('Admin1234', 12);
      await this.userRepository.save(
        this.userRepository.create({
          nombre:          'Administrador',
          email:           'admin@hicloud.com',
          password,
          role:            UserRole.ADMIN,
          emailVerifiedAt: new Date(),  // bootstrap admin: no debe quedar bloqueado por el gate de correo verificado
        }),
      );
      this.logger.log('✅ Usuario admin creado — email: admin@hicloud.com | pass: Admin1234');
    }
  }

  /** Sin select explícito — TypeORM respeta `select: false` en la entidad
   *  (password, tokens, googleId, etc. NO se cargan). Incluye createdAt y
   *  emailVerifiedAt necesarios para la lógica de login/verificación.
   *  Usa ILike para ser insensible a mayúsculas — el email se guarda
   *  normalizado pero el lookup debe tolerar cualquier capitalización. */
  findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email: ILike(email) } });
  }

  /** Igual que findByEmail pero incluye el hash de contraseña para bcrypt.
   *  LOWER() en ambos lados para lookup case-insensitive. */
  findByEmailForAuth(email: string) {
    return this.userRepository
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.sessionToken')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  /**
   * Usuario por id, SIN secretos (sessionToken incluido — la columna es
   * select:false). Es la variante segura: úsala salvo que necesites validar o
   * reemitir la sesión. Su resultado se devuelve tal cual al cliente en
   * GET /users/:id, así que no debe arrastrar nada sensible.
   */
  async findById(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return user;
  }

  /**
   * Igual que findById pero incluye sessionToken — mismo patrón que
   * findByEmailForAuth. Solo para los dos sitios que lo necesitan de verdad:
   *
   *  - JwtStrategy.validate(): compara el token del JWT con el de la BD.
   *  - AuthService.buildAccessTokenForUser(): /auth/refresh reemite el access
   *    token y debe propagar el sessionToken al nuevo JWT. Si saliera sin él,
   *    `if (payload.sessionToken)` de JwtStrategy sería falso y la sesión única
   *    quedaría desactivada EN SILENCIO para toda sesión ya refrescada.
   *
   * NUNCA devuelvas su resultado directamente en una respuesta HTTP.
   */
  async findByIdForAuth(id: number) {
    const user = await this.userRepository
      .createQueryBuilder('u')
      .addSelect('u.sessionToken')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return user;
  }

  /** role es REQUERIDO — cada caller decide explícitamente. */
  createFull(data: { nombre: string; email: string; password: string; role: UserRole }) {
    const user = this.userRepository.create({ ...data });
    return this.userRepository.save(user);
  }

  async findAll(pagination: PaginationDto) {
    const { limit = 10, page = 1, search } = pagination;

    // B-01: ADMIN solo ve usuarios de su empresa; super_admin ve todos
    let empresaId: number | null = null;
    try { empresaId = this.tenantService.getEmpresaId(); } catch { /* super_admin sin contexto */ }

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.nombre', 'user.email', 'user.role', 'user.isActive', 'user.createdAt'])
      .where('user.isActive = :active', { active: true });

    if (empresaId) {
      qb.innerJoin(
        'usuario_empresa', 'ue',
        'ue."userId" = user.id AND ue."empresaId" = :eid AND ue."isActive" = true',
        { eid: empresaId },
      );
    }

    if (search) {
      qb.andWhere('(user.nombre ILIKE :s OR user.email ILIKE :s)', { s: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('user.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: number, dto: UpdateUserDto, requesterId?: number) {
    if (requesterId !== undefined && id === requesterId) {
      throw new ForbiddenException('No puedes modificar tu propio perfil desde este endpoint');
    }
    await this.findById(id);
    await this.userRepository.update(id, dto);
    return this.findById(id);
  }

  async remove(id: number) {
    const user = await this.findById(id);
    await this.userRepository.update(id, { isActive: false });
    return { message: `Usuario "${user.nombre}" desactivado` };
  }
}
