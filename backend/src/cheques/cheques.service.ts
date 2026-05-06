import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Chequera, EstadoChequera } from './entities/chequera.entity';
import { Cheque, EstadoCheque, TipoCheque } from './entities/cheque.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateChequeraDto {
  banco: string; numeroCuenta: string; nombreCuenta?: string;
  serieDesde: number; serieHasta: number; descripcion?: string;
}

interface CreateChequeDto {
  chequeraId: number; numero?: string; tipo?: TipoCheque;
  fecha: string; beneficiario: string; monto: number;
  concepto?: string; facturaId?: number; compraId?: number; referencia?: string;
}

@Injectable()
export class ChequesService {
  constructor(
    @InjectRepository(Chequera) private chequeraRepo: Repository<Chequera>,
    @InjectRepository(Cheque)   private chequeRepo:   Repository<Cheque>,
    private tenantService: TenantService,
  ) {}

  // ── Chequeras ─────────────────────────────────────────────────────────────

  async crearChequera(dto: CreateChequeraDto): Promise<Chequera> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.chequeraRepo.save(this.chequeraRepo.create({
      empresaId,
      ...dto,
      siguienteNumero: dto.serieDesde,
    }));
  }

  async listarChequeras(): Promise<Chequera[]> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.chequeraRepo.find({ where: { empresaId, isActive: true }, order: { banco: 'ASC' } });
  }

  async getChequera(id: number): Promise<Chequera> {
    const c = await this.chequeraRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!c) throw new NotFoundException(`Chequera #${id} no encontrada`);
    return c;
  }

  // ── Cheques ───────────────────────────────────────────────────────────────

  async emitirCheque(dto: CreateChequeDto): Promise<Cheque> {
    const chequera = await this.getChequera(dto.chequeraId);

    if (chequera.estado !== EstadoChequera.ACTIVA)
      throw new BadRequestException('La chequera no está activa');

    // Auto-asignar número si no se provee
    let numero = dto.numero;
    if (!numero) {
      if (chequera.siguienteNumero > chequera.serieHasta)
        throw new BadRequestException('La chequera está agotada');
      numero = String(chequera.siguienteNumero).padStart(6, '0');
      await this.chequeraRepo.update(chequera.id, {
        siguienteNumero: chequera.siguienteNumero + 1,
        estado: chequera.siguienteNumero + 1 > chequera.serieHasta
          ? EstadoChequera.AGOTADA : EstadoChequera.ACTIVA,
      });
    }

    const fecha      = new Date(dto.fecha);
    const hoy        = new Date();
    hoy.setHours(0, 0, 0, 0);
    const esFuturo   = fecha > hoy;

    return this.chequeRepo.save(this.chequeRepo.create({
      chequeraId:   dto.chequeraId,
      numero,
      tipo:         dto.tipo ?? TipoCheque.EMITIDO,
      estado:       esFuturo ? EstadoCheque.POSFECHADO : EstadoCheque.EN_CARTERA,
      fecha,
      beneficiario: dto.beneficiario,
      monto:        dto.monto,
      concepto:     dto.concepto,
      facturaId:    dto.facturaId,
      compraId:     dto.compraId,
      referencia:   dto.referencia,
    }));
  }

  async listarCheques(pagination: PaginationDto, estado?: EstadoCheque, tipo?: TipoCheque, chequeraId?: number) {
    const { limit = 15, page = 1 } = pagination;
    const qb = this.chequeRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.chequera', 'ch')
      .where('c.isActive = true');

    if (estado)     qb.andWhere('c.estado = :e',      { e: estado });
    if (tipo)       qb.andWhere('c.tipo = :t',         { t: tipo });
    if (chequeraId) qb.andWhere('c.chequeraId = :cid', { cid: chequeraId });

    const [data, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async cambiarEstado(id: number, estado: EstadoCheque, fechaCobro?: string) {
    const cheque = await this.chequeRepo.findOne({ where: { id } });
    if (!cheque) throw new NotFoundException(`Cheque #${id} no encontrado`);

    const update: Partial<Cheque> = { estado };
    if (estado === EstadoCheque.COBRADO && fechaCobro) {
      update.fechaCobro = new Date(fechaCobro);
    }
    await this.chequeRepo.update(id, update as any);
    return this.chequeRepo.findOne({ where: { id }, relations: ['chequera'] });
  }

  async eliminar(id: number) {
    await this.chequeRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const [enCartera, entregados, cobrados, anulados, posfechados] = await Promise.all([
      this.chequeRepo.count({ where: { isActive: true, estado: EstadoCheque.EN_CARTERA } }),
      this.chequeRepo.count({ where: { isActive: true, estado: EstadoCheque.ENTREGADO } }),
      this.chequeRepo.count({ where: { isActive: true, estado: EstadoCheque.COBRADO } }),
      this.chequeRepo.count({ where: { isActive: true, estado: EstadoCheque.ANULADO } }),
      this.chequeRepo.count({ where: { isActive: true, estado: EstadoCheque.POSFECHADO } }),
    ]);

    // Valor total en cartera (emitidos no cobrados)
    const enCarteraMonto = await this.chequeRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.monto), 0)', 'total')
      .where("c.estado IN ('en_cartera','entregado','posfechado')")
      .andWhere('c.isActive = true')
      .getRawOne();

    // Cheques posfechados que vencen esta semana
    const enUnaSemana = new Date();
    enUnaSemana.setDate(enUnaSemana.getDate() + 7);
    const vencenProximo = await this.chequeRepo
      .createQueryBuilder('c')
      .where('c.estado = :e', { e: EstadoCheque.POSFECHADO })
      .andWhere('c.fecha <= :proxima', { proxima: enUnaSemana })
      .andWhere('c.isActive = true')
      .getMany();

    return {
      enCartera, entregados, cobrados, anulados, posfechados,
      montoEnCartera: Number(enCarteraMonto?.total ?? 0),
      vencenProximo,
    };
  }

  // ── Resumen por banco/período ─────────────────────────────────────────────

  async getResumenPeriodo(mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta  = new Date(anio, mes, 0, 23, 59, 59);

    return this.chequeRepo
      .createQueryBuilder('c')
      .select([
        'c.tipo AS tipo',
        'c.estado AS estado',
        'COUNT(*) AS cantidad',
        'SUM(c.monto) AS monto',
      ])
      .where('c.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('c.isActive = true')
      .groupBy('c.tipo, c.estado')
      .getRawMany();
  }
}
