import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LimitesService } from '../suscripciones/limites.service';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    private dataSource:       DataSource,
    private tenantService:    TenantService,
    private realtimeService:  RealtimeService,
    private limitesService:   LimitesService,
  ) {}

  async create(dto: CreateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteClientes(empresaId);

    if (dto.rfc) {
      const existing = await this.clienteRepository.findOne({
        where: { rfc: dto.rfc, empresaId, isActive: true },
      });
      if (existing) throw new ConflictException(`RFC ${dto.rfc} ya está registrado en esta empresa`);
    }

    const cliente = this.clienteRepository.create({ ...dto, empresaId });
    const saved   = await this.clienteRepository.save(cliente);
    this.realtimeService.notify(empresaId, 'cliente', 'created', saved.id);
    return saved;
  }

  async findAll(pagination: PaginationDto) {
    const empresaId        = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.clienteRepository
      .createQueryBuilder('cliente')
      .where('cliente.empresaId = :empresaId', { empresaId })
      .andWhere('cliente.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(cliente.nombre ILIKE :s OR cliente.rfc ILIKE :s OR cliente.razonSocial ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('cliente.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente = await this.clienteRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente #${id} no encontrado`);
    return cliente;
  }

  async findByRfc(rfc: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente = await this.clienteRepository.findOne({
      where: { rfc, empresaId, isActive: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente con RFC ${rfc} no encontrado`);
    return cliente;
  }

  async update(id: number, dto: UpdateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);

    if (dto.rfc && dto.rfc !== cliente.rfc) {
      const rfcExists = await this.clienteRepository.findOne({
        where: { rfc: dto.rfc, empresaId, isActive: true },
      });
      if (rfcExists) throw new ConflictException(`RFC ${dto.rfc} ya está registrado`);
    }

    await this.clienteRepository.update(id, dto);
    this.realtimeService.notify(empresaId, 'cliente', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);
    await this.clienteRepository.update(id, { isActive: false });
    this.realtimeService.notify(empresaId, 'cliente', 'deleted', id);
    return { message: `Cliente "${cliente.nombre}" eliminado` };
  }

  async getEstadoCuenta(id: number, fechaDesde?: string, fechaHasta?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);

    const whereDesde = fechaDesde ? `AND f.fecha >= '${fechaDesde}'` : '';
    const whereHasta = fechaHasta ? `AND f.fecha <= '${fechaHasta}'` : '';

    const facturas = await this.dataSource.query<{
      folio: string; fecha: string; estado: string;
      total: string; montoPagado: string; montoPendiente: string;
    }[]>(
      `SELECT f.folio, f.fecha::text, f.estado,
              f.total::text,
              COALESCE(cxc."montoPagado", 0)::text    AS "montoPagado",
              COALESCE(cxc."montoPendiente", f.total)::text AS "montoPendiente"
       FROM facturas f
       LEFT JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = f.id
       WHERE f."clienteId" = $1 AND f."empresaId" = $2 AND f."isActive" = true
         AND f.estado NOT IN ('borrador','cancelada') ${whereDesde} ${whereHasta}
       ORDER BY f.fecha DESC`,
      [id, empresaId],
    );

    const cobros = await this.dataSource.query<{
      fecha: string; monto: string; metodoPago: string; referencia: string;
    }[]>(
      `SELECT p.fecha::text, p.monto::text, p."metodoPago", COALESCE(p.referencia,'') AS referencia
       FROM pagos_cobrados p
       JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
       WHERE cxc."clienteId" = $1 AND cxc."empresaId" = $2 AND p."isActive" = true
       ORDER BY p.fecha DESC`,
      [id, empresaId],
    );

    const totalFacturado = facturas.reduce((s, f) => s + Number(f.total), 0);
    const totalCobrado   = cobros.reduce((s, c) => s + Number(c.monto), 0);
    const saldoPendiente = facturas.reduce((s, f) => s + Number(f.montoPendiente), 0);

    return {
      cliente: { id: cliente.id, nombre: cliente.nombre, rfc: cliente.rfc },
      periodo: { desde: fechaDesde ?? 'inicio', hasta: fechaHasta ?? 'hoy' },
      facturas: facturas.map(f => ({
        folio: f.folio, fecha: f.fecha, estado: f.estado,
        total: Number(f.total), montoPagado: Number(f.montoPagado),
        montoPendiente: Number(f.montoPendiente),
      })),
      cobros: cobros.map(c => ({
        fecha: c.fecha, monto: Number(c.monto),
        metodoPago: c.metodoPago, referencia: c.referencia,
      })),
      resumen: { totalFacturado, totalCobrado, saldoPendiente, cantidadFacturas: facturas.length },
    };
  }
}
