import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// ⚠️ importa tu entidad (créala si no existe)
import { User } from './users.entity';

@Injectable()
export class UsersService {

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // 🔍 Buscar por email (para login)
  findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  // 🧾 Crear usuario (registro)
  createFull(data: { nombre: string; email: string; password: string }) {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  // 👀 Ver todos (opcional)
  findAll() {
    return this.userRepository.find();
  }
}