import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AtributoProducto, TipoAtributo } from './entities/atributo-producto.entity';
import { ValorAtributo } from './entities/valor-atributo.entity';
import { ProductoVariante } from './entities/producto-variante.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class AtributosProductoService {
  constructor(
    @InjectRepository(AtributoProducto)
    private atributoRepo: Repository<AtributoProducto>,
    @InjectRepository(ValorAtributo)
    private valorRepo: Repository<ValorAtributo>,
    @InjectRepository(ProductoVariante)
    private varianteRepo: Repository<ProductoVariante>,
    private tenantService: TenantService,
  ) {}

  // ── Atributos ──────────────────────────────────────────────────────────────

  async crearAtributo(dto: {
    nombre: string; tipo?: TipoAtributo; unidad?: string; orden?: number;
    valores?: Array<{ valor: string; codigo?: string; colorHex?: string; orden?: number }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const atrib = await this.atributoRepo.save(
      this.atributoRepo.create({ ...dto, empresaId, activo: true, orden: dto.orden ?? 0 }),
    );

    if (dto.valores?.length) {
      const vals = dto.valores.map((v, i) =>
        this.valorRepo.create({ ...v, atributoId: atrib.id, orden: v.orden ?? i, empresaId }),
      );
      await this.valorRepo.save(vals);
    }

    return this.findAtributoById(atrib.id);
  }

  async getAtributos() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.atributoRepo.find({
      where: { empresaId, isActive: true, activo: true },
      relations: ['valores'],
      order: { orden: 'ASC', nombre: 'ASC' },
    });
  }

  async findAtributoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const a = await this.atributoRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['valores'],
    });
    if (!a) throw new NotFoundException(`Atributo #${id} no encontrado`);
    a.valores = (a.valores ?? []).sort((x, y) => x.orden - y.orden);
    return a;
  }

  async updateAtributo(id: number, dto: Partial<{ nombre: string; orden: number; unidad: string }>) {
    await this.findAtributoById(id);
    await this.atributoRepo.update(id, dto as any);
    return this.findAtributoById(id);
  }

  async deleteAtributo(id: number) {
    await this.findAtributoById(id);
    await this.atributoRepo.update(id, { isActive: false });
    return { message: 'Atributo eliminado' };
  }

  // ── Valores ────────────────────────────────────────────────────────────────

  async agregarValor(atributoId: number, dto: {
    valor: string; codigo?: string; colorHex?: string; orden?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findAtributoById(atributoId);
    const totalValores = await this.valorRepo.count({ where: { atributoId, isActive: true } });
    const val = this.valorRepo.create({
      ...dto, atributoId, empresaId, orden: dto.orden ?? totalValores,
    });
    return this.valorRepo.save(val);
  }

  async deleteValor(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const v = await this.valorRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!v) throw new NotFoundException(`Valor #${id} no encontrado`);
    await this.valorRepo.update(id, { isActive: false });
    return { message: 'Valor eliminado' };
  }

  // ── Variantes ──────────────────────────────────────────────────────────────

  async crearVariante(dto: {
    productoId: number;
    sku?: string;
    atributos: Array<{ atributoId: number; valorId: number }>;
    stock?: number;
    stockMinimo?: number;
    precioOverride?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();

    // Cargar detalles de los atributos/valores seleccionados
    const atributosDetail: ProductoVariante['atributos'] = [];
    for (const a of dto.atributos) {
      const atrib = await this.atributoRepo.findOne({ where: { id: a.atributoId, empresaId, isActive: true }, relations: ['valores'] });
      if (!atrib) throw new NotFoundException(`Atributo #${a.atributoId} no encontrado`);
      const val = atrib.valores?.find(v => v.id === a.valorId);
      if (!val) throw new NotFoundException(`Valor #${a.valorId} no encontrado en el atributo`);
      atributosDetail.push({
        atributoId: atrib.id, atributoNombre: atrib.nombre,
        valorId: val.id, valor: val.valor, colorHex: val.colorHex,
      });
    }

    // Nombre auto-generado
    const nombreVariante = atributosDetail.map(a => `${a.atributoNombre}: ${a.valor}`).join(' / ');

    // SKU auto si no se provee
    const sku = dto.sku ?? await this.generarSku(dto.productoId, atributosDetail);

    // Verificar SKU único
    const existe = await this.varianteRepo.findOne({ where: { sku, empresaId, isActive: true } });
    if (existe) throw new ConflictException(`SKU "${sku}" ya existe`);

    const variante = this.varianteRepo.create({
      productoId:    dto.productoId,
      sku,
      nombre:        nombreVariante,
      atributos:     atributosDetail,
      stock:         dto.stock ?? 0,
      stockMinimo:   dto.stockMinimo ?? 0,
      precioOverride: dto.precioOverride,
      costoPromedio: 0,
      activa:        true,
      empresaId,
    });

    return this.varianteRepo.save(variante);
  }

  private async generarSku(productoId: number, atributos: ProductoVariante['atributos']): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const count = await this.varianteRepo.count({ where: { productoId, empresaId } });
    const sufijos = atributos.map(a => (a.valor).substring(0, 2).toUpperCase()).join('-');
    return `P${productoId}-${sufijos}-${count + 1}`;
  }

  async getVariantesByProducto(productoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.varianteRepo.find({
      where: { productoId, empresaId, isActive: true },
      order: { sku: 'ASC' },
    });
  }

  async updateVariante(id: number, dto: Partial<{
    stock: number; stockMinimo: number; precioOverride: number; activa: boolean; sku: string;
  }>) {
    const empresaId = this.tenantService.getEmpresaId();
    const v = await this.varianteRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!v) throw new NotFoundException(`Variante #${id} no encontrada`);
    await this.varianteRepo.update(id, dto as any);
    return this.varianteRepo.findOne({ where: { id } });
  }

  async deleteVariante(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.varianteRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Variante eliminada' };
  }

  async buscarPorSku(sku: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const v = await this.varianteRepo.findOne({ where: { sku, empresaId, isActive: true } });
    if (!v) throw new NotFoundException(`SKU "${sku}" no encontrado`);
    return v;
  }

  // ── Resumen de variantes con stock bajo ─────────────────────────────────────

  async getVariantesStockBajo() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.varianteRepo
      .createQueryBuilder('v')
      .where('v.empresaId = :eid', { eid: empresaId })
      .andWhere('v.isActive = true')
      .andWhere('v.activa = true')
      .andWhere('v.stock <= v.stockMinimo')
      .orderBy('v.stock', 'ASC')
      .getMany();
  }

  // ── Generar todas las combinaciones posibles (helper) ──────────────────────

  generarCombinaciones(atributosConValores: Array<{ atributoId: number; nombre: string; valores: Array<{ valorId: number; valor: string }> }>) {
    if (atributosConValores.length === 0) return [];

    const combinar = (idx: number, actual: any[]): any[][] => {
      if (idx === atributosConValores.length) return [actual];
      const { atributoId, nombre, valores } = atributosConValores[idx];
      const result: any[][] = [];
      for (const v of valores) {
        result.push(...combinar(idx + 1, [...actual, { atributoId, atributoNombre: nombre, valorId: v.valorId, valor: v.valor }]));
      }
      return result;
    };

    return combinar(0, []);
  }
}
