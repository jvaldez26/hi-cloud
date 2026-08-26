import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { reportServiceError } from '../common/observability/sentry';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { PreFactura, EstadoPreFactura } from './entities/pre-factura.entity';
import { PreFacturaDetalle } from './entities/pre-factura-detalle.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FacturasService } from '../facturas/facturas.service';
import { VendedorResolverService } from '../facturas/vendedor/vendedor-resolver.service';

interface DetalleDto {
  productoId?: number;
  descripcion:   string;
  unidadMedida?: string;
  cantidad:      number;
  precioUnitario: number;
  porcentajeIva?: number;
}

interface CreatePreFacturaDto {
  clienteId:          number;
  fecha:              string;
  fechaVencimiento?:  string;
  tipoNcf?:           string;
  notas?:             string;
  sucursalId?:        number;
  detalles:           DetalleDto[];
}

@Injectable()
export class PreFacturaService {
  private readonly logger = new Logger(PreFacturaService.name);

  constructor(
    @InjectRepository(PreFactura)       private pfRepo:       Repository<PreFactura>,
    @InjectRepository(PreFacturaDetalle) private pfDetRepo:    Repository<PreFacturaDetalle>,
    @InjectRepository(Factura)          private facturaRepo:  Repository<Factura>,
    private tenantSvc: TenantService,
    @InjectDataSource() private ds: DataSource,
    private facturasService: FacturasService,
    private vendedorResolver: VendedorResolverService,
  ) {}

  // ─── Folio ────────────────────────────────────────────────────────────────────

  private async generarFolio(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'pre_facturas', 'folio', '^PRE-[0-9]+$', 'PRE-', 1, empresaId,
    );
  }

  // ─── Calcular totales ─────────────────────────────────────────────────────────

  private calcularDetalles(detalles: DetalleDto[]) {
    return detalles.map(d => {
      const pctIva   = d.porcentajeIva ?? 18;
      const subtotal = +(d.cantidad * d.precioUnitario).toFixed(2);
      const iva      = +(subtotal * pctIva / 100).toFixed(2);
      return {
        ...d,
        unidadMedida: d.unidadMedida ?? 'PZA',
        porcentajeIva: pctIva,
        subtotal,
        iva,
        total: +(subtotal + iva).toFixed(2),
      };
    });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async crear(dto: CreatePreFacturaDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const folio     = await this.generarFolio();
    const detalles  = this.calcularDetalles(dto.detalles);

    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detalles.reduce((s, d) => s + d.iva,      0);

    // Guardar cabecera SIN cascade (cascade falla silenciosamente con @TenantScoped)
    const saved = await this.pfRepo.save(this.pfRepo.create({
      empresaId,
      folio,
      fecha:            dto.fecha as unknown as Date,
      fechaVencimiento: dto.fechaVencimiento as unknown as Date | undefined,
      clienteId:        dto.clienteId,
      usuarioId,
      tipoNcf:          dto.tipoNcf ?? 'E32',
      notas:            dto.notas,
      sucursalId:       dto.sucursalId,
      subtotal:         +subtotal.toFixed(2),
      iva:              +iva.toFixed(2),
      total:            +(subtotal + iva).toFixed(2),
    }));

    // Guardar detalles explícitamente con empresaId del tenant
    await this.pfDetRepo.save(
      this.pfDetRepo.create(
        detalles.map(d => ({ ...d, preFacturaId: saved.id, empresaId }))
      ),
    );

    return this.findOne(saved.id);
  }

  async listar(pagination: PaginationDto, estado?: EstadoPreFactura) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.pfRepo
      .createQueryBuilder('pf')
      .leftJoinAndSelect('pf.cliente', 'c')
      // detalles NO se cargan en el listado para evitar paginación incorrecta
      // con getManyAndCount() + leftJoin one-to-many. El visor y la edición
      // usan GET /pre-facturas/:id (findOne) que sí carga detalles.
      .where('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = :a',  { a: true });

    if (estado) qb.andWhere('pf.estado = :e', { e: estado });
    if (search) qb.andWhere('(pf.folio ILIKE :s OR c.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('pf.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // 1. Cargar pre-factura con cliente (leftJoin no aplica TenantScoped a join)
    const pf = await this.pfRepo
      .createQueryBuilder('pf')
      .leftJoinAndSelect('pf.cliente', 'cliente')
      .where('pf.id = :id',           { id })
      .andWhere('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = :a',    { a: true })
      .getOne();
    if (!pf) throw new NotFoundException(`Pre-Factura #${id} no encontrada`);

    // 2. Cargar detalles con query SQL directa para evitar filtro @TenantScoped
    const detalles = await this.ds.query<PreFacturaDetalle[]>(
      `SELECT * FROM pre_factura_detalles WHERE "preFacturaId" = $1 ORDER BY id ASC`,
      [id],
    );
    (pf as any).detalles = detalles;

    // 3. Cargar nombre de sucursal (no hay @ManyToOne en la entidad)
    if ((pf as any).sucursalId) {
      const [suc] = await this.ds.query<{ nombre: string }[]>(
        `SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1`,
        [(pf as any).sucursalId],
      ).catch(() => []);
      if (suc) (pf as any).sucursal = { nombre: suc.nombre };
    }

    return pf;
  }

  async actualizar(id: number, dto: Partial<CreatePreFacturaDto>) {
    const pf = await this.findOne(id);
    if (pf.estado !== EstadoPreFactura.BORRADOR) {
      throw new BadRequestException('Solo se puede editar pre-facturas en borrador');
    }

    if (dto.detalles) {
      const empresaId = this.tenantSvc.getEmpresaId();
      // Eliminar detalles viejos y guardar los nuevos explícitamente
      await this.pfDetRepo.delete({ preFacturaId: id });
      const detalles = this.calcularDetalles(dto.detalles);
      const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
      const iva      = detalles.reduce((s, d) => s + d.iva, 0);
      // Actualizar cabecera sin detalles en cascade
      await this.pfRepo.update(id, {
        clienteId:        (dto as any).clienteId,
        tipoNcf:          (dto as any).tipoNcf,
        fecha:            (dto as any).fecha,
        fechaVencimiento: (dto as any).fechaVencimiento,
        notas:            (dto as any).notas,
        vendedorId:       (dto as any).vendedorId,
        subtotal: +subtotal.toFixed(2),
        iva:      +iva.toFixed(2),
        total:    +(subtotal + iva).toFixed(2),
      } as any);
      // Guardar detalles explícitamente con empresaId
      await this.pfDetRepo.save(
        this.pfDetRepo.create(
          detalles.map(d => ({ ...d, preFacturaId: id, empresaId }))
        ),
      );
    } else {
      await this.pfRepo.update(id, dto as any);
    }

    return this.findOne(id);
  }

  // ─── Ciclo de vida ────────────────────────────────────────────────────────────

  async enviar(id: number) {
    const pf = await this.findOne(id);
    if (pf.estado !== EstadoPreFactura.BORRADOR) {
      throw new BadRequestException('Solo se puede enviar pre-facturas en borrador');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.ENVIADA });
    return this.findOne(id);
  }

  async aprobar(id: number) {
    const pf = await this.findOne(id);
    if (![EstadoPreFactura.ENVIADA, EstadoPreFactura.BORRADOR].includes(pf.estado)) {
      throw new BadRequestException('Estado inválido para aprobar');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.APROBADA });
    return this.findOne(id);
  }

  async rechazar(id: number, motivo: string) {
    const pf = await this.findOne(id);
    if (pf.estado === EstadoPreFactura.CONVERTIDA) {
      throw new BadRequestException('No se puede rechazar una pre-factura ya convertida');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.RECHAZADA, motivoRechazo: motivo });
    return this.findOne(id);
  }

  // ─── Convertir a Factura ──────────────────────────────────────────────────────

  async convertirAFactura(id: number, usuarioId: number, tipoNcf?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.findOne(id);

    if (pf.estado !== EstadoPreFactura.APROBADA) {
      throw new BadRequestException('Solo se pueden convertir pre-facturas aprobadas');
    }

    // Generar folio de factura — mismo patrón que facturas.service.ts
    const fRes = await this.facturaRepo
      .createQueryBuilder('f')
      .select(`MAX(CASE WHEN f.folio ~ '^FAC-[0-9]+$' THEN CAST(SUBSTRING(f.folio FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('f.empresaId = :eid', { eid: empresaId })
      .andWhere('f.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    const folio = `FAC-${Math.max(101, (fRes?.maxNum ?? 100) + 1)}`;

    // Esta factura nace EMITIDA: no pasa por cambiarEstado(), que es donde se
    // resuelve el vendedor para los caminos que crean borradores. Aqui hay que
    // pedirlo explicitamente o entra al cuadre sin nadie a quien imputarsela.
    const { vendedorId, nombreVendedor } =
      await this.vendedorResolver.resolverVendedor({}, usuarioId, empresaId);

    const factura = this.facturaRepo.create({
      empresaId,
      folio,
      fecha:     new Date(),
      estado:    FacturaEstado.EMITIDA,
      vendedorId:     vendedorId     ?? undefined,
      nombreVendedor: nombreVendedor ?? undefined,
      clienteId: pf.clienteId,
      usuarioId,
      subtotal:  pf.subtotal,
      iva:       pf.iva,
      total:     pf.total,
      tipoNcf:   tipoNcf ?? pf.tipoNcf ?? 'E32',
      notas:     pf.notas,
      sucursalId: pf.sucursalId,
      detalles:  pf.detalles.map(det => ({
        productoId:     det.productoId,
        descripcion:    det.descripcion,
        cantidad:       Math.round(Number(det.cantidad)),   // INT en FacturaDetalle
        precioUnitario: Number(det.precioUnitario),
        porcentajeIva:  Number(det.porcentajeIva),
        subtotal:       Number(det.subtotal),
        importeIva:     Number(det.iva),
        total:          Number(det.total),
      })) as any,
    });

    const savedFactura = await this.facturaRepo.save(factura);

    await this.pfRepo.update(id, {
      estado:    EstadoPreFactura.CONVERTIDA,
      facturaId: savedFactura.id,
    });

    return {
      preFactura: await this.findOne(id),
      factura:    savedFactura,
      mensaje:    `Pre-factura ${pf.folio} convertida a factura ${savedFactura.folio}`,
    };
  }

  async eliminar(id: number) {
    const pf = await this.findOne(id);
    if (pf.estado === EstadoPreFactura.CONVERTIDA) {
      throw new BadRequestException('No se puede eliminar una pre-factura convertida');
    }
    await this.pfRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ─── Cobrar desde POS ─────────────────────────────────────────────────────────
  // Convierte la pre-factura a factura oficial con ECF + descuento de stock.
  // Acepta pre-facturas en cualquier estado activo (no CONVERTIDA/RECHAZADA).

  async cobrarDesdePos(id: number, usuarioId: number, dto: { metodoPago: string }) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.findOne(id);

    if ([EstadoPreFactura.CONVERTIDA, EstadoPreFactura.RECHAZADA].includes(pf.estado)) {
      throw new BadRequestException('Esta pre-factura no puede cobrarse en su estado actual');
    }

    // Derivar vendedorId del CLS (JWT) — nunca del body.
    // Buscamos el vendedor cuyo usuarioId coincide con el cajero autenticado.
    const clsUserId = this.tenantSvc.getUserId();
    let cajaVendedorId: number | undefined;
    if (clsUserId) {
      const [v] = await this.ds.query<{ id: number }[]>(
        `SELECT id FROM vendedores WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true AND activo = true LIMIT 1`,
        [clsUserId, empresaId],
      );
      cajaVendedorId = v?.id;
    }

    // Folio atómico vía función de secuencia (nunca MAX+1)
    const [row] = await this.ds.query<{ numero: number }[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
      [empresaId, 'FAC'],
    );
    const folio = `FAC-${row.numero}`;

    // Crear factura en BORRADOR + marcar preFactura CONVERTIDA (transacción atómica).
    const savedFactura = await this.ds.transaction(async (manager) => {
      const f = manager.create(Factura, {
        empresaId,
        folio,
        fecha:      new Date(),
        estado:     FacturaEstado.BORRADOR,
        clienteId:  pf.clienteId,
        usuarioId,
        vendedorId: cajaVendedorId,
        sucursalId: pf.sucursalId ?? undefined,
        subtotal:   Number(pf.subtotal),
        iva:        Number(pf.iva),
        total:      Number(pf.total),
        tipoNcf:    pf.tipoNcf ?? 'E32',
        notas:      dto.metodoPago,
        detalles:   (pf.detalles ?? []).map(det => ({
          productoId:     det.productoId,
          descripcion:    det.descripcion,
          cantidad:       Math.round(Number(det.cantidad)),
          precioUnitario: Number(det.precioUnitario),
          porcentajeIva:  Number(det.porcentajeIva),
          subtotal:       Number(det.subtotal),
          importeIva:     Number(det.iva),
          total:          Number(det.total),
        })) as any,
      });
      const saved = await manager.save(f);
      await manager.update(PreFactura, id, {
        estado:    EstadoPreFactura.CONVERTIDA,
        facturaId: saved.id,
      });
      return saved;
    });

    // Emitir: ECF + descuento de stock + asiento contable (BORRADOR → PAGADA para contado).
    // Si cambiarEstado lanza antes de actualizar el estado, propagar el error — no silenciar.
    // Si ECF falla en modoSincrono, cambiarEstado retorna { ecfEmitido: false, ecfError } sin
    // lanzar; forwarding eso al frontend para que muestre el aviso al cajero.
    let emitResult: any;
    try {
      emitResult = await this.facturasService.cambiarEstado(
        savedFactura.id,
        FacturaEstado.EMITIDA,
        true,
      );
    } catch (err: any) {
      reportServiceError(err, 'cobrar_pos_pf_emision', {
        facturaId: savedFactura.id,
        empresaId: this.tenantSvc.getEmpresaId(),
        folio,
      });
      throw err;
    }

    const ecfEmitido = emitResult?.ecfEmitido !== false;
    const ecfError   = ecfEmitido ? undefined : (emitResult?.ecfError as string | undefined);
    return { facturaId: savedFactura.id, folio, ecfEmitido, ecfError };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.pfRepo
      .createQueryBuilder('pf')
      .select('pf.estado', 'estado')
      .addSelect('COUNT(pf.id)', 'cantidad')
      .addSelect('COALESCE(SUM(pf.total), 0)', 'totalMonto')
      .where('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = :a', { a: true })
      .groupBy('pf.estado')
      .getRawMany<{ estado: string; cantidad: string; totalMonto: string }>();

    return raw.map(r => ({
      estado:      r.estado,
      cantidad:    Number(r.cantidad),
      totalMonto:  Number(r.totalMonto),
    }));
  }
}
