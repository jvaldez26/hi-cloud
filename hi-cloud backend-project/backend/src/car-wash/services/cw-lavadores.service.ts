import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CrearLavadorDto, ActualizarLavadorDto } from '../dto/lavador.dto';

@Injectable()
export class CwLavadoresService {
  constructor(
    @InjectRepository(CwLavador) private readonly repo: Repository<CwLavador>,
  ) {}

  listar(empresaId: number, soloActivos = false): Promise<CwLavador[]> {
    return this.repo.find({
      where: soloActivos ? { empresaId, activo: true } : { empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async obtener(empresaId: number, id: number): Promise<CwLavador> {
    const lavador = await this.repo.findOne({ where: { id, empresaId } });
    if (!lavador) throw new NotFoundException(`Lavador #${id} no encontrado`);
    return lavador;
  }

  crear(empresaId: number, dto: CrearLavadorDto): Promise<CwLavador> {
    return this.repo.save(this.repo.create({ empresaId, ...dto }));
  }

  async actualizar(empresaId: number, id: number, dto: ActualizarLavadorDto): Promise<CwLavador> {
    const lavador = await this.obtener(empresaId, id);
    Object.assign(lavador, dto);
    return this.repo.save(lavador);
  }
}
