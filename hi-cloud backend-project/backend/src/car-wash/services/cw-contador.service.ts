import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CwContadorService {
  constructor(private readonly ds: DataSource) {}

  /**
   * Incremento atómico en UNA sentencia (INSERT ... ON CONFLICT ... DO UPDATE
   * ... RETURNING): dos recepciones concurrentes en la misma empresa+sucursal
   * +día reciben números distintos y consecutivos sin necesidad de un lock
   * explícito — Postgres serializa el UPSERT por fila.
   *
   * Verificado contra Postgres real (no es el mismo caso que UPDATE...RETURNING
   * vía queryRunner.query(), que sí devuelve [rows, rowCount]): un INSERT...
   * RETURNING vía DataSource.query() devuelve `rows` directo.
   */
  async siguienteNumero(empresaId: number, sucursalId: number, fechaRD: string): Promise<number> {
    const rows: { ultimo: number }[] = await this.ds.query(
      `INSERT INTO cw_contador_turno ("empresaId", "sucursalId", "fechaRD", ultimo)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT ("empresaId", "sucursalId", "fechaRD")
       DO UPDATE SET ultimo = cw_contador_turno.ultimo + 1
       RETURNING ultimo`,
      [empresaId, sucursalId, fechaRD],
    );
    return rows[0].ultimo;
  }
}
