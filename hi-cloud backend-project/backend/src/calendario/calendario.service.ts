import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { NominaPeriodo } from '../nomina/entities/nomina-periodo.entity';
import { TenantService } from '../tenant/tenant.service';

export interface EventoCalendario {
  id:          string;
  titulo:      string;
  fecha:       Date;
  tipo:        'cxc' | 'cxp' | 'dgii' | 'tss' | 'nomina' | 'contrato' | 'alerta';
  monto?:      number;
  estado:      'pendiente' | 'vencido' | 'proximo' | 'completado';
  referencia?: string;
  color:       string;
  prioridad:   'alta' | 'media' | 'baja';
}

// Fechas fijas de obligaciones DGII cada mes (República Dominicana)
const FECHAS_DGII = [
  { dia: 10, titulo: 'IT-1 ITBIS mensual',        tipo: 'dgii', prioridad: 'alta' },
  { dia: 10, titulo: 'IR-17 Retenciones',          tipo: 'dgii', prioridad: 'alta' },
  { dia: 15, titulo: 'TSS — Seguridad Social',     tipo: 'tss',  prioridad: 'alta' },
  { dia: 20, titulo: 'Formato 606 compras',        tipo: 'dgii', prioridad: 'media' },
  { dia: 20, titulo: 'Formato 607 ventas',         tipo: 'dgii', prioridad: 'media' },
];

const COLORES: Record<string, string> = {
  cxc:      '#3b82f6',
  cxp:      '#8b5cf6',
  dgii:     '#ef4444',
  tss:      '#f59e0b',
  nomina:   '#10b981',
  contrato: '#06b6d4',
  alerta:   '#f97316',
};

@Injectable()
export class CalendarioService {
  constructor(
    @InjectRepository(CuentaPorCobrar)  private cxcRepo:       Repository<CuentaPorCobrar>,
    @InjectRepository(CuentaPorPagar)   private cxpRepo:       Repository<CuentaPorPagar>,
    @InjectRepository(Contrato)         private contratoRepo:  Repository<Contrato>,
    @InjectRepository(NominaPeriodo)    private nominaRepo:    Repository<NominaPeriodo>,
    private tenantService: TenantService,
  ) {}

  async getEventos(desde: Date, hasta: Date): Promise<EventoCalendario[]> {
    const hoy    = new Date();
    const eventos: EventoCalendario[] = [];

    // ── 1. CxC vencimientos ──────────────────────────────────────────────────
    const cxcPendientes = await this.cxcRepo.find({
      where: {
        isActive: true,
        estado:   In(['pendiente', 'pagada_parcial', 'vencida']),
        fechaVencimiento: Between(desde, hasta),
      },
      relations: ['cliente'],
    });

    for (const c of cxcPendientes) {
      const fv = new Date(c.fechaVencimiento);
      eventos.push({
        id:          `cxc-${c.id}`,
        titulo:      `CxC: ${(c as any).cliente?.nombre ?? 'Cliente'}`,
        fecha:       fv,
        tipo:        'cxc',
        monto:       Number(c.montoPendiente),
        estado:      fv < hoy ? 'vencido' : fv <= this.masNDias(hoy, 7) ? 'proximo' : 'pendiente',
        referencia:  `CxC #${c.id}`,
        color:       COLORES.cxc,
        prioridad:   fv < hoy ? 'alta' : 'media',
      });
    }

    // ── 2. CxP vencimientos ──────────────────────────────────────────────────
    const cxpPendientes = await this.cxpRepo.find({
      where: {
        isActive: true,
        estado:   In(['pendiente', 'pagada_parcial', 'vencida']),
        fechaVencimiento: Between(desde, hasta),
      },
      relations: ['proveedor'],
    });

    for (const p of cxpPendientes) {
      const fv = new Date(p.fechaVencimiento);
      eventos.push({
        id:          `cxp-${p.id}`,
        titulo:      `CxP: ${(p as any).proveedor?.nombre ?? 'Proveedor'}`,
        fecha:       fv,
        tipo:        'cxp',
        monto:       Number(p.montoPendiente),
        estado:      fv < hoy ? 'vencido' : fv <= this.masNDias(hoy, 7) ? 'proximo' : 'pendiente',
        referencia:  `CxP #${p.id}`,
        color:       COLORES.cxp,
        prioridad:   fv < hoy ? 'alta' : 'media',
      });
    }

    // ── 3. Contratos próxima factura ─────────────────────────────────────────
    const contratos = await this.contratoRepo.find({
      where: {
        isActive:        true,
        estado:          'activo' as any,
        proximaFactura:  Between(desde, hasta),
      },
      relations: ['cliente'],
    });

    for (const c of contratos) {
      const fp = new Date(c.proximaFactura!);
      eventos.push({
        id:         `ctr-${c.id}`,
        titulo:     `Facturar: ${c.nombre}`,
        fecha:      fp,
        tipo:       'contrato',
        monto:      Number(c.montoBase),
        estado:     fp < hoy ? 'vencido' : fp <= this.masNDias(hoy, 3) ? 'proximo' : 'pendiente',
        referencia: c.numero,
        color:      COLORES.contrato,
        prioridad:  'media',
      });
    }

    // ── 4. Obligaciones DGII y TSS por mes ──────────────────────────────────
    const fechasCursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
    while (fechasCursor <= hasta) {
      for (const ob of FECHAS_DGII) {
        const fd = new Date(fechasCursor.getFullYear(), fechasCursor.getMonth(), ob.dia);
        if (fd >= desde && fd <= hasta) {
          eventos.push({
            id:        `${ob.tipo}-${fd.getFullYear()}-${fd.getMonth()}-${ob.dia}`,
            titulo:    `${ob.titulo} — ${this.mesLabel(fd)}`,
            fecha:     fd,
            tipo:      ob.tipo as any,
            estado:    fd < hoy ? 'vencido' : fd <= this.masNDias(hoy, 5) ? 'proximo' : 'pendiente',
            color:     COLORES[ob.tipo],
            prioridad: ob.prioridad as any,
          });
        }
      }
      fechasCursor.setMonth(fechasCursor.getMonth() + 1);
    }

    // ── 5. Períodos de nómina ───────────────────────────────────────────────
    const periodos = await this.nominaRepo.find({
      where: {
        isActive:  true,
        fechaPago: Between(desde, hasta),
      },
    });

    for (const p of periodos) {
      const fp = new Date(p.fechaPago);
      eventos.push({
        id:         `nom-${p.id}`,
        titulo:     `Pago nómina — ${(p as any).nombre ?? `Período #${p.id}`}`,
        fecha:      fp,
        tipo:       'nomina',
        monto:      Number((p as any).totalNeto ?? 0),
        estado:     fp < hoy ? 'completado' : fp <= this.masNDias(hoy, 3) ? 'proximo' : 'pendiente',
        referencia: `NOM #${p.id}`,
        color:      COLORES.nomina,
        prioridad:  'alta',
      });
    }

    // Ordenar por fecha ascendente
    return eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }

  // ── Resumen de alertas del mes actual ───────────────────────────────────────

  async getAlertas() {
    const hoy   = new Date();
    const fin30 = this.masNDias(hoy, 30);

    const eventos = await this.getEventos(
      new Date(hoy.getFullYear(), hoy.getMonth(), 1),
      fin30,
    );

    const vencidos  = eventos.filter(e => e.estado === 'vencido');
    const proximos  = eventos.filter(e => e.estado === 'proximo');
    const pendientes= eventos.filter(e => e.estado === 'pendiente');

    const montoVencidoCxC = vencidos
      .filter(e => e.tipo === 'cxc')
      .reduce((s, e) => s + (e.monto ?? 0), 0);

    const montoVencidoCxP = vencidos
      .filter(e => e.tipo === 'cxp')
      .reduce((s, e) => s + (e.monto ?? 0), 0);

    return {
      resumen: {
        vencidos:   vencidos.length,
        proximos:   proximos.length,
        pendientes: pendientes.length,
        montoVencidoCxC,
        montoVencidoCxP,
      },
      eventosVencidos: vencidos.slice(0, 10),
      eventosProximos: proximos.slice(0, 10),
    };
  }

  private masNDias(fecha: Date, n: number): Date {
    const d = new Date(fecha);
    d.setDate(d.getDate() + n);
    return d;
  }

  private mesLabel(fecha: Date): string {
    return fecha.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  }
}
