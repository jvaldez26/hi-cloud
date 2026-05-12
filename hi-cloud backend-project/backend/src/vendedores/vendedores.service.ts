import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Vendedor } from './entities/vendedor.entity';
import { AsignacionClienteVendedor } from './entities/asignacion-cliente.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateVendedorDto {
  nombre:        string;
  cedula?:       string;
  email?:        string;
  telefono?:     string;
  zona?:         string;
  cargo?:        string;
  comisionPct?:  number;
  metaMensual?:  number;
  usuarioId?:    number;
  fechaIngreso?: string;
  notas?:        string;
}

@Injectable()
export class VendedoresService {
  constructor(
    @InjectRepository(Vendedor)                  private vendedorRepo:    Repository<Vendedor>,
    @InjectRepository(AsignacionClienteVendedor) private asignRepo:       Repository<AsignacionClienteVendedor>,
    @InjectRepository(Cliente)                   private clienteRepo:     Repository<Cliente>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
  ) {}

  // ─── Folio ────────────────────────────────────────────────────────────────────

  private async generarCodigo(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const total     = await this.vendedorRepo.count({ where: { empresaId } });
    return `VEN-${String(total + 1).padStart(3, '0')}`;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async crear(dto: CreateVendedorDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const codigo    = await this.generarCodigo();

    const v = this.vendedorRepo.create({ ...dto, empresaId, codigo });
    return this.vendedorRepo.save(v);
  }

  listar() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.vendedorRepo.find({
      where: { empresaId, isActive: true },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const v = await this.vendedorRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!v) throw new NotFoundException(`Vendedor #${id} no encontrado`);
    return v;
  }

  async actualizar(id: number, dto: Partial<CreateVendedorDto>) {
    await this.findOne(id);
    await this.vendedorRepo.update(id, dto as any);
    return this.findOne(id);
  }

  async eliminar(id: number) {
    await this.findOne(id);
    await this.vendedorRepo.update(id, { activo: false, isActive: false });
    return { ok: true };
  }

  // ─── Rendimiento de un vendedor ───────────────────────────────────────────────

  async getRendimiento(id: number, mes: number, anio: number) {
    const vendedor = await this.findOne(id);
    if (!vendedor.usuarioId) {
      return { vendedor, totalVentas: 0, cantidadFacturas: 0, comisionGenerada: 0, pctLogrado: 0 };
    }

    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    const raw = await this.dataSource.query<{
      totalVentas: string; cantidadFacturas: string;
    }[]>(`
      SELECT
        COALESCE(SUM(f.total), 0)::text      AS "totalVentas",
        COUNT(f.id)::text                     AS "cantidadFacturas"
      FROM facturas f
      WHERE f."usuarioId" = $1
        AND f.estado IN ('emitida','pagada')
        AND TO_CHAR(f.fecha, 'YYYY-MM') = $2
        AND f."isActive" = true
    `, [vendedor.usuarioId, periodo]);

    const totalVentas       = +(raw[0]?.totalVentas      ?? 0);
    const cantidadFacturas  = +(raw[0]?.cantidadFacturas ?? 0);
    const comisionGenerada  = +(totalVentas * Number(vendedor.comisionPct) / 100).toFixed(2);
    const pctLogrado        = vendedor.metaMensual > 0
      ? +((totalVentas / Number(vendedor.metaMensual)) * 100).toFixed(1)
      : 0;

    return { vendedor, mes, anio, totalVentas, cantidadFacturas, comisionGenerada, pctLogrado };
  }

  // ─── Ranking del mes ─────────────────────────────────────────────────────────

  async getRanking(mes: number, anio: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const vendedores = await this.vendedorRepo.find({
      where: { empresaId, activo: true, isActive: true },
    });

    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const userIds = vendedores.filter(v => v.usuarioId).map(v => v.usuarioId!);

    if (userIds.length === 0) return vendedores.map(v => ({ ...v, totalVentas: 0, comision: 0 }));

    const ventas = await this.dataSource.query<{
      usuarioId: number; totalVentas: string; cantidadFacturas: string;
    }[]>(`
      SELECT
        f."usuarioId",
        COALESCE(SUM(f.total), 0)::text AS "totalVentas",
        COUNT(f.id)::text               AS "cantidadFacturas"
      FROM facturas f
      WHERE f."usuarioId" = ANY($1)
        AND f.estado IN ('emitida','pagada')
        AND TO_CHAR(f.fecha, 'YYYY-MM') = $2
        AND f."isActive" = true
      GROUP BY f."usuarioId"
    `, [userIds, periodo]);

    const ventasMap = new Map(ventas.map(r => [r.usuarioId, r]));

    const ranking = vendedores.map(v => {
      const rv         = v.usuarioId ? ventasMap.get(v.usuarioId) : undefined;
      const totalVentas = +(rv?.totalVentas ?? 0);
      const pctLogrado  = v.metaMensual > 0 ? +((totalVentas / Number(v.metaMensual)) * 100).toFixed(1) : 0;
      return {
        ...v,
        totalVentas,
        cantidadFacturas: +(rv?.cantidadFacturas ?? 0),
        comisionGenerada:  +(totalVentas * Number(v.comisionPct) / 100).toFixed(2),
        pctLogrado,
      };
    });

    return ranking.sort((a, b) => b.totalVentas - a.totalVentas);
  }

  // ─── Historial de ventas (últimos 12 meses) ───────────────────────────────────

  async getHistorial(id: number) {
    const vendedor = await this.findOne(id);
    if (!vendedor.usuarioId) return [];

    const rows = await this.dataSource.query<{
      periodo: string; totalVentas: string; cantidadFacturas: string;
    }[]>(`
      SELECT
        TO_CHAR(f.fecha, 'YYYY-MM') AS periodo,
        COALESCE(SUM(f.total), 0)::text AS "totalVentas",
        COUNT(f.id)::text               AS "cantidadFacturas"
      FROM facturas f
      WHERE f."usuarioId" = $1
        AND f.estado IN ('emitida','pagada')
        AND f."isActive" = true
        AND f.fecha >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(f.fecha, 'YYYY-MM')
      ORDER BY periodo ASC
    `, [vendedor.usuarioId]);

    return rows.map(r => ({
      periodo:          r.periodo,
      totalVentas:      +r.totalVentas,
      cantidadFacturas: +r.cantidadFacturas,
      comision:         +(+r.totalVentas * Number(vendedor.comisionPct) / 100).toFixed(2),
    }));
  }

  // ─── Clientes asignados ───────────────────────────────────────────────────────

  async getClientes(vendedorId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.findOne(vendedorId);

    const asignaciones = await this.asignRepo.find({
      where: { empresaId, vendedorId, isActive: true },
    });
    if (asignaciones.length === 0) return [];

    const clienteIds = asignaciones.map(a => a.clienteId);
    return this.clienteRepo.find({ where: { id: In(clienteIds), isActive: true } });
  }

  async asignarCliente(vendedorId: number, clienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.findOne(vendedorId);

    const existe = await this.asignRepo.findOne({
      where: { empresaId, vendedorId, clienteId, isActive: true },
    });
    if (existe) throw new ConflictException('El cliente ya está asignado a este vendedor');

    return this.asignRepo.save(
      this.asignRepo.create({
        empresaId,
        vendedorId,
        clienteId,
        fechaAsignacion: new Date(),
      }),
    );
  }

  async desasignarCliente(vendedorId: number, clienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const asign = await this.asignRepo.findOne({
      where: { empresaId, vendedorId, clienteId, isActive: true },
    });
    if (!asign) throw new NotFoundException('Asignación no encontrada');
    await this.asignRepo.update(asign.id, { isActive: false });
    return { ok: true };
  }

  // ─── Resumen global ───────────────────────────────────────────────────────────

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy       = new Date();
    const periodo   = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    const vendedores = await this.vendedorRepo.count({ where: { empresaId, activo: true, isActive: true } });
    const userIds    = (await this.vendedorRepo.find({ where: { empresaId, activo: true } }))
      .filter(v => v.usuarioId).map(v => v.usuarioId!);

    let totalVentasMes = 0;
    if (userIds.length > 0) {
      const r = await this.dataSource.query<{ total: string }[]>(`
        SELECT COALESCE(SUM(f.total), 0)::text AS total
        FROM facturas f
        WHERE f."usuarioId" = ANY($1)
          AND f.estado IN ('emitida','pagada')
          AND TO_CHAR(f.fecha, 'YYYY-MM') = $2
          AND f."isActive" = true
      `, [userIds, periodo]);
      totalVentasMes = +(r[0]?.total ?? 0);
    }

    return { vendedores, totalVentasMes };
  }
}
