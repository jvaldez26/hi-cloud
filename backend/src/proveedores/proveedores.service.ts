import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proveedor } from './entities/proveedor.entity';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private proveedorRepository: Repository<Proveedor>,
    private tenantService:   TenantService,
    private realtimeService: RealtimeService,
  ) {}

  async create(dto: CreateProveedorDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const existing = await this.proveedorRepository.findOne({
      where: { rnc: dto.rnc, empresaId },
    });
    if (existing) throw new ConflictException(`RNC ${dto.rnc} ya está registrado en esta empresa`);

    const proveedor = this.proveedorRepository.create({ ...dto, empresaId });
    const saved     = await this.proveedorRepository.save(proveedor) as Proveedor;
    this.realtimeService.notify(empresaId, 'proveedor', 'created', saved.id);
    return saved;
  }

  async findAll(pagination: PaginationDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.proveedorRepository
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(p.nombre ILIKE :s OR p.rnc ILIKE :s OR p.email ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('p.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 200))
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const proveedor = await this.proveedorRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!proveedor) throw new NotFoundException(`Proveedor #${id} no encontrado`);
    return proveedor;
  }

  async findByRnc(rnc: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const proveedor = await this.proveedorRepository.findOne({
      where: { rnc, empresaId, isActive: true },
    });
    if (!proveedor) throw new NotFoundException(`Proveedor con RNC ${rnc} no encontrado`);
    return proveedor;
  }

  async update(id: number, dto: UpdateProveedorDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const proveedor = await this.findOne(id);

    if (dto.rnc && dto.rnc !== proveedor.rnc) {
      const rncExists = await this.proveedorRepository.findOne({
        where: { rnc: dto.rnc, empresaId },
      });
      if (rncExists) throw new ConflictException(`RNC ${dto.rnc} ya está registrado`);
    }

    await this.proveedorRepository.update(id, dto);
    this.realtimeService.notify(empresaId, 'proveedor', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const proveedor = await this.findOne(id);
    await this.proveedorRepository.update(id, { isActive: false });
    this.realtimeService.notify(empresaId, 'proveedor', 'deleted', id);
    return { message: `Proveedor "${proveedor.nombre}" eliminado` };
  }
}
