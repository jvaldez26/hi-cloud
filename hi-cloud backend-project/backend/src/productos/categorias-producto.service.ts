import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CategoriaProducto } from './entities/categoria-producto.entity';
import { TenantService } from '../tenant/tenant.service';
import { CreateCategoriaProductoDto, UpdateCategoriaProductoDto } from './dto/categoria-producto.dto';

export interface CategoriaProductoConRuta {
  id: number;
  nombre: string;
  descripcion: string | null;
  categoriaPadreId: number | null;
  categoriaPadreNombre: string | null;
  /** "Padre › Hija", o solo "Hija" si no tiene padre — para el selector del formulario. */
  ruta: string;
  isActive: boolean;
}

/**
 * Catálogo de categorías de producto (ver categoria-producto.entity.ts).
 * No existe un DELETE real — "una categoría con productos no se borra: se
 * desactiva o se fusiona con otra" (y una SIN productos tampoco se borra:
 * mismo criterio de soft-delete que el resto del sistema, isActive=false).
 */
@Injectable()
export class CategoriasProductoService {
  constructor(
    @InjectRepository(CategoriaProducto) private readonly repo: Repository<CategoriaProducto>,
    private readonly dataSource: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  /** trim + minúsculas + sin acentos — mismo criterio que el dry-run de la migración de datos. */
  private normalizar(nombre: string): string {
    return nombre.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  }

  async listar(opts: { incluirInactivas?: boolean } = {}): Promise<CategoriaProductoConRuta[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const where: Record<string, unknown> = { empresaId };
    if (!opts.incluirInactivas) where.isActive = true;
    const filas = await this.repo.find({ where, order: { nombre: 'ASC' } });
    const porId = new Map(filas.map(c => [c.id, c]));
    return filas.map(c => {
      const padre = c.categoriaPadreId ? porId.get(c.categoriaPadreId) : undefined;
      return {
        id: c.id, nombre: c.nombre, descripcion: c.descripcion ?? null,
        categoriaPadreId: c.categoriaPadreId ?? null,
        categoriaPadreNombre: padre?.nombre ?? null,
        ruta: padre ? `${padre.nombre} › ${c.nombre}` : c.nombre,
        isActive: c.isActive,
      };
    });
  }

  /** Para ProductosService/otros módulos — confirma que categoriaId es de ESTA empresa antes de asignarla. */
  async existeYPerteneceAEmpresa(categoriaId: number, empresaId: number): Promise<boolean> {
    const fila = await this.repo.findOne({ where: { id: categoriaId, empresaId } });
    return !!fila;
  }

  /**
   * Resuelve un nombre de categoría (import CSV) contra el catálogo de la
   * empresa — comparación insensible a mayúsculas/acentos, igual que
   * validarNombreUnico. Si no existe: la crea cuando `puedeCrear` es true
   * (ADMIN/CONTADOR importando), o lanza un error claro cuando no
   * (VENDEDOR importando — nunca crea categorías en silencio).
   */
  async resolverOCrearPorNombre(nombre: string, puedeCrear: boolean): Promise<CategoriaProducto> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const normalizado = this.normalizar(nombre);
    const activas = await this.repo.find({ where: { empresaId, isActive: true } });
    const existente = activas.find(c => this.normalizar(c.nombre) === normalizado);
    if (existente) return existente;
    if (!puedeCrear) {
      throw new BadRequestException(
        `La categoría "${nombre}" no existe en el catálogo — pide a un ADMIN/CONTADOR que la cree o corrige el CSV.`,
      );
    }
    return this.repo.save(this.repo.create({ empresaId, nombre: nombre.trim() }));
  }

  private async validarNombreUnico(empresaId: number, nombre: string, ignorarId?: number): Promise<void> {
    const normalizado = this.normalizar(nombre);
    const activas = await this.repo.find({ where: { empresaId, isActive: true } });
    const choque = activas.find(c => c.id !== ignorarId && this.normalizar(c.nombre) === normalizado);
    if (choque) {
      throw new ConflictException(`Ya existe una categoría activa llamada "${choque.nombre}" — elige otro nombre o usa esa.`);
    }
  }

  /** Un solo nivel: el padre elegido no puede tener padre propio. */
  private async validarPadre(empresaId: number, categoriaPadreId: number | null | undefined): Promise<void> {
    if (categoriaPadreId == null) return;
    const padre = await this.repo.findOne({ where: { id: categoriaPadreId, empresaId } });
    if (!padre) throw new NotFoundException('La categoría padre no existe.');
    if (!padre.isActive) throw new BadRequestException('La categoría padre está inactiva.');
    if (padre.categoriaPadreId != null) {
      throw new BadRequestException('Solo se admite un nivel de subcategorías — esa categoría ya es, ella misma, una subcategoría.');
    }
  }

  async crear(dto: CreateCategoriaProductoDto): Promise<CategoriaProducto> {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.validarNombreUnico(empresaId, dto.nombre);
    await this.validarPadre(empresaId, dto.categoriaPadreId);
    return this.repo.save(this.repo.create({
      empresaId, nombre: dto.nombre.trim(), descripcion: dto.descripcion?.trim() || null,
      categoriaPadreId: dto.categoriaPadreId ?? null,
    }));
  }

  async actualizar(id: number, dto: UpdateCategoriaProductoDto): Promise<CategoriaProducto> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const actual = await this.repo.findOne({ where: { id, empresaId } });
    if (!actual) throw new NotFoundException(`Categoría #${id} no encontrada`);
    if (dto.nombre !== undefined) await this.validarNombreUnico(empresaId, dto.nombre, id);
    if (dto.categoriaPadreId !== undefined) {
      if (dto.categoriaPadreId === id) throw new BadRequestException('Una categoría no puede ser su propio padre.');
      await this.validarPadre(empresaId, dto.categoriaPadreId);
      // Si esta categoría va a tener padre, ella misma no puede tener hijos (un solo nivel).
      if (dto.categoriaPadreId != null) {
        const tieneHijos = await this.repo.count({ where: { empresaId, categoriaPadreId: id, isActive: true } });
        if (tieneHijos > 0) {
          throw new BadRequestException('Esta categoría ya tiene subcategorías propias — no puede convertirse en subcategoría de otra.');
        }
      }
    }
    Object.assign(actual, {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
      ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion?.trim() || null } : {}),
      ...(dto.categoriaPadreId !== undefined ? { categoriaPadreId: dto.categoriaPadreId } : {}),
    });
    return this.repo.save(actual);
  }

  /** Siempre permitido, tenga o no productos — "no se borra: se desactiva". */
  async desactivar(id: number): Promise<{ categoria: CategoriaProducto; productosAfectados: number }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const actual = await this.repo.findOne({ where: { id, empresaId } });
    if (!actual) throw new NotFoundException(`Categoría #${id} no encontrada`);
    actual.isActive = false;
    await this.repo.save(actual);
    const [{ count }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM productos WHERE "empresaId" = $1 AND "categoriaId" = $2 AND "isActive" = true`,
      [empresaId, id],
    );
    return { categoria: actual, productosAfectados: Number(count) };
  }

  async activar(id: number): Promise<CategoriaProducto> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const actual = await this.repo.findOne({ where: { id, empresaId } });
    if (!actual) throw new NotFoundException(`Categoría #${id} no encontrada`);
    await this.validarNombreUnico(empresaId, actual.nombre, id); // pudo haber otra activa con el mismo nombre mientras esta estaba inactiva
    actual.isActive = true;
    return this.repo.save(actual);
  }

  /** Fusiona `id` (origen) DENTRO de `categoriaDestinoId` — reasigna productos
   *  y subcategorías, y desactiva el origen. Todo en una transacción. */
  async fusionar(id: number, categoriaDestinoId: number): Promise<{ productosReasignados: number; subcategoriasReasignadas: number }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    if (id === categoriaDestinoId) throw new BadRequestException('No puedes fusionar una categoría consigo misma.');

    const [origen, destino] = await Promise.all([
      this.repo.findOne({ where: { id, empresaId } }),
      this.repo.findOne({ where: { id: categoriaDestinoId, empresaId } }),
    ]);
    if (!origen) throw new NotFoundException(`Categoría #${id} no encontrada`);
    if (!destino) throw new NotFoundException(`Categoría destino #${categoriaDestinoId} no encontrada`);
    if (!destino.isActive) throw new BadRequestException('No puedes fusionar hacia una categoría inactiva.');

    const hijosDelOrigen = await this.repo.count({ where: { empresaId, categoriaPadreId: id, isActive: true } });
    if (hijosDelOrigen > 0 && destino.categoriaPadreId != null) {
      throw new BadRequestException(
        'Esa categoría tiene subcategorías y el destino es, a su vez, una subcategoría — la fusión dejaría dos niveles. ' +
        'Fusiona primero hacia una categoría de nivel superior.',
      );
    }

    return this.dataSource.transaction(async em => {
      const rProductos = await em.query(
        `UPDATE productos SET "categoriaId" = $1 WHERE "empresaId" = $2 AND "categoriaId" = $3`,
        [categoriaDestinoId, empresaId, id],
      );
      const rHijos = hijosDelOrigen > 0
        ? await em.query(
            `UPDATE categorias_productos SET "categoriaPadreId" = $1 WHERE "empresaId" = $2 AND "categoriaPadreId" = $3`,
            [categoriaDestinoId, empresaId, id],
          )
        : null;
      await em.getRepository(CategoriaProducto).update({ id, empresaId }, { isActive: false });
      return {
        productosReasignados: rProductos[1] ?? 0,
        subcategoriasReasignadas: rHijos?.[1] ?? 0,
      };
    });
  }
}
