import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Gasto, CategoriaGasto, CATEGORIA_LABELS,
} from './entities/gasto.entity';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { EmitirECFUseCase } from '../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../ecf/entities/ecf.entity';

interface CreateGastoDto {
  fecha:        string;
  categoria:    CategoriaGasto;
  descripcion:  string;
  monto:        number;
  itbis?:       number;
  proveedor?:   string;
  comprobante?: string;
  rncProveedor?: string;
  /** Código DGII 606: 01-11. Solo obligatorio cuando el gasto tiene comprobante fiscal. */
  tipoBienes?:  string;
  /** Forma de pago DGII 606: 01-07. Solo obligatorio cuando el gasto tiene comprobante fiscal. */
  formaPago?:   string;
  userId:       number;
}

@Injectable()
export class GastosService {
  private readonly logger = new Logger(GastosService.name);

  constructor(
    @InjectRepository(Gasto)
    private repo: Repository<Gasto>,
    private asientosService: AsientosAutomaticosService,
    private dataSource: DataSource,
    private tenantService: TenantService,
    private emitirECFUseCase: EmitirECFUseCase,
  ) {}

  async crear(dto: CreateGastoDto): Promise<Gasto> {
    const info  = CATEGORIA_LABELS[dto.categoria];
    // Gasto menor (E43): ITBIS siempre 0 — todo el monto va como exento
    const itbis = info?.generaE43 ? 0 : (dto.itbis ?? 0);
    const total = dto.monto + itbis;
    const fecha = new Date(dto.fecha);
    const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

    const sucursalId = this.tenantService.getSucursalId() ?? undefined;

    const gasto = await this.repo.save(
      this.repo.create({
        ...dto,
        empresaId: this.tenantService.getEmpresaId(),
        sucursalId,
        itbis,
        total,
        periodo,
        fecha,
      }),
    );

    // Asiento contable automático
    try {
      await this.asientosService.asientoGasto(
        gasto.id, total, dto.monto, itbis,
        `${info.emoji} ${info.label}: ${dto.descripcion}`,
        dto.userId,
      );
    } catch { /* no bloquear si falla */ }

    // Auto-emitir E43 si la categoría lo requiere (Gasto Menor DGII)
    if (info?.generaE43) {
      try {
        await this.emitirECFUseCase.execute({
          empresaId:           this.tenantService.getEmpresaId(),
          documentoOrigenTipo: DocumentoOrigenTipo.GASTO,
          documentoOrigenId:   gasto.id,
          tipoEcf:             43,
        });
      } catch (e: any) {
        this.logger.warn(`E43 no emitido para gasto #${gasto.id}: ${e?.message}`);
      }
    }

    return gasto;
  }

  async listar(pagination: PaginationDto, mes?: number, anio?: number, categoria?: CategoriaGasto, exportar?: boolean) {
    const { limit = 10, page = 1, search } = pagination;
    // exportar=true → devuelve todos los registros sin paginación (para Excel)
    const exportAll = exportar === true;

    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();

    const qb = this.repo.createQueryBuilder('g')
      .where('g.empresaId = :eid', { eid: empresaId })
      .andWhere('g.isActive = :a', { a: true });

    // Si el JWT tiene sucursalId → filtrar por sucursal; si no (admin sin sucursal) → mostrar todos
    if (sucursalId) qb.andWhere('g.sucursalId = :sid', { sid: sucursalId });

    if (mes && anio) {
      const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
      qb.andWhere('g.periodo = :p', { p: periodo });
    }
    if (categoria) qb.andWhere('g.categoria = :cat', { cat: categoria });
    if (search)    qb.andWhere('(g.descripcion ILIKE :s OR g.proveedor ILIKE :s)', { s: `%${search}%` });

    qb.orderBy('g.fecha', 'DESC');
    if (!exportAll) {
      qb.skip((page - 1) * limit).take(limit);
    }
    const [data, total] = await qb.getManyAndCount();

    // Cargar e-CF asociados (número + código seguridad + fecha) por documentoOrigenId
    const ids = data.map(g => g.id);
    let ecfMap: Record<number, { numero: string; codigoSeguridad?: string; fechaUso?: string; qrUrl?: string }> = {};
    if (ids.length > 0) {
      const ecfRows: any[] = await this.repo.manager.query(
        `SELECT "documentoOrigenId", numero, "codigoSeguridad", "fechaUso", "qrUrl"
         FROM ecf
         WHERE "documentoOrigenId" = ANY($1)
           AND "documentoOrigenTipo" = 'GASTO'
           AND "isActive" = true
         ORDER BY "createdAt" DESC`,
        [ids],
      );
      for (const e of ecfRows) {
        if (!ecfMap[e.documentoOrigenId]) {
          ecfMap[e.documentoOrigenId] = {
            numero:          e.numero,
            codigoSeguridad: e.codigoSeguridad ?? undefined,
            fechaUso:        e.fechaUso ? String(e.fechaUso).substring(0, 10) : undefined,
            qrUrl:           e.qrUrl ?? undefined,
          };
        }
      }
    }

    const enriched = data.map(g => ({
      ...g,
      ecfNumero:          ecfMap[g.id]?.numero          ?? null,
      ecfCodigoSeguridad: ecfMap[g.id]?.codigoSeguridad ?? null,
      ecfFecha:           ecfMap[g.id]?.fechaUso        ?? null,
      ecfQrUrl:           ecfMap[g.id]?.qrUrl           ?? null,
    }));
    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number): Promise<Gasto> {
    const empresaId = this.tenantService.getEmpresaId();
    const g = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!g) throw new NotFoundException(`Gasto #${id} no encontrado`);
    return g;
  }

  async eliminar(id: number) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
    return { message: 'Gasto eliminado' };
  }

  async getResumenMes(mes: number, anio: number) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    const rows = await this.repo
      .createQueryBuilder('g')
      .select('g.categoria', 'categoria')
      .addSelect('COALESCE(SUM(g.total), 0)', 'total')
      .addSelect('COUNT(g.id)', 'cantidad')
      .where('g.empresaId = :eid AND g.isActive = true AND g.periodo = :p', { eid: this.tenantService.getEmpresaId(), p: periodo })
      .groupBy('g.categoria')
      .orderBy('total', 'DESC')
      .getRawMany();

    const totales = await this.repo.createQueryBuilder('g')
      .select('COALESCE(SUM(g.total), 0)', 'total')
      .addSelect('COALESCE(SUM(g.monto), 0)', 'monto')
      .addSelect('COALESCE(SUM(g.itbis), 0)', 'itbis')
      .where('g.empresaId = :eid AND g.isActive = true AND g.periodo = :p', { eid: this.tenantService.getEmpresaId(), p: periodo })
      .getRawOne();

    return {
      periodo,
      totalGastos:  Number(totales?.total ?? 0),
      totalMonto:   Number(totales?.monto ?? 0),
      totalItbis:   Number(totales?.itbis ?? 0),
      porCategoria: rows.map(r => ({
        categoria: r.categoria,
        label:     CATEGORIA_LABELS[r.categoria as CategoriaGasto]?.label ?? r.categoria,
        emoji:     CATEGORIA_LABELS[r.categoria as CategoriaGasto]?.emoji ?? '📦',
        total:     Number(r.total),
        cantidad:  Number(r.cantidad),
      })),
    };
  }

  async getResumenAnual(anio: number) {
    const rows = await this.repo
      .createQueryBuilder('g')
      .select('g.periodo', 'periodo')
      .addSelect('COALESCE(SUM(g.total), 0)', 'total')
      .where('g.empresaId = :eid AND g.isActive = true AND EXTRACT(YEAR FROM g.fecha) = :y', { eid: this.tenantService.getEmpresaId(), y: anio })
      .groupBy('g.periodo')
      .orderBy('g.periodo', 'ASC')
      .getRawMany();

    return rows.map(r => ({ periodo: r.periodo, total: Number(r.total) }));
  }

  getCategorias() {
    return Object.entries(CATEGORIA_LABELS).map(([key, val]) => ({
      value:     key,
      label:     `${val.emoji} ${val.label}`,
      cuenta:    val.cuenta,
      generaE43: val.generaE43 ?? false,
    }));
  }
}
