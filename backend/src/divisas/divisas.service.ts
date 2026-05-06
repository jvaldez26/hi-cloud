import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TasaCambio } from './entities/tasa-cambio.entity';
import { TenantService } from '../tenant/tenant.service';

const MONEDAS_DEFECTO: Record<string, string> = {
  USD: 'Dólar Estadounidense',
  EUR: 'Euro',
  GBP: 'Libra Esterlina',
  CAD: 'Dólar Canadiense',
  JPY: 'Yen Japonés',
  CNY: 'Yuan Chino',
};

@Injectable()
export class DivisasService {
  constructor(
    @InjectRepository(TasaCambio) private tasaRepo: Repository<TasaCambio>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Tasas ────────────────────────────────────────────────────────────────────

  async getTasaActual(moneda: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const tasa = await this.tasaRepo.findOne({
      where: { empresaId, moneda: moneda.toUpperCase(), isActive: true },
      order: { fecha: 'DESC', createdAt: 'DESC' },
    });
    return tasa;
  }

  async getTasasHoy() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = new Date().toISOString().split('T')[0];

    // Para cada moneda, obtener la más reciente
    const monedas = ['USD', 'EUR', 'GBP', 'CAD'];
    const tasas   = await Promise.all(
      monedas.map(m =>
        this.tasaRepo.findOne({
          where:  { empresaId, moneda: m, isActive: true },
          order:  { fecha: 'DESC', createdAt: 'DESC' },
        }),
      ),
    );

    return tasas
      .filter(Boolean)
      .map(t => ({
        ...t,
        nombreMoneda: t!.nombreMoneda ?? MONEDAS_DEFECTO[t!.moneda] ?? t!.moneda,
      }));
  }

  async getHistorial(moneda: string, limite = 30) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.tasaRepo.find({
      where: { empresaId, moneda: moneda.toUpperCase(), isActive: true },
      order: { fecha: 'DESC' },
      take:  limite,
    });
  }

  async registrarTasa(dto: {
    moneda: string; tasaVenta: number; tasaCompra: number;
    fecha?: string; fuente?: string;
  }) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const fecha     = dto.fecha ?? new Date().toISOString().split('T')[0];
    const moneda    = dto.moneda.toUpperCase();

    return this.tasaRepo.save(
      this.tasaRepo.create({
        empresaId,
        moneda,
        nombreMoneda:  MONEDAS_DEFECTO[moneda] ?? moneda,
        tasaVenta:     dto.tasaVenta,
        tasaCompra:    dto.tasaCompra,
        fecha,
        fuente:        dto.fuente ?? 'Manual',
      }),
    );
  }

  // ─── Conversión ──────────────────────────────────────────────────────────────

  async convertir(monto: number, monedaOrigen: string, tipo: 'venta' | 'compra' = 'venta') {
    if (monedaOrigen.toUpperCase() === 'DOP') return { monto, moneda: 'DOP', tasa: 1 };

    const tasa = await this.getTasaActual(monedaOrigen);
    if (!tasa) throw new NotFoundException(`Sin tasa de cambio para ${monedaOrigen}`);

    const tasaUsada = tipo === 'venta' ? Number(tasa.tasaVenta) : Number(tasa.tasaCompra);
    return {
      montoOriginal: monto,
      monedaOrigen:  monedaOrigen.toUpperCase(),
      montoDOP:      +(monto * tasaUsada).toFixed(2),
      moneda:        'DOP',
      tasa:          tasaUsada,
      fecha:         tasa.fecha,
    };
  }

  getMonedas() {
    return Object.entries(MONEDAS_DEFECTO).map(([codigo, nombre]) => ({ codigo, nombre }));
  }
}
