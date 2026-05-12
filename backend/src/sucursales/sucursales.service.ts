import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateSucursalDto {
  codigo:        string;
  nombre:        string;
  direccion?:    string;
  ciudad?:       string;
  telefono?:     string;
  email?:        string;
  esPrincipal?:  boolean;
  responsableId?: number;
  notas?:        string;
}

@Injectable()
export class SucursalesService {
  constructor(
    @InjectRepository(Sucursal)
    private sucursalRepo: Repository<Sucursal>,
    private dataSource:   DataSource,
    private tenantSvc:    TenantService,
  ) {}

  listar() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.sucursalRepo.find({
      where:  { empresaId, isActive: true },
      order:  { esPrincipal: 'DESC', nombre: 'ASC' },
    });
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const s = await this.sucursalRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!s) throw new NotFoundException(`Sucursal #${id} no encontrada`);
    return s;
  }

  async crear(dto: CreateSucursalDto) {
    const empresaId = this.tenantSvc.getEmpresaId();

    const existe = await this.sucursalRepo.findOne({
      where: { codigo: dto.codigo, empresaId, isActive: true },
    });
    if (existe) throw new ConflictException(`El código ${dto.codigo} ya está en uso`);

    // Si es principal, quitar flag a las demás
    if (dto.esPrincipal) {
      await this.sucursalRepo.update({ empresaId }, { esPrincipal: false });
    }

    // Primera sucursal = principal automáticamente
    const totalExistentes = await this.sucursalRepo.count({ where: { empresaId, isActive: true } });
    const esPrincipal = dto.esPrincipal ?? totalExistentes === 0;

    const s = this.sucursalRepo.create({ ...dto, empresaId, esPrincipal });
    return this.sucursalRepo.save(s);
  }

  async actualizar(id: number, dto: Partial<CreateSucursalDto>) {
    const sucursal = await this.findOne(id);
    const empresaId = this.tenantSvc.getEmpresaId();

    if (dto.codigo && dto.codigo !== sucursal.codigo) {
      const codExiste = await this.sucursalRepo.findOne({
        where: { codigo: dto.codigo, empresaId, isActive: true },
      });
      if (codExiste) throw new ConflictException(`El código ${dto.codigo} ya está en uso`);
    }

    if (dto.esPrincipal) {
      await this.sucursalRepo.update({ empresaId }, { esPrincipal: false });
    }

    await this.sucursalRepo.update(id, dto);
    return this.findOne(id);
  }

  async setPrincipal(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.findOne(id);
    await this.sucursalRepo.update({ empresaId }, { esPrincipal: false });
    await this.sucursalRepo.update(id, { esPrincipal: true });
    return this.findOne(id);
  }

  async eliminar(id: number) {
    const s = await this.findOne(id);
    if (s.esPrincipal) throw new ConflictException('No puedes eliminar la sucursal principal');
    await this.sucursalRepo.update(id, { isActive: false });
    return { ok: true, mensaje: `Sucursal "${s.nombre}" eliminada` };
  }
}
