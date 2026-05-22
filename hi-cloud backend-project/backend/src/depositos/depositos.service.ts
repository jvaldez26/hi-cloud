import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DepositoBancario, TipoDeposito } from './entities/deposito-bancario.entity';
import { CuentaBancaria } from '../bancos/entities/cuenta-bancaria.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

interface CreateDepositoDto {
  cuentaId:          number;
  fecha:             string;
  tipo:              TipoDeposito;
  monto:             number;
  referencia?:       string;
  descripcion?:      string;
  clienteId?:        number;
  nombreDepositante?: string;
  cxcId?:            number;
  notas?:            string;
}

@Injectable()
export class DepositosService {
  constructor(
    @InjectRepository(DepositoBancario) private depoRepo:   Repository<DepositoBancario>,
    @InjectRepository(CuentaBancaria)   private cuentaRepo: Repository<CuentaBancaria>,
    @InjectDataSource()                 private ds:         DataSource,
    private tenantSvc: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'depositos_bancarios', 'numero', '^DEP-[0-9]+$', 'DEP-', 1, empresaId,
    );
  }

  async crear(dto: CreateDepositoDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

    const deposito = await this.depoRepo.save(
      this.depoRepo.create({ ...dto, empresaId, numero, usuarioId }),
    );

    // Actualizar saldo de la cuenta bancaria
    await this.cuentaRepo
      .createQueryBuilder()
      .update()
      .set({ saldoInicial: () => `"saldoInicial" + ${dto.monto}` })
      .where('id = :id AND empresaId = :eid', { id: dto.cuentaId, eid: empresaId })
      .execute();

    return deposito;
  }

  async listar(pagination: PaginationDto, cuentaId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;
    const where: any = { empresaId, isActive: true };
    if (cuentaId) where.cuentaId = cuentaId;

    const [data, total] = await this.depoRepo.findAndCount({
      where,
      order:  { fecha: 'DESC', createdAt: 'DESC' },
      skip:   (page - 1) * limit,
      take:   Math.min(limit, 100),
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d = await this.depoRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!d) throw new NotFoundException(`Depósito #${id} no encontrado`);
    return d;
  }

  async eliminar(id: number) {
    const dep     = await this.findOne(id);
    const empresaId = this.tenantSvc.getEmpresaId();

    // Revertir saldo
    await this.cuentaRepo
      .createQueryBuilder()
      .update()
      .set({ saldoInicial: () => `"saldoInicial" - ${dep.monto}` })
      .where('id = :id AND empresaId = :eid', { id: dep.cuentaId, eid: empresaId })
      .execute();

    await this.depoRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();

    const raw = await this.depoRepo
      .createQueryBuilder('d')
      .select('d.tipo', 'tipo')
      .addSelect('COUNT(d.id)', 'cantidad')
      .addSelect('COALESCE(SUM(d.monto), 0)', 'total')
      .where('d.empresaId = :eid', { eid: empresaId })
      .andWhere('d.isActive = :a', { a: true })
      .groupBy('d.tipo')
      .getRawMany<{ tipo: string; cantidad: string; total: string }>();

    const totalGeneral = raw.reduce((s, r) => s + Number(r.total), 0);

    return {
      porTipo:       raw.map(r => ({ tipo: r.tipo, cantidad: Number(r.cantidad), total: Number(r.total) })),
      totalGeneral:  +totalGeneral.toFixed(2),
      cantidadTotal: raw.reduce((s, r) => s + Number(r.cantidad), 0),
    };
  }
}
