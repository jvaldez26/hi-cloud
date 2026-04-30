import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './users.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // ✅ CREAR USUARIO (ESTO ES LO QUE TE FALTA O NO ESTÁ BIEN)
  async createUser(data: {
    nombre: string;
    email: string;
    password: string;
  }) {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  // ✅ BUSCAR POR EMAIL
  async findByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  // OPCIONAL
  async findAll() {
    return this.userRepository.find();
  }
}