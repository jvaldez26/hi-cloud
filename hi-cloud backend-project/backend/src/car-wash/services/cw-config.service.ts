import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CwConfig } from '../entities/cw-config.entity';

@Injectable()
export class CwConfigService {
  constructor(
    @InjectRepository(CwConfig) private readonly repo: Repository<CwConfig>,
  ) {}

  /** Crea la config con los valores por defecto la primera vez que una
   *  sucursal usa Car Wash — igual que el patrón de LimitesService.getSuscripcion. */
  async obtener(empresaId: number, sucursalId: number): Promise<CwConfig> {
    const existente = await this.repo.findOne({ where: { empresaId, sucursalId } });
    if (existente) return existente;
    return this.repo.save(this.repo.create({ empresaId, sucursalId }));
  }

  async actualizar(empresaId: number, sucursalId: number, cambios: Partial<CwConfig>): Promise<CwConfig> {
    const config = await this.obtener(empresaId, sucursalId);
    Object.assign(config, cambios);
    return this.repo.save(config);
  }
}
