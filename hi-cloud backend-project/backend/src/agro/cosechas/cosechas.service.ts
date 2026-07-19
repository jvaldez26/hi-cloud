import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CiclosService } from '../ciclos/ciclos.service';

@Injectable()
export class CosechasService {
  private readonly logger = new Logger(CosechasService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ciclosSvc: CiclosService,
  ) {}

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`c."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.cicloId) { conds.push(`c."cicloId"=$${idx++}`); args.push(Number(params.cicloId)); }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(`SELECT COUNT(*) FROM ag_cosechas c WHERE ${where}`, args);
    const data = await this.ds.query(
      `SELECT c.*, ci.numero AS "cicloNumero", p.nombre AS "parcelaNombre",
              cu.nombre AS "cultivoNombre"
         FROM ag_cosechas c
         LEFT JOIN ag_ciclos ci ON ci.id=c."cicloId"
         LEFT JOIN ag_parcelas p ON p.id=c."parcelaId"
         LEFT JOIN ag_cultivos cu ON cu.id=ci."cultivoId"
        WHERE ${where} ORDER BY c.fecha DESC, c.id DESC
        LIMIT $${idx} OFFSET $${idx+1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT c.*, ci.numero AS "cicloNumero" FROM ag_cosechas c
         LEFT JOIN ag_ciclos ci ON ci.id=c."cicloId"
        WHERE c.id=$1 AND c."empresaId"=$2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Cosecha #${id} no encontrada`);
    return row;
  }

  async create(empresaId: number, data: any) {
    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'COS'],
    );
    const numero = `COS-${String(seq.num).padStart(4, '0')}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ag_cosechas ("empresaId",numero,"cicloId","parcelaId",fecha,cantidad,unidad,
         calidad,clasificacion,destino,"cantidadTrabajadores","costoManoObra","productoId",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [empresaId, numero, data.cicloId, data.parcelaId ?? null, data.fecha,
       data.cantidad, data.unidad ?? null, data.calidad ?? null,
       data.clasificacion ? JSON.stringify(data.clasificacion) : null,
       data.destino ?? null, data.cantidadTrabajadores ?? null, data.costoManoObra ?? 0,
       data.productoId ?? null, data.notas ?? null],
    );
    await this.ciclosSvc.recalcularCostos(data.cicloId, empresaId);
    return row;
  }

  async ingresarInventario(empresaId: number, id: number) {
    // A1: todo dentro de UNA transacción, con marcado de flag ATÓMICO y condicionado.
    // El flag se gana PRIMERO (false→true una sola vez); solo el ganador suma stock.
    // Así, doble-click / reintento concurrente no puede sumar dos veces.
    return this.ds.transaction(async (manager) => {
      // Bloquea la fila de la cosecha para serializar llamadas concurrentes.
      const [cosecha] = await manager.query<any[]>(
        `SELECT * FROM ag_cosechas WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`,
        [id, empresaId],
      );
      if (!cosecha) throw new NotFoundException(`Cosecha #${id} no encontrada`);
      if (!cosecha.productoId) {
        throw new BadRequestException('La cosecha no tiene producto vinculado para inventario');
      }

      // Ganar el flag de forma atómica: solo pasa de false→true una vez.
      const marcada = await manager.query<any[]>(
        `UPDATE ag_cosechas SET "ingresadoInventario"=true
          WHERE id=$1 AND "empresaId"=$2 AND "ingresadoInventario"=false
        RETURNING *`,
        [id, empresaId],
      );
      if (!marcada.length) {
        // Otra llamada ya la ingresó (o doble-click): NO sumar stock.
        throw new ConflictException('Esta cosecha ya fue ingresada a inventario');
      }

      // Solo el ganador suma stock, y solo si el producto es de la MISMA empresa.
      // Si el producto no pertenece a la empresa → RETURNING vacío → excepción →
      // rollback de toda la transacción (el flag NO queda marcado).
      const prod = await manager.query<any[]>(
        `UPDATE productos SET stock = stock + $1 WHERE id=$2 AND "empresaId"=$3 RETURNING id`,
        [cosecha.cantidad, cosecha.productoId, empresaId],
      );
      if (!prod.length) {
        throw new BadRequestException('El producto vinculado no pertenece a la empresa');
      }

      this.logger.log(`Cosecha ${id} ingresada a inventario: ${cosecha.cantidad} ${cosecha.unidad}`);
      return marcada[0];
    });
  }
}
