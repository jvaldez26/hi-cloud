import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TerminalDatafono } from './entities/terminal-datafono.entity';
import { TransaccionTarjeta, EstadoTransaccion } from './entities/transaccion-tarjeta.entity';
import { ConciliacionDatafono, EstadoConciliacion } from './entities/conciliacion-datafono.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateTerminalDto {
  numeroTerminal: string; banco: string; tipoTarjeta?: string;
  sucursal?: string; comisionPct?: number;
}

interface CreateTransaccionDto {
  terminalId: number; fecha: string; referencia: string;
  tipo?: string; monto: number; tarjetaUltimos4?: string; notas?: string;
}

interface CreateConciliacionDto {
  terminalId: number; fechaDesde: string; fechaHasta: string; notas?: string;
}

@Injectable()
export class DatafonoService {
  constructor(
    @InjectRepository(TerminalDatafono)    private terminalRepo:     Repository<TerminalDatafono>,
    @InjectRepository(TransaccionTarjeta)  private transaccionRepo:  Repository<TransaccionTarjeta>,
    @InjectRepository(ConciliacionDatafono) private conciliacionRepo: Repository<ConciliacionDatafono>,
    private tenantService: TenantService,
  ) {}

  // ─── Terminales ─────────────────────────────────────────────────────────────

  listarTerminales() {
    return this.terminalRepo.find({ where: { activo: true }, order: { banco: 'ASC' } });
  }

  crearTerminal(dto: CreateTerminalDto) {
    return this.terminalRepo.save(this.terminalRepo.create(dto));
  }

  async actualizarTerminal(id: number, dto: Partial<CreateTerminalDto>) {
    await this.terminalRepo.update(id, dto);
    return this.terminalRepo.findOneByOrFail({ id });
  }

  async eliminarTerminal(id: number) {
    await this.terminalRepo.update(id, { activo: false });
  }

  // ─── Transacciones ───────────────────────────────────────────────────────────

  listarTransacciones(terminalId?: number, desde?: string, hasta?: string) {
    const where: any = {};
    if (terminalId) where.terminalId = terminalId;
    if (desde && hasta) where.fecha = Between(desde, hasta);
    return this.transaccionRepo.find({ where, order: { fecha: 'DESC', createdAt: 'DESC' } });
  }

  async crearTransaccion(dto: CreateTransaccionDto) {
    const terminal = await this.terminalRepo.findOneBy({ id: dto.terminalId });
    if (!terminal) throw new NotFoundException('Terminal no encontrada');

    const monto    = Number(dto.monto);
    const comision = +(monto * Number(terminal.comisionPct) / 100).toFixed(2);
    const neto     = +(monto - comision).toFixed(2);

    return this.transaccionRepo.save(
      this.transaccionRepo.create({ ...dto, comision, neto }),
    );
  }

  // ─── Conciliaciones ──────────────────────────────────────────────────────────

  listarConciliaciones() {
    return this.conciliacionRepo.find({ order: { fechaDesde: 'DESC' } });
  }

  async crearConciliacion(dto: CreateConciliacionDto) {
    const transacciones = await this.transaccionRepo.find({
      where: {
        terminalId: dto.terminalId,
        fecha:      Between(dto.fechaDesde, dto.fechaHasta) as any,
        estado:     EstadoTransaccion.PENDIENTE,
      },
    });

    const totalBruto      = transacciones.reduce((s, t) => s + Number(t.monto),    0);
    const totalComisiones = transacciones.reduce((s, t) => s + Number(t.comision), 0);
    const totalNeto       = transacciones.reduce((s, t) => s + Number(t.neto),     0);

    const conc = await this.conciliacionRepo.save(
      this.conciliacionRepo.create({
        ...dto,
        totalBruto:            +totalBruto.toFixed(2),
        totalComisiones:       +totalComisiones.toFixed(2),
        totalNeto:             +totalNeto.toFixed(2),
        cantidadTransacciones: transacciones.length,
      }),
    );

    if (transacciones.length > 0) {
      await this.transaccionRepo
        .createQueryBuilder()
        .update()
        .set({ estado: EstadoTransaccion.CONCILIADO, conciliacionId: conc.id })
        .whereInIds(transacciones.map(t => t.id))
        .execute();
    }

    return conc;
  }

  async confirmarConciliacion(id: number) {
    await this.conciliacionRepo.update(id, { estado: EstadoConciliacion.CONFIRMADA });
    return this.conciliacionRepo.findOneByOrFail({ id });
  }

  async resumen() {
    const terminales = await this.terminalRepo.count({ where: { activo: true } });
    const pendientes = await this.transaccionRepo.count({ where: { estado: EstadoTransaccion.PENDIENTE } });

    const hoy    = new Date().toISOString().split('T')[0];
    const result = await this.transaccionRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.monto), 0)', 'total')
      .where('t.fecha = :hoy', { hoy })
      .andWhere("t.tipo = 'venta'")
      .getRawOne<{ total: string }>();

    return { terminales, pendientes, ventasHoy: +(result?.total ?? 0) };
  }
}
