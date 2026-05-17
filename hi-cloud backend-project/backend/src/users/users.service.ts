import { Injectable, NotFoundException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './users.entity';
import { UserRole } from './enums/user-role.enum';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    const total = await this.userRepository.count();
    if (total === 0) {
      const password = await bcrypt.hash('Admin1234', 12);
      await this.userRepository.save(
        this.userRepository.create({
          nombre:   'Administrador',
          email:    'admin@hicloud.com',
          password,
          role:     UserRole.ADMIN,
        }),
      );
      this.logger.log('✅ Usuario admin creado — email: admin@hicloud.com | pass: Admin1234');
    }
  }

  /** Sin select explícito — TypeORM respeta `select: false` en la entidad
   *  (password, tokens, googleId, etc. NO se cargan). Incluye createdAt y
   *  emailVerifiedAt necesarios para la lógica de login/verificación. */
  findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  /** Igual que findByEmail pero incluye el hash de contraseña para bcrypt. */
  findByEmailForAuth(email: string) {
    return this.userRepository
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.sessionToken')
      .where('u.email = :email', { email })
      .getOne();
  }

  async findById(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
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

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.nombre', 'user.email', 'user.role', 'user.isActive', 'user.createdAt'])
      .where('user.isActive = :active', { active: true });

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
