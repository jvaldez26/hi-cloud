import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgramaFidelidad } from './entities/programa-fidelidad.entity';
import { SaldoPuntos } from './entities/saldo-puntos.entity';
import { TransaccionPuntos, TipoTransaccionPuntos } from './entities/transaccion-puntos.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class FidelidadService {
  constructor(
    @InjectRepository(ProgramaFidelidad) private progRepo:    Repository<ProgramaFidelidad>,
    @InjectRepository(SaldoPuntos)       private saldoRepo:   Repository<SaldoPuntos>,
    @InjectRepository(TransaccionPuntos) private txRepo:      Repository<TransaccionPuntos>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Programa ─────────────────────────────────────────────────────────────────

  async getPrograma() {
    const empresaId = this.tenantSvc.getEmpresaId();
    let prog = await this.progRepo.findOne({ where: { empresaId, isActive: true } });
    if (!prog) {
      prog = await this.progRepo.save(this.progRepo.create({
        empresaId,
        nombre:            'Programa de Puntos',
        puntosPorDOP:      1,
        minimoCanjePoints: 100,
        valorPorPunto:     1,
        diasVencimiento:   365,
        activo:            true,
      }));
    }
    return prog;
  }

  async actualizarPrograma(dto: Partial<ProgramaFidelidad>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const prog = await this.getPrograma();
    await this.progRepo.update(prog.id, { ...dto, empresaId });
    return this.getPrograma();
  }

  // ─── Saldo de un cliente ──────────────────────────────────────────────────────

  async getSaldo(clienteId: number, clienteNombre?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    let saldo = await this.saldoRepo.findOne({ where: { empresaId, clienteId } });
    if (!saldo) {
      saldo = await this.saldoRepo.save(
        this.saldoRepo.create({ empresaId, clienteId, clienteNombre }),
      );
    }
    return saldo;
  }

  // ─── Acumular puntos (al pagar una factura) ───────────────────────────────────

  async acumular(clienteId: number, montoFactura: number, referenciaId: string, clienteNombre?: string) {
    const prog = await this.getPrograma();
    if (!prog.activo) return null;

    const puntos = +(montoFactura * Number(prog.puntosPorDOP)).toFixed(4);
    if (puntos <= 0) return null;

    const saldo      = await this.getSaldo(clienteId, clienteNombre);
    const saldoAnt   = Number(saldo.puntosDisponibles);
    const nuevoSaldo = +(saldoAnt + puntos).toFixed(4);

    const vencimiento = prog.diasVencimiento > 0
      ? new Date(Date.now() + prog.diasVencimiento * 86400000).toISOString().split('T')[0]
      : undefined;

    await this.saldoRepo.update(saldo.id, {
      puntosTotales:      +((Number(saldo.puntosTotales) + puntos)).toFixed(4),
      puntosDisponibles:  nuevoSaldo,
      fechaUltimaActividad: new Date().toISOString().split('T')[0],
      fechaVencimiento:   vencimiento,
      totalTransacciones: saldo.totalTransacciones + 1,
    });

    return this.txRepo.save(this.txRepo.create({
      empresaId:        prog.empresaId,
      clienteId,
      tipo:             TipoTransaccionPuntos.ACUMULACION,
      puntos,
      montoReferencia:  montoFactura,
      referenciaId,
      saldoAnterior:    saldoAnt,
      saldoNuevo:       nuevoSaldo,
      descripcion:      `Factura ${referenciaId} — RD$ ${montoFactura.toLocaleString('es-DO')}`,
    }));
  }

  // ─── Canjear puntos (obtener descuento) ───────────────────────────────────────

  async canjear(clienteId: number, puntosACanjear: number, referenciaId?: string) {
    const prog  = await this.getPrograma();
    const saldo = await this.getSaldo(clienteId);
    const disponibles = Number(saldo.puntosDisponibles);
    const empresaId   = this.tenantSvc.getEmpresaId();

    if (!prog.activo) throw new BadRequestException('El programa de fidelidad no está activo');
    if (puntosACanjear < prog.minimoCanjePoints) {
      throw new BadRequestException(`Mínimo de canje: ${prog.minimoCanjePoints} puntos`);
    }
    if (puntosACanjear > disponibles) {
      throw new BadRequestException(`Puntos insuficientes. Disponible: ${disponibles}`);
    }

    const descuentoRD = +(puntosACanjear * Number(prog.valorPorPunto)).toFixed(2);
    const nuevoSaldo  = +(disponibles - puntosACanjear).toFixed(4);

    await this.saldoRepo.update(saldo.id, {
      puntosCanjeados:   +((Number(saldo.puntosCanjeados) + puntosACanjear)).toFixed(4),
      puntosDisponibles: nuevoSaldo,
    });

    await this.txRepo.save(this.txRepo.create({
      empresaId,
      clienteId,
      tipo:           TipoTransaccionPuntos.CANJE,
      puntos:         -puntosACanjear,
      referenciaId,
      saldoAnterior:  disponibles,
      saldoNuevo:     nuevoSaldo,
      descripcion:    `Canje de ${puntosACanjear} puntos = RD$ ${descuentoRD}`,
    }));

    return { puntosCanjeados: puntosACanjear, descuentoRD, saldoRestante: nuevoSaldo };
  }

  // ─── Historial de un cliente ──────────────────────────────────────────────────

  async historial(clienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [saldo, txs] = await Promise.all([
      this.getSaldo(clienteId),
      this.txRepo.find({
        where: { empresaId, clienteId, isActive: true },
        order: { createdAt: 'DESC' },
        take:  50,
      }),
    ]);
    return { saldo, transacciones: txs };
  }

  // ─── Ranking de clientes por puntos ──────────────────────────────────────────

  async ranking(limit = 20) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.saldoRepo.find({
      where: { empresaId, isActive: true },
      order: { puntosDisponibles: 'DESC' },
      take:  limit,
    });
  }

  // ─── Resumen global ───────────────────────────────────────────────────────────

  async resumen() {
    const empresaId   = this.tenantSvc.getEmpresaId();
    const prog        = await this.getPrograma();
    const clientesConPuntos = await this.saldoRepo.count({ where: { empresaId, isActive: true } });
    const raw = await this.saldoRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s."puntosTotales"), 0)',    'totalAcumulados')
      .addSelect('COALESCE(SUM(s."puntosCanjeados"), 0)', 'totalCanjeados')
      .addSelect('COALESCE(SUM(s."puntosDisponibles"), 0)', 'totalDisponibles')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = :a', { a: true })
      .getRawOne<{ totalAcumulados: string; totalCanjeados: string; totalDisponibles: string }>();

    return {
      programa: prog,
      clientesConPuntos,
      totalAcumulados:  +Number(raw?.totalAcumulados  ?? 0).toFixed(2),
      totalCanjeados:   +Number(raw?.totalCanjeados   ?? 0).toFixed(2),
      totalDisponibles: +Number(raw?.totalDisponibles ?? 0).toFixed(2),
    };
  }
}
