import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GimnasioCronService {
  private readonly logger = new Logger(GimnasioCronService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Cron('0 7 * * *', { name: 'gimnasio-alerta-vencimientos' })
  async alertarVencimientos() {
    this.logger.log('Verificando membresías próximas a vencer...');
    try {
      const [{ count }] = await this.ds.query<any[]>(
        `SELECT COUNT(*) FROM gm_membresias WHERE estado='activa' AND "fechaFin"::date = (NOW() + INTERVAL '7 days')::date`,
      );
      this.logger.log(`Membresías a vencer en 7 días: ${count}`);
    } catch (err) {
      this.logger.error('Error en alerta de vencimientos', err);
      throw err;
    }
  }

  @Cron('0 0 * * *', { name: 'gimnasio-marcar-vencidas' })
  async marcarVencidas() {
    try {
      const result = await this.ds.query<any[]>(
        `UPDATE gm_membresias SET estado='vencida' WHERE estado='activa' AND "fechaFin" < CURRENT_DATE RETURNING id`,
      );
      if (result.length > 0) {
        this.logger.log(`${result.length} membresías marcadas como vencidas`);
        await this.ds.query(`
          UPDATE gm_miembros SET estado='vencido', "updatedAt"=NOW()
          WHERE id IN (
            SELECT DISTINCT "miembroId" FROM gm_membresias WHERE estado='vencida'
            AND "miembroId" NOT IN (SELECT "miembroId" FROM gm_membresias WHERE estado='activa')
          )
        `);
      }
    } catch (err) {
      this.logger.error('Error marcando membresías vencidas', err);
      throw err;
    }
  }
}
