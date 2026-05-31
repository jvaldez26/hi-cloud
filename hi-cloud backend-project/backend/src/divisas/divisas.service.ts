import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TasaCambio } from './entities/tasa-cambio.entity';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

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
  private readonly logger = new Logger(DivisasService.name);

  constructor(
    @InjectRepository(TasaCambio) private tasaRepo: Repository<TasaCambio>,
    private tenantSvc: TenantService,
    private readonly dataSource: DataSource,
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
    const hoy = fechaHoyRD();

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
    const fecha     = dto.fecha ?? fechaHoyRD();
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

  // ─── Tasa pública (no requiere tenant context) ────────────────────────────────

  /** Retorna la tasa USD más reciente guardada como global (empresaId IS NULL) */
  async getTasaPublica(moneda = 'USD') {
    const [row] = await this.dataSource.query<any[]>(
      `SELECT * FROM tasas_cambio WHERE moneda = $1 AND "empresaId" IS NULL AND "isActive" = true ORDER BY fecha DESC, "createdAt" DESC LIMIT 1`,
      [moneda.toUpperCase()],
    );
    return row ?? null;
  }

  /** Guarda tasa global (sin empresaId) — usada por el cron BCRD */
  private async guardarTasaGlobal(moneda: string, tasaVenta: number, tasaCompra: number, fuente: string) {
    const fecha = fechaHoyRD();
    // Evitar duplicados en el mismo día
    const [existe] = await this.dataSource.query<any[]>(
      `SELECT id FROM tasas_cambio WHERE moneda = $1 AND "empresaId" IS NULL AND fecha = $2 LIMIT 1`,
      [moneda, fecha],
    );
    if (existe) {
      await this.dataSource.query(
        `UPDATE tasas_cambio SET "tasaVenta"=$1,"tasaCompra"=$2,fuente=$3,"updatedAt"=NOW() WHERE id=$4`,
        [tasaVenta, tasaCompra, fuente, existe.id],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO tasas_cambio (moneda,"nombreMoneda","tasaVenta","tasaCompra",fecha,fuente,"isActive","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),NOW())`,
        [moneda, MONEDAS_DEFECTO[moneda] ?? moneda, tasaVenta, tasaCompra, fecha, fuente],
      );
    }
    this.logger.log(`[BCRD] Tasa ${moneda} guardada: compra=${tasaCompra}, venta=${tasaVenta}`);
  }

  // ─── Cron diario 8:00 AM hora RD (UTC-4 → 12:00 UTC) ────────────────────────
  // Si BCRD API no responde → mantiene última tasa sin error
  @Cron('0 12 * * 1-5', { timeZone: 'America/Santo_Domingo' })
  async cronTasaBCRD() {
    this.logger.log('[BCRD] Consultando tasa de cambio...');
    try {
      // API Banco Central RD (datos abiertos)
      const url = process.env.BCRD_API_URL ?? 'https://apis.clave.do/v1/tasas';
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        this.logger.warn(`[BCRD] API respondió ${res.status} — manteniendo tasa anterior`);
        return;
      }
      const json = await res.json() as any;

      // Intentar parsear formato de clave.do que provee tasas BCRD
      // { USD: { compra: 59.xx, venta: 60.xx } }
      const usd = json?.USD ?? json?.data?.USD;
      if (usd?.compra && usd?.venta) {
        await this.guardarTasaGlobal('USD', Number(usd.venta), Number(usd.compra), 'BCRD-Auto');
      } else {
        this.logger.warn('[BCRD] Formato de respuesta inesperado — manteniendo tasa anterior');
      }
    } catch (err: any) {
      this.logger.warn(`[BCRD] Error consultando API (${err?.message}) — manteniendo tasa anterior`);
    }
  }

  /** Ejecutar manualmente (útil para backfill) */
  async ejecutarCronManual() {
    await this.cronTasaBCRD();
    return { ok: true, fecha: fechaHoyRD() };
  }
}
