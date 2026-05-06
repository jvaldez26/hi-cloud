import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { TipoECF } from '../entities/tipo-ecf.entity';
import {
  EcfSecuenciaSinConfigError,
  EcfSecuenciaAgotadaError,
  EcfSecuenciaVencidaError,
} from '../errors/ecf.errors';

/**
 * Genera el siguiente número de eNCF de forma atómica.
 *
 * Usa `SELECT ... FOR UPDATE` (pessimistic write lock) para garantizar que
 * en entornos con concurrencia alta (p.ej. POS con múltiples cajas)
 * nunca se genere el mismo número dos veces.
 *
 * Formato del eNCF:  {prefijo}{número padded 10 dígitos}
 * Ejemplo tipo 32, secuencia 1:  "E320000000001"  (13 caracteres)
 */
@Injectable()
export class ENCFGeneratorService {
  private readonly logger = new Logger(ENCFGeneratorService.name);

  constructor(
    @InjectRepository(SecuenciaECF)
    private readonly secuenciaRepo: Repository<SecuenciaECF>,

    @InjectRepository(TipoECF)
    private readonly tipoRepo: Repository<TipoECF>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * Reserva y devuelve el siguiente eNCF disponible para la empresa y tipo.
   *
   * @param empresaId  ID de la empresa (tenant)
   * @param tipoEcf    Número del tipo (31, 32, 33…)
   * @returns          eNCF formateado, ej. "E320000000001"
   *
   * @throws EcfSecuenciaSinConfigError  No hay secuencia activa configurada
   * @throws EcfSecuenciaVencidaError    La secuencia expiró
   * @throws EcfSecuenciaAgotadaError    El rango está completamente usado
   */
  async generateNext(empresaId: number, tipoEcf: number): Promise<string> {
    // Buscar el tipo para obtener su ID y prefijo
    const tipo = await this.tipoRepo.findOne({
      where: { codigo: `E${String(tipoEcf).padStart(2, '0')}` },
    });
    const tipoECFId = tipo?.id;
    const prefijo   = tipo?.prefijo ?? `E${String(tipoEcf).padStart(2, '0')}`;

    if (!tipoECFId) {
      throw new EcfSecuenciaSinConfigError(empresaId, tipoEcf);
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // ── Bloqueo pesimista: solo un proceso a la vez puede leer y
      //    modificar la secuencia activa de este tipo y empresa ──────
      const sec = await manager
        .createQueryBuilder(SecuenciaECF, 'sec')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('sec.tipoECF', 'tipo')
        .where('sec.empresaId = :empresaId', { empresaId })
        .andWhere('sec.tipoECFId = :tipoECFId', { tipoECFId })
        .andWhere('sec.isActiva = true')
        .andWhere('sec.isAgotada = false')
        .andWhere('sec.isActive = true')
        .getOne();

      if (!sec) {
        throw new EcfSecuenciaSinConfigError(empresaId, tipoEcf);
      }

      // ── Validar fecha de vencimiento ─────────────────────────────
      const hoy   = new Date();
      const vence = new Date(sec.fechaVencimiento);
      if (vence < hoy) {
        await manager.update(SecuenciaECF, sec.id, {
          isActiva: false,
          isAgotada: true,
        });
        throw new EcfSecuenciaVencidaError(vence);
      }

      // ── Validar que quedan números disponibles ───────────────────
      if (sec.secuenciaActual > sec.secuenciaFinal) {
        await manager.update(SecuenciaECF, sec.id, {
          isAgotada: true,
          isActiva:  false,
        });
        throw new EcfSecuenciaAgotadaError(sec.secuenciaFinal);
      }

      // ── Reservar el número actual e incrementar el contador ──────
      const numeroReservado = sec.secuenciaActual;
      const siguiente       = numeroReservado + 1;
      const seAgota         = siguiente > sec.secuenciaFinal;

      await manager.update(SecuenciaECF, sec.id, {
        secuenciaActual: siguiente,
        ...(seAgota ? { isAgotada: true, isActiva: false } : {}),
      });

      if (seAgota) {
        this.logger.warn(
          `Secuencia tipo E${tipoEcf} empresa #${empresaId} AGOTADA ` +
          `(último número: ${numeroReservado})`,
        );
      }

      // ── Formatear eNCF: prefijo + número con 10 dígitos ─────────
      const encf = `${prefijo}${String(numeroReservado).padStart(10, '0')}`;

      this.logger.log(
        `eNCF generado: ${encf} | empresa #${empresaId} | secuencia #${sec.id}`,
      );

      return encf;
    });
  }

  /** Consulta cuántos números quedan disponibles sin reservar ninguno. */
  async getDisponibles(empresaId: number, tipoEcf: number): Promise<{
    disponibles: number;
    pctUsado:    number;
    vence:       Date | null;
  }> {
    const tipo = await this.tipoRepo.findOne({
      where: { codigo: `E${String(tipoEcf).padStart(2, '0')}` },
    });
    if (!tipo) return { disponibles: 0, pctUsado: 100, vence: null };

    const sec = await this.secuenciaRepo.findOne({
      where: { empresaId, tipoECFId: tipo.id, isActiva: true, isAgotada: false },
    });
    if (!sec) return { disponibles: 0, pctUsado: 100, vence: null };

    const total      = sec.secuenciaFinal - sec.secuenciaInicial + 1;
    const usados     = sec.secuenciaActual - sec.secuenciaInicial;
    const disponibles = sec.secuenciaFinal - sec.secuenciaActual + 1;

    return {
      disponibles: Math.max(0, disponibles),
      pctUsado:    Math.round((usados / total) * 100),
      vence:       new Date(sec.fechaVencimiento),
    };
  }
}
