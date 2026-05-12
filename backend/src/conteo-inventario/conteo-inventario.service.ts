import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConteoInventario, EstadoConteo } from './entities/conteo-inventario.entity';
import { LineaConteo } from './entities/linea-conteo.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateConteoDto {
  nombre:      string;
  fecha:       string;
  sucursalId?: number;
  categoria?:  string;
  notas?:      string;
}

interface ActualizarLineaDto {
  lineaId:       number;
  cantidadFisica: number;
  observaciones?: string;
}

@Injectable()
export class ConteoInventarioService {
  constructor(
    @InjectRepository(ConteoInventario) private conteoRepo: Repository<ConteoInventario>,
    @InjectRepository(LineaConteo)      private lineaRepo:  Repository<LineaConteo>,
    @InjectRepository(Producto)         private prodRepo:   Repository<Producto>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d   = new Date();
    const pre = `CNT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.conteoRepo
      .createQueryBuilder('c')
      .select(`MAX(CAST(SPLIT_PART(c.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('c.numero LIKE :p',       { p: `${pre}%` })
      .andWhere('c.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  async crear(dto: CreateConteoDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

    // Obtener productos para incluir en el conteo
    const where: any = { empresaId, isActive: true };
    if (dto.categoria) where.categoria = dto.categoria;

    const productos = await this.prodRepo.find({ where, order: { codigo: 'ASC' } });

    const conteo = await this.conteoRepo.save(
      this.conteoRepo.create({
        empresaId,
        numero,
        nombre:         dto.nombre,
        fecha:          dto.fecha,
        sucursalId:     dto.sucursalId,
        categoria:      dto.categoria,
        notas:          dto.notas,
        usuarioId,
        totalProductos: productos.length,
      }),
    );

    // Crear líneas con cantidad de sistema actual
    const lineas = productos.map(p => ({
      conteoId:          conteo.id,
      productoId:        p.id,
      productoCodigo:    p.codigo,
      productoNombre:    p.nombre,
      categoriaProducto: p.categoria,
      cantidadSistema:   Number(p.stock),
      diferencia:        0,
      costoUnitario:     0,
    }));

    await this.lineaRepo.save(this.lineaRepo.create(lineas));
    return this.findOne(conteo.id);
  }

  listar() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.conteoRepo.find({
      where: { empresaId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const c = await this.conteoRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!c) throw new NotFoundException(`Conteo #${id} no encontrado`);
    return c;
  }

  async iniciar(id: number) {
    const c = await this.findOne(id);
    if (c.estado !== EstadoConteo.BORRADOR) throw new BadRequestException('El conteo ya fue iniciado');
    await this.conteoRepo.update(id, { estado: EstadoConteo.EN_PROCESO });
    return this.findOne(id);
  }

  async actualizarLinea(conteoId: number, dto: ActualizarLineaDto) {
    const c = await this.findOne(conteoId);
    if (c.estado === EstadoConteo.CONFIRMADO) throw new BadRequestException('El conteo ya fue confirmado');

    const linea = await this.lineaRepo.findOneByOrFail({ id: dto.lineaId, conteoId });
    const diferencia = +(dto.cantidadFisica - linea.cantidadSistema).toFixed(4);

    await this.lineaRepo.update(dto.lineaId, {
      cantidadFisica: dto.cantidadFisica,
      diferencia,
      observaciones:  dto.observaciones,
    });

    return this.lineaRepo.findOneByOrFail({ id: dto.lineaId });
  }

  async confirmar(id: number) {
    const c = await this.findOne(id);
    if (c.estado !== EstadoConteo.EN_PROCESO) throw new BadRequestException('Inicia el conteo primero');

    const lineasConDiferencia = c.lineas.filter(l => l.cantidadFisica != null && l.diferencia !== 0);
    const totalDiferencias    = lineasConDiferencia.length;

    // Aplicar ajustes de inventario (actualizar stock de cada producto con diferencia)
    await this.dataSource.transaction(async em => {
      const prodRepo   = em.getRepository(Producto);
      const conteoRepo = em.getRepository(ConteoInventario);

      for (const linea of lineasConDiferencia) {
        if (linea.cantidadFisica == null) continue;
        // Aplicar la cantidad física como nuevo stock
        await prodRepo.update(
          { id: linea.productoId },
          { stock: Math.max(0, linea.cantidadFisica) },
        );
      }

      await conteoRepo.update(id, {
        estado:          EstadoConteo.CONFIRMADO,
        totalDiferencias,
      });
    });

    return this.findOne(id);
  }

  async cancelar(id: number) {
    const c = await this.findOne(id);
    if (c.estado === EstadoConteo.CONFIRMADO) throw new BadRequestException('No se puede cancelar un conteo confirmado');
    await this.conteoRepo.update(id, { estado: EstadoConteo.CANCELADO });
    return this.findOne(id);
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.conteoRepo
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a', { a: true })
      .groupBy('c.estado')
      .getRawMany<{ estado: string; cantidad: string }>();
    return raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad) }));
  }
}
