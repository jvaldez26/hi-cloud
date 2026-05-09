import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
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

  findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'nombre', 'email', 'password', 'role', 'isActive'],
    });
  }

  async findById(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return user;
  }

  createFull(data: { nombre: string; email: string; password: string; role?: UserRole }) {
    const user = this.userRepository.create({ ...data, role: data.role ?? UserRole.VIEWER });
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

  async update(id: number, dto: UpdateUserDto) {
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
