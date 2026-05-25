import {
  Injectable, NotFoundException, BadRequestException, Logger,
  StreamableFile,
} from '@nestjs/common';
import type { DocData } from '../common/doc.template';
import { generarDocumentoPDF } from '../common/pdf/doc-pdf.helper';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, LessThan, In, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Cron } from '@nestjs/schedule';
import { Cotizacion, CotizacionEstado } from './entities/cotizacion.entity';
import { CotizacionDetalle } from './entities/cotizacion-detalle.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';

@Injectable()
export class CotizacionesService {
  private readonly logger = new Logger(CotizacionesService.name);

  constructor(
    @InjectRepository(Cotizacion)
    private cotizacionRepository: Repository<Cotizacion>,
    @InjectRepository(CotizacionDetalle)
    private detalleRepository:    Repository<CotizacionDetalle>,
    @InjectRepository(Factura)
    private facturaRepository:    Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private facturaDetalleRepository: Repository<FacturaDetalle>,
    private tenantService:    TenantService,
    private realtimeService:  RealtimeService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'cotizaciones', 'numero', '^COT-[0-9]+$', 'COT-', 1, empresaId,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────

  async create(dto: CreateCotizacionDto, usuario: User) {
    const validez = dto.validezDias ?? 30;
    const fechaVencimiento = new Date(dto.fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + validez);

    const detallesData: Partial<CotizacionDetalle>[] = [];
    let subtotal = 0, iva = 0;

    for (const item of dto.detalles) {
      const pIva   = item.porcentajeIva ?? 18;
      const sub    = Number(item.precioUnitario) * item.cantidad;
      const impIva = Number((sub * pIva / 100).toFixed(2));
      const total  = sub + impIva;
      subtotal += sub; iva += impIva;

      detallesData.push({
        productoId:     item.productoId,
        descripcion:    item.descripcion,
        precioUnitario: item.precioUnitario,
        cantidad:       item.cantidad,
        porcentajeIva:  pIva,
        subtotal:       sub,
        importeIva:     impIva,
        total,
      });
    }

    const numero = await this.generarNumero();
    const cot = await this.cotizacionRepository.save(
      this.cotizacionRepository.create({
        numero,
        fecha:            new Date(dto.fecha),
        fechaVencimiento,
        validezDias:      validez,
        empresaId:        this.tenantService.getEmpresaId(),
        clienteId:        dto.clienteId,
        userId:           usuario.id,
        notas:            dto.notas,
        condicionesPago:  dto.condicionesPago,
        vendedorId:       (dto as any).vendedorId,
        nombreVendedor:   (dto as any).nombreVendedor,
        subtotal:         Number(subtotal.toFixed(2)),
        iva:              Number(iva.toFixed(2)),
        total:            Number((subtotal + iva).toFixed(2)),
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, cotizacionId: cot.id }))),
    );

    const empresaId = this.tenantService.getEmpresaId();
    this.realtimeService.notify(empresaId, 'cotizacion', 'created', cot.id);
    return this.findById(cot.id);
  }

  async findAll(pagination: PaginationDto) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.cotizacionRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .where('c.empresaId = :eid', { eid: this.tenantService.getEmpresaId() })
      .andWhere('c.isActive = :a', { a: true });

    if (search) qb.andWhere(
      '(c.numero ILIKE :s OR cliente.nombre ILIKE :s)', { s: `%${search}%` },
    );

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'user', 'detalles', 'detalles.producto', 'factura'],
    });
    if (!c) throw new NotFoundException(`Cotización #${id} no encontrada`);
    return c;
  }

  async cambiarEstado(id: number, estado: CotizacionEstado) {
    const cot = await this.findById(id);
    const permitidos: Record<CotizacionEstado, CotizacionEstado[]> = {
      [CotizacionEstado.BORRADOR]:   [CotizacionEstado.ENVIADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ENVIADA]:    [CotizacionEstado.ACEPTADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ACEPTADA]:   [CotizacionEstado.CONVERTIDA],
      [CotizacionEstado.RECHAZADA]:  [],
      [CotizacionEstado.VENCIDA]:    [],
      [CotizacionEstado.CONVERTIDA]: [],
    };
    if (!permitidos[cot.estado].includes(estado)) {
      throw new BadRequestException(`No se puede pasar de "${cot.estado}" a "${estado}"`);
    }
    await this.cotizacionRepository.update(id, { estado });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Conversión a Factura — la función estrella
  // ──────────────────────────────────────────────────────────────────

  async convertirAFactura(id: number, usuario: User) {
    const cot = await this.findById(id);

    if (cot.estado !== CotizacionEstado.ACEPTADA) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones ACEPTADAS');
    }
    if (cot.facturaId) {
      throw new BadRequestException(`Esta cotización ya fue convertida a la factura #${cot.facturaId}`);
    }

    // Generar folio de factura
    const count  = await this.facturaRepository.count();
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const folio  = `FAC-${y}${m}-${String(count + 1).padStart(4, '0')}`;

    // Crear factura
    const factura = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId: this.tenantService.getEmpresaId(),
        folio,
        fecha:    now,
        estado:   FacturaEstado.BORRADOR,
        clienteId: cot.clienteId,
        usuarioId: usuario.id,
        notas:    cot.notas ?? `Convertida desde cotización ${cot.numero}`,
        subtotal: Number(cot.subtotal),
        iva:      Number(cot.iva),
        total:    Number(cot.total),
      }),
    );

    // Copiar detalles
    await this.facturaDetalleRepository.save(
      this.facturaDetalleRepository.create(
        cot.detalles.map(d => ({
          facturaId:      factura.id,
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          precioUnitario: Number(d.precioUnitario),
          cantidad:       d.cantidad,
          porcentajeIva:  Number(d.porcentajeIva),
          subtotal:       Number(d.subtotal),
          importeIva:     Number(d.importeIva),
          total:          Number(d.total),
        })),
      ),
    );

    // Marcar cotización como convertida
    await this.cotizacionRepository.update(id, {
      estado:    CotizacionEstado.CONVERTIDA,
      facturaId: factura.id,
    });

    this.logger.log(`Cotización ${cot.numero} convertida a factura ${folio}`);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'factura',    'created');
    return this.findById(id);
  }

  async remove(id: number) {
    const cot = await this.findById(id);
    if (cot.estado !== CotizacionEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar cotizaciones en BORRADOR');
    }
    await this.cotizacionRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'deleted', id);
    return { message: `Cotización ${cot.numero} eliminada` };
  }

  async getResumen() {
    const rows = await this.cotizacionRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('COALESCE(SUM(c.total), 0)', 'montoTotal')
      .where('c.empresaId = :eid AND c.isActive = true', { eid: this.tenantService.getEmpresaId() })
      .groupBy('c.estado')
      .getRawMany();

    return rows.map(r => ({
      estado:     r.estado,
      cantidad:   Number(r.cantidad),
      montoTotal: Number(r.montoTotal),
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // PDF
  // ──────────────────────────────────────────────────────────────────

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const cot = await this.findById(id);

    const empresa = await this.cotizacionRepository.manager
      .query('SELECT * FROM empresa WHERE id = $1 LIMIT 1', [cot.empresaId])
      .then((r: any[]) => r[0] || {});

    const campos: any[] = [];
    if (cot.fechaVencimiento) campos.push({ label: 'Válida hasta', valor: String(cot.fechaVencimiento) });
    if (cot.validezDias)      campos.push({ label: 'Validez (días)', valor: cot.validezDias });
    if (cot.condicionesPago)  campos.push({ label: 'Condiciones de Pago', valor: cot.condicionesPago });
    if (cot.nombreVendedor)   campos.push({ label: 'Vendedor', valor: cot.nombreVendedor });

    const data: DocData = {
      tipo:        'COTIZACIÓN',
      tipoSub:     'Propuesta comercial · No válida como comprobante fiscal',
      numero:      cot.numero,
      fecha:       String(cot.fecha),
      estado:      (cot as any).estado,
      estadoColor: (cot as any).estado === 'aprobada' ? 'green'
                 : (cot as any).estado === 'rechazada' ? 'red'
                 : (cot as any).estado === 'vencida'   ? 'red'
                 : 'orange',
      empresa: {
        nombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
        rnc:       empresa.rnc || '',
        direccion: empresa.direccion || '',
        ciudad:    empresa.ciudad,
        telefono:  empresa.telefono,
        email:     empresa.email,
      },
      participante: {
        label:  'Cliente',
        nombre: cot.cliente?.nombre || 'Sin cliente',
        rnc:    cot.cliente?.rncReceptor || cot.cliente?.rfc,
        dir:    cot.cliente?.direccion,
        tel:    cot.cliente?.telefono,
        email:  cot.cliente?.email,
      },
      campos,
      items: (cot.detalles || []).map((d: any) => ({
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        unidad:         (d as any).producto?.unidadMedida ?? 'UN',
        precioUnitario: Number(d.precioUnitario),
        importe:        Number(d.total ?? 0),
      })),
      totales: [
        { label: 'Subtotal',    valor: Number(cot.subtotal) },
        { label: 'ITBIS (18%)', valor: Number(cot.iva) },
        { label: 'Total',       valor: Number(cot.total), bold: true },
      ],
      notas: cot.notas ?? undefined,
      pie: 'Esta cotización es una propuesta comercial y no constituye un comprobante fiscal. Válida hasta la fecha indicada. HiCloud ERP · República Dominicana',
    };

    const buffer = await generarDocumentoPDF(data);
    return { buffer, filename: `${cot.numero}.pdf` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron: marcar cotizaciones vencidas diariamente
  // ──────────────────────────────────────────────────────────────────

  // ── Duplicar cotización ───────────────────────────────────────────────────────

  async duplicar(id: number, userId: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const original   = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!original) throw new NotFoundException(`Cotización #${id} no encontrada`);

    const numero = await this.generarNumero();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

    const nueva = await this.cotizacionRepository.save(
      this.cotizacionRepository.create({
        empresaId,
        numero,
        fecha:           new Date(),
        fechaVencimiento,
        estado:          CotizacionEstado.BORRADOR,
        clienteId:       original.clienteId,
        subtotal:        original.subtotal,
        iva:             original.iva,
        total:           original.total,
        notas:           original.notas,
        condicionesPago: original.condicionesPago,
        userId,
      } as any) as any,
    ) as unknown as Cotizacion;

    if (original.detalles?.length) {
      await this.detalleRepository.save(
        original.detalles.map(d => ({
          cotizacionId:  nueva.id,
          productoId:    d.productoId,
          descripcion:   d.descripcion,
          cantidad:      d.cantidad,
          precioUnitario:d.precioUnitario,
          porcentajeIva: d.porcentajeIva,
          importeIva:    d.importeIva,
          subtotal:      d.subtotal,
          total:         d.total,
        })) as any,
      );
    }

    this.realtimeService.notify(empresaId, 'cotizacion', 'created', nueva.id);

    return this.cotizacionRepository.findOne({
      where: { id: nueva.id },
      relations: ['cliente', 'detalles'],
    });
  }

  async actualizar(id: number, dto: Partial<CreateCotizacionDto>, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();
    const cot = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!cot) throw new NotFoundException(`Cotización #${id} no encontrada`);
    if (cot.estado !== CotizacionEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden editar cotizaciones en BORRADOR');
    }

    // Recalcular totales si vienen detalles nuevos
    if (dto.detalles?.length) {
      let subtotal = 0, iva = 0;
      const detallesNuevos: Partial<CotizacionDetalle>[] = dto.detalles.map(item => {
        const pIva   = item.porcentajeIva ?? 18;
        const sub    = Number(item.precioUnitario) * item.cantidad;
        const impIva = Number((sub * pIva / 100).toFixed(2));
        subtotal += sub; iva += impIva;
        return { productoId: item.productoId, descripcion: item.descripcion,
          precioUnitario: item.precioUnitario, cantidad: item.cantidad,
          porcentajeIva: pIva, subtotal: sub, importeIva: impIva, total: sub + impIva };
      });

      await this.detalleRepository.delete({ cotizacionId: id });
      await this.detalleRepository.save(
        detallesNuevos.map(d => ({ ...d, cotizacionId: id })) as any,
      );
      await this.cotizacionRepository.update(id, {
        clienteId:    dto.clienteId    ?? cot.clienteId,
        subtotal:     Number(subtotal.toFixed(2)),
        iva:          Number(iva.toFixed(2)),
        total:        Number((subtotal + iva).toFixed(2)),
        notas:        dto.notas        ?? cot.notas,
        condicionesPago: dto.condicionesPago ?? cot.condicionesPago,
        ...(dto.fecha ? { fecha: new Date(dto.fecha), fechaVencimiento: (() => {
          const d = new Date(dto.fecha); d.setDate(d.getDate() + (dto.validezDias ?? 30)); return d;
        })() } : {}),
      } as any);
    } else {
      await this.cotizacionRepository.update(id, {
        clienteId:    dto.clienteId    ?? cot.clienteId,
        notas:        dto.notas        ?? cot.notas,
        condicionesPago: dto.condicionesPago ?? cot.condicionesPago,
        ...(dto.fecha ? { fecha: new Date(dto.fecha) } : {}),
      } as any);
    }

    this.realtimeService.notify(empresaId, 'cotizacion', 'updated', id);
    return this.cotizacionRepository.findOne({ where: { id }, relations: ['cliente', 'detalles'] });
  }

  @Cron('5 0 * * *')
  async marcarVencidas() {
    const res = await this.cotizacionRepository.update(
      {
        estado: In([CotizacionEstado.BORRADOR, CotizacionEstado.ENVIADA]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: CotizacionEstado.VENCIDA },
    );
    if ((res.affected ?? 0) > 0) {
      this.logger.log(`Cotizaciones vencidas marcadas: ${res.affected}`);
    }
  }
}
