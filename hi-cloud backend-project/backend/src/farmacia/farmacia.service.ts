import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

@Injectable()
export class FarmaciaService {
  private readonly logger = new Logger(FarmaciaService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  // ── HELPERS ────────────────────────────────────────────────────────────────

  private async medOr404(empresaId: number, id: number) {
    const [m] = await this.ds.query<any[]>(
      `SELECT * FROM fa_medicamentos WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!m) throw new NotFoundException(`Medicamento #${id} no encontrado`);
    return m;
  }

  private async dispensacionOr404(empresaId: number, id: number) {
    const [d] = await this.ds.query<any[]>(
      `SELECT * FROM fa_dispensaciones WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!d) throw new NotFoundException(`Dispensación #${id} no encontrada`);
    return d;
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────

  async dashboard() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [stats] = await this.ds.query<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM fa_dispensaciones WHERE "empresaId" = $1 AND DATE(fecha) = CURRENT_DATE)::int AS "dispensacionesHoy",
        (SELECT COUNT(*) FROM fa_medicamentos WHERE "empresaId" = $1 AND "isActive" = true AND "stockActual" <= "stockMinimo" AND "stockActual" > 0)::int AS "stockBajo",
        (SELECT COUNT(*) FROM fa_medicamentos WHERE "empresaId" = $1 AND "isActive" = true AND "stockActual" = 0)::int AS "stockAgotado",
        (SELECT COUNT(*) FROM fa_lotes WHERE "empresaId" = $1 AND estado = 'activo' AND "fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS "vencen30d",
        (SELECT COUNT(*) FROM fa_reclamaciones_ars WHERE "empresaId" = $1 AND estado IN ('pendiente','enviada'))::int AS "arsPendientes",
        (SELECT COALESCE(SUM(total),0) FROM fa_dispensaciones WHERE "empresaId" = $1 AND DATE(fecha) = CURRENT_DATE)::numeric AS "ventasHoy",
        (SELECT COALESCE(SUM(total),0) FROM fa_dispensaciones WHERE "empresaId" = $1 AND DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE))::numeric AS "ventasMes"
    `, [empresaId]);

    const ultimasDispensaciones = await this.ds.query<any[]>(`
      SELECT id, numero, fecha, "clienteNombre", total, estado, "metodoPago"
      FROM fa_dispensaciones WHERE "empresaId" = $1
      ORDER BY fecha DESC LIMIT 10
    `, [empresaId]);

    const lotesProximosVencer = await this.ds.query<any[]>(`
      SELECT l.*, m."nombreGenerico", m."nombreComercial", m.concentracion,
             (l."fechaVencimiento"::date - CURRENT_DATE)::int AS "diasRestantes"
      FROM fa_lotes l
      JOIN fa_medicamentos m ON m.id = l."medicamentoId"
      WHERE l."empresaId" = $1 AND l.estado = 'activo' AND l."cantidadActual" > 0
        AND l."fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
      ORDER BY l."fechaVencimiento" ASC LIMIT 15
    `, [empresaId]);

    const masVendidos = await this.ds.query<any[]>(`
      SELECT m."nombreGenerico", m."nombreComercial", SUM(i.cantidad)::numeric AS "cantidadVendida",
             SUM(i.total)::numeric AS "totalVendido"
      FROM fa_dispensacion_items i
      JOIN fa_medicamentos m ON m.id = i."medicamentoId"
      JOIN fa_dispensaciones d ON d.id = i."dispensacionId"
      WHERE i."empresaId" = $1 AND DATE(d.fecha) = CURRENT_DATE
      GROUP BY m.id, m."nombreGenerico", m."nombreComercial"
      ORDER BY "cantidadVendida" DESC LIMIT 10
    `, [empresaId]);

    return { ...stats, ultimasDispensaciones, lotesProximosVencer, masVendidos };
  }

  // ── MEDICAMENTOS ───────────────────────────────────────────────────────────

  async listarMedicamentos(page = 1, limit = 20, search?: string, categoria?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1 AND "isActive" = true`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND ("nombreGenerico" ILIKE $${params.length} OR "nombreComercial" ILIKE $${params.length} OR codigo ILIKE $${params.length} OR "codigoBarra" ILIKE $${params.length})`;
    }
    if (categoria) {
      params.push(categoria);
      where += ` AND categoria = $${params.length}`;
    }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_medicamentos ${where}`, params,
    );
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(
      `SELECT * FROM fa_medicamentos ${where} ORDER BY "nombreGenerico" ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data, total, page, limit };
  }

  async buscarPorCodigoBarra(codigoBarra: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [m] = await this.ds.query<any[]>(
      `SELECT m.*, l.id AS "loteId", l."numeroLote", l."fechaVencimiento", l."cantidadActual" AS "stockLote"
       FROM fa_medicamentos m
       LEFT JOIN fa_lotes l ON l."medicamentoId" = m.id AND l.estado = 'activo' AND l."cantidadActual" > 0 AND l."fechaVencimiento" >= CURRENT_DATE
       WHERE m."empresaId" = $1 AND m."codigoBarra" = $2 AND m."isActive" = true
       ORDER BY l."fechaVencimiento" ASC LIMIT 1`,
      [empresaId, codigoBarra],
    );
    if (!m) throw new NotFoundException('Medicamento no encontrado');
    return m;
  }

  async obtenerMedicamento(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const m = await this.medOr404(empresaId, id);
    const lotes = await this.ds.query<any[]>(
      `SELECT * FROM fa_lotes WHERE "medicamentoId" = $1 AND "empresaId" = $2 ORDER BY "fechaVencimiento" ASC`,
      [id, empresaId],
    );
    return { ...m, lotes };
  }

  async crearMedicamento(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [m] = await this.ds.query<any[]>(
      `INSERT INTO fa_medicamentos (
        "empresaId", codigo, "codigoBarra", "nombreGenerico", "nombreComercial", laboratorio,
        categoria, forma, concentracion, via, "unidadMedida", "requiereReceta", "esNarcotico",
        "esPsicotropico", "esRefrigerado", "precioCompra", "precioVenta", "precioArs",
        "margenGanancia", "stockMinimo", "stockMaximo", "productoId"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        empresaId, dto.codigo ?? null, dto.codigoBarra ?? null, dto.nombreGenerico, dto.nombreComercial ?? null,
        dto.laboratorio ?? null, dto.categoria ?? null, dto.forma ?? null, dto.concentracion ?? null,
        dto.via ?? null, dto.unidadMedida ?? null, dto.requiereReceta ?? false, dto.esNarcotico ?? false,
        dto.esPsicotropico ?? false, dto.esRefrigerado ?? false, dto.precioCompra ?? null,
        dto.precioVenta ?? 0, dto.precioArs ?? null, dto.margenGanancia ?? null,
        dto.stockMinimo ?? 10, dto.stockMaximo ?? null, dto.productoId ?? null,
      ],
    );
    return m;
  }

  async actualizarMedicamento(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.medOr404(empresaId, id);
    const sets: string[] = [];
    const params: any[] = [];
    const fields: Record<string, any> = {
      codigo: dto.codigo, codigoBarra: dto.codigoBarra, nombreGenerico: dto.nombreGenerico,
      nombreComercial: dto.nombreComercial, laboratorio: dto.laboratorio, categoria: dto.categoria,
      forma: dto.forma, concentracion: dto.concentracion, via: dto.via, unidadMedida: dto.unidadMedida,
      requiereReceta: dto.requiereReceta, esNarcotico: dto.esNarcotico, esPsicotropico: dto.esPsicotropico,
      esRefrigerado: dto.esRefrigerado, precioCompra: dto.precioCompra, precioVenta: dto.precioVenta,
      precioArs: dto.precioArs, margenGanancia: dto.margenGanancia, stockMinimo: dto.stockMinimo,
      stockMaximo: dto.stockMaximo, productoId: dto.productoId, isActive: dto.isActive,
    };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (!sets.length) return this.medOr404(empresaId, id);
    params.push(id, empresaId);
    const [m] = await this.ds.query<any[]>(
      `UPDATE fa_medicamentos SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    return m;
  }

  // ── LOTES ──────────────────────────────────────────────────────────────────

  async listarLotes(page = 1, limit = 50, medicamentoId?: number, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE l."empresaId" = $1`;
    if (medicamentoId) { params.push(medicamentoId); where += ` AND l."medicamentoId" = $${params.length}`; }
    if (estado) { params.push(estado); where += ` AND l.estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_lotes l ${where}`, params,
    );
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(`
      SELECT l.*, m."nombreGenerico", m."nombreComercial", m.concentracion,
             (l."fechaVencimiento"::date - CURRENT_DATE)::int AS "diasRestantes"
      FROM fa_lotes l
      JOIN fa_medicamentos m ON m.id = l."medicamentoId"
      ${where} ORDER BY l."fechaVencimiento" ASC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    return { data, total, page, limit };
  }

  async lotesProximosVencer(dias = 30) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(`
      SELECT l.*, m."nombreGenerico", m."nombreComercial", m.concentracion,
             (l."fechaVencimiento"::date - CURRENT_DATE)::int AS "diasRestantes"
      FROM fa_lotes l
      JOIN fa_medicamentos m ON m.id = l."medicamentoId"
      WHERE l."empresaId" = $1 AND l.estado = 'activo' AND l."cantidadActual" > 0
        AND l."fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval
      ORDER BY l."fechaVencimiento" ASC
    `, [empresaId, dias]);
  }

  async crearLote(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [lote] = await this.ds.query<any[]>(
      `INSERT INTO fa_lotes ("empresaId","medicamentoId","numeroLote","fechaFabricacion","fechaVencimiento",
        "cantidadInicial","cantidadActual","proveedorId","fechaCompra","precioCompra","facturaCompra")
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10) RETURNING *`,
      [
        empresaId, dto.medicamentoId, dto.numeroLote, dto.fechaFabricacion ?? null,
        dto.fechaVencimiento, dto.cantidadInicial, dto.proveedorId ?? null,
        dto.fechaCompra ?? null, dto.precioCompra ?? null, dto.facturaCompra ?? null,
      ],
    );
    await this.ds.query(
      `UPDATE fa_medicamentos SET "stockActual" = "stockActual" + $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
      [dto.cantidadInicial, dto.medicamentoId, empresaId],
    );
    return lote;
  }

  async actualizarLote(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [lote] = await this.ds.query<any[]>(
      `UPDATE fa_lotes SET estado = COALESCE($1, estado) WHERE id = $2 AND "empresaId" = $3 RETURNING *`,
      [dto.estado ?? null, id, empresaId],
    );
    if (!lote) throw new NotFoundException(`Lote #${id} no encontrado`);
    return lote;
  }

  // ── DISPENSACIONES ─────────────────────────────────────────────────────────

  async listarDispensaciones(page = 1, limit = 20, fecha?: string, desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1`;
    if (fecha) { params.push(fecha); where += ` AND DATE(fecha) = $${params.length}`; }
    if (desde) { params.push(desde); where += ` AND fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta + ' 23:59:59'); where += ` AND fecha <= $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_dispensaciones ${where}`, params,
    );
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(
      `SELECT * FROM fa_dispensaciones ${where} ORDER BY fecha DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data, total, page, limit };
  }

  async obtenerDispensacion(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d = await this.dispensacionOr404(empresaId, id);
    const items = await this.ds.query<any[]>(`
      SELECT i.*, m."nombreGenerico", m."nombreComercial", m.concentracion, m.forma,
             l."numeroLote", l."fechaVencimiento"
      FROM fa_dispensacion_items i
      JOIN fa_medicamentos m ON m.id = i."medicamentoId"
      LEFT JOIN fa_lotes l ON l.id = i."loteId"
      WHERE i."dispensacionId" = $1 AND i."empresaId" = $2
    `, [id, empresaId]);
    return { ...d, items };
  }

  async crearDispensacion(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Validar stock y obtener lotes FEFO por cada ítem
    const itemsConLote: any[] = [];
    for (const item of dto.items ?? []) {
      const med = await this.medOr404(empresaId, item.medicamentoId);
      if (med.stockActual < item.cantidad) {
        throw new BadRequestException(`Stock insuficiente para ${med.nombreGenerico}. Stock: ${med.stockActual}`);
      }
      if (med.requiereReceta && !item.recetaVerificada) {
        throw new BadRequestException(`${med.nombreGenerico} requiere receta médica verificada`);
      }
      // FEFO: obtener lote más próximo a vencer
      const [lote] = await this.ds.query<any[]>(`
        SELECT * FROM fa_lotes WHERE "medicamentoId" = $1 AND "empresaId" = $2
          AND estado = 'activo' AND "cantidadActual" >= $3 AND "fechaVencimiento" >= CURRENT_DATE
        ORDER BY "fechaVencimiento" ASC LIMIT 1
      `, [item.medicamentoId, empresaId, item.cantidad]);
      itemsConLote.push({ ...item, lote, med });
    }

    // Generar número secuencial
    const numero = await generarNumeroSecuencial(this.ds, 'fa_dispensaciones', 'numero', '', 'DIS-', 1, empresaId);

    // Calcular totales (ITBIS = 0% medicamentos exentos en RD)
    let subtotal = 0;
    for (const item of itemsConLote) {
      const itemTotal = Number(item.cantidad) * Number(item.precioUnitario) * (1 - (item.descuento ?? 0) / 100);
      subtotal += itemTotal;
    }
    const descuento = Number(dto.descuento ?? 0);
    const montoCubierto = Number(dto.montoCubierto ?? 0);
    const total = subtotal - descuento - montoCubierto;

    // Crear dispensación
    const [disp] = await this.ds.query<any[]>(
      `INSERT INTO fa_dispensaciones (
        "empresaId", numero, "clienteId", "clienteNombre", "clienteCedula",
        "recetaMedico", "recetaNumero", "recetaFecha", "arsNombre", "arsNumeroAfiliado",
        "autorizacionArs", "farmaceuticoNombre", subtotal, descuento, "montoCubierto",
        itbis, total, "metodoPago", notas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        empresaId, numero, dto.clienteId ?? null, dto.clienteNombre ?? null, dto.clienteCedula ?? null,
        dto.recetaMedico ?? null, dto.recetaNumero ?? null, dto.recetaFecha ?? null,
        dto.arsNombre ?? null, dto.arsNumeroAfiliado ?? null, dto.autorizacionArs ?? null,
        dto.farmaceuticoNombre ?? null, subtotal, descuento, montoCubierto,
        0, total, dto.metodoPago ?? null, dto.notas ?? null,
      ],
    );

    // Crear items y actualizar stock
    for (const item of itemsConLote) {
      const itemTotal = Number(item.cantidad) * Number(item.precioUnitario) * (1 - (item.descuento ?? 0) / 100);
      await this.ds.query(
        `INSERT INTO fa_dispensacion_items ("empresaId","dispensacionId","medicamentoId","loteId","cantidad","precioUnitario","descuento","total","instrucciones","requeriReceta","recetaVerificada")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          empresaId, disp.id, item.medicamentoId, item.lote?.id ?? null, item.cantidad,
          item.precioUnitario, item.descuento ?? 0, itemTotal, item.instrucciones ?? null,
          item.med.requiereReceta, item.recetaVerificada ?? false,
        ],
      );
      // Descontar stock del lote (FEFO)
      if (item.lote) {
        await this.ds.query(
          `UPDATE fa_lotes SET "cantidadActual" = "cantidadActual" - $1 WHERE id = $2`,
          [item.cantidad, item.lote.id],
        );
      }
      // Actualizar stock del medicamento
      await this.ds.query(
        `UPDATE fa_medicamentos SET "stockActual" = "stockActual" - $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [item.cantidad, item.medicamentoId, empresaId],
      );
      // Si es narcótico → registrar en libro de control
      if (item.med.esNarcotico || item.med.esPsicotropico) {
        const [prev] = await this.ds.query<any[]>(
          `SELECT COALESCE(SUM("cantidadActual"), 0)::numeric AS saldo FROM fa_lotes WHERE "medicamentoId" = $1 AND "empresaId" = $2 AND estado = 'activo'`,
          [item.medicamentoId, empresaId],
        );
        await this.ds.query(
          `INSERT INTO fa_control_narcoticos ("empresaId","medicamentoId","loteId","dispensacionId","tipo","cantidad","saldoAnterior","saldoActual","receptorNombre","receptorCedula","receptorMedico","recetaNumero","autorizadoPor")
           VALUES ($1,$2,$3,$4,'salida',$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            empresaId, item.medicamentoId, item.lote?.id ?? null, disp.id, item.cantidad,
            Number(prev.saldo) + Number(item.cantidad), Number(prev.saldo),
            dto.clienteNombre ?? null, dto.clienteCedula ?? null,
            dto.recetaMedico ?? null, dto.recetaNumero ?? null, dto.farmaceuticoNombre ?? null,
          ],
        );
      }
    }

    return this.obtenerDispensacion(disp.id);
  }

  // ── RECEPCIONES ────────────────────────────────────────────────────────────

  async listarRecepciones(page = 1, limit = 20) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_recepciones WHERE "empresaId" = $1`, [empresaId],
    );
    const data = await this.ds.query<any[]>(`
      SELECT r.*, p.nombre AS "proveedorNombre"
      FROM fa_recepciones r
      LEFT JOIN proveedores p ON p.id = r."proveedorId"
      WHERE r."empresaId" = $1
      ORDER BY r."createdAt" DESC LIMIT $2 OFFSET $3
    `, [empresaId, limit, offset]);
    return { data, total, page, limit };
  }

  async obtenerRecepcion(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [r] = await this.ds.query<any[]>(
      `SELECT r.*, p.nombre AS "proveedorNombre" FROM fa_recepciones r LEFT JOIN proveedores p ON p.id = r."proveedorId" WHERE r.id = $1 AND r."empresaId" = $2`,
      [id, empresaId],
    );
    if (!r) throw new NotFoundException(`Recepción #${id} no encontrada`);
    const items = await this.ds.query<any[]>(`
      SELECT i.*, m."nombreGenerico", m."nombreComercial", m.concentracion
      FROM fa_recepcion_items i
      JOIN fa_medicamentos m ON m.id = i."medicamentoId"
      WHERE i."recepcionId" = $1 AND i."empresaId" = $2
    `, [id, empresaId]);
    return { ...r, items };
  }

  async crearRecepcion(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'fa_recepciones', 'numero', '', 'REC-', 1, empresaId);
    let subtotal = 0;
    for (const item of dto.items ?? []) {
      subtotal += Number(item.cantidadRecibida) * Number(item.precioCompra ?? 0);
    }
    const total = subtotal;
    const [rec] = await this.ds.query<any[]>(
      `INSERT INTO fa_recepciones ("empresaId",numero,fecha,"proveedorId","facturaProveedor",subtotal,total,notas)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
      [empresaId, numero, dto.fecha, dto.proveedorId ?? null, dto.facturaProveedor ?? null, subtotal, dto.notas ?? null],
    );
    for (const item of dto.items ?? []) {
      await this.ds.query(
        `INSERT INTO fa_recepcion_items ("empresaId","recepcionId","medicamentoId","numeroLote","fechaVencimiento","cantidadOrdenada","cantidadRecibida","precioCompra","precioVenta","subtotal")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          empresaId, rec.id, item.medicamentoId, item.numeroLote, item.fechaVencimiento,
          item.cantidadOrdenada ?? null, item.cantidadRecibida,
          item.precioCompra ?? null, item.precioVenta ?? null,
          Number(item.cantidadRecibida) * Number(item.precioCompra ?? 0),
        ],
      );
    }
    return this.obtenerRecepcion(rec.id);
  }

  async confirmarRecepcion(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rec = await this.obtenerRecepcion(id);
    if (rec.estado === 'confirmada') throw new BadRequestException('Recepción ya confirmada');
    for (const item of rec.items) {
      // Crear o actualizar lote
      const [existeLote] = await this.ds.query<any[]>(
        `SELECT id FROM fa_lotes WHERE "medicamentoId" = $1 AND "numeroLote" = $2 AND "empresaId" = $3`,
        [item.medicamentoId, item.numeroLote, empresaId],
      );
      if (existeLote) {
        await this.ds.query(
          `UPDATE fa_lotes SET "cantidadActual" = "cantidadActual" + $1, "cantidadInicial" = "cantidadInicial" + $1 WHERE id = $2`,
          [item.cantidadRecibida, existeLote.id],
        );
      } else {
        await this.ds.query(
          `INSERT INTO fa_lotes ("empresaId","medicamentoId","numeroLote","fechaVencimiento","cantidadInicial","cantidadActual","proveedorId","precioCompra")
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
          [empresaId, item.medicamentoId, item.numeroLote, item.fechaVencimiento, item.cantidadRecibida, rec.proveedorId ?? null, item.precioCompra ?? null],
        );
      }
      // Actualizar stock medicamento
      await this.ds.query(
        `UPDATE fa_medicamentos SET "stockActual" = "stockActual" + $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [item.cantidadRecibida, item.medicamentoId, empresaId],
      );
      // Actualizar precio de compra si se envió
      if (item.precioVenta) {
        await this.ds.query(
          `UPDATE fa_medicamentos SET "precioVenta" = $1 WHERE id = $2 AND "empresaId" = $3`,
          [item.precioVenta, item.medicamentoId, empresaId],
        );
      }
    }
    await this.ds.query(
      `UPDATE fa_recepciones SET estado = 'confirmada' WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    return { ok: true, numero: rec.numero };
  }

  // ── NARCÓTICOS ─────────────────────────────────────────────────────────────

  async libroNarcoticos(medicamentoId?: number, desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE cn."empresaId" = $1`;
    if (medicamentoId) { params.push(medicamentoId); where += ` AND cn."medicamentoId" = $${params.length}`; }
    if (desde) { params.push(desde); where += ` AND cn.fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta + ' 23:59:59'); where += ` AND cn.fecha <= $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT cn.*, m."nombreGenerico", m.concentracion, l."numeroLote"
      FROM fa_control_narcoticos cn
      JOIN fa_medicamentos m ON m.id = cn."medicamentoId"
      LEFT JOIN fa_lotes l ON l.id = cn."loteId"
      ${where} ORDER BY cn.fecha DESC
    `, params);
  }

  // ── DEVOLUCIONES ───────────────────────────────────────────────────────────

  async listarDevoluciones(page = 1, limit = 20) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_devoluciones WHERE "empresaId" = $1`, [empresaId],
    );
    const data = await this.ds.query<any[]>(
      `SELECT d.*, dis.numero AS "dispensacionNumero", dis."clienteNombre"
       FROM fa_devoluciones d
       LEFT JOIN fa_dispensaciones dis ON dis.id = d."dispensacionId"
       WHERE d."empresaId" = $1 ORDER BY d."createdAt" DESC LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset],
    );
    return { data, total, page, limit };
  }

  async crearDevolucion(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'fa_devoluciones', 'numero', '', 'DEV-', 1, empresaId);
    const [dev] = await this.ds.query<any[]>(
      `INSERT INTO fa_devoluciones ("empresaId",numero,"dispensacionId",motivo,"montoDevuelto")
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresaId, numero, dto.dispensacionId ?? null, dto.motivo, dto.montoDevuelto ?? null],
    );
    return dev;
  }

  // ── ARS RECLAMACIONES ──────────────────────────────────────────────────────

  async listarArs(page = 1, limit = 20, estado?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const offset = (page - 1) * limit;
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1`;
    if (estado) { params.push(estado); where += ` AND estado = $${params.length}`; }
    const [{ total }] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS total FROM fa_reclamaciones_ars ${where}`, params,
    );
    params.push(limit, offset);
    const data = await this.ds.query<any[]>(
      `SELECT * FROM fa_reclamaciones_ars ${where} ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data, total, page, limit };
  }

  async crearArs(dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero = await generarNumeroSecuencial(this.ds, 'fa_reclamaciones_ars', 'numero', '', 'ARS-', 1, empresaId);
    const [ars] = await this.ds.query<any[]>(
      `INSERT INTO fa_reclamaciones_ars ("empresaId",numero,"arsNombre","periodoDesde","periodoHasta","cantidadDispensaciones","montoTotal","montoCubierto",observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        empresaId, numero, dto.arsNombre, dto.periodoDesde ?? null, dto.periodoHasta ?? null,
        dto.cantidadDispensaciones ?? null, dto.montoTotal ?? null, dto.montoCubierto ?? null,
        dto.observaciones ?? null,
      ],
    );
    return ars;
  }

  async actualizarArs(id: number, dto: any) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const sets: string[] = [];
    const params: any[] = [];
    const fields: Record<string, any> = {
      estado: dto.estado, fechaEnvio: dto.fechaEnvio, fechaPago: dto.fechaPago,
      montoCubierto: dto.montoCubierto, observaciones: dto.observaciones,
    };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (!sets.length) throw new BadRequestException('Sin campos a actualizar');
    params.push(id, empresaId);
    const [ars] = await this.ds.query<any[]>(
      `UPDATE fa_reclamaciones_ars SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "empresaId" = $${params.length} RETURNING *`,
      params,
    );
    if (!ars) throw new NotFoundException(`ARS #${id} no encontrada`);
    return ars;
  }

  // ── REPORTES ───────────────────────────────────────────────────────────────

  async reporteMasVendidos(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE d."empresaId" = $1`;
    if (desde) { params.push(desde); where += ` AND d.fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta + ' 23:59:59'); where += ` AND d.fecha <= $${params.length}`; }
    return this.ds.query<any[]>(`
      SELECT m.id, m."nombreGenerico", m."nombreComercial", m.concentracion, m.categoria,
             SUM(i.cantidad)::numeric AS "cantidadVendida",
             SUM(i.total)::numeric AS "totalVendido",
             COUNT(DISTINCT d.id)::int AS "dispensaciones"
      FROM fa_dispensacion_items i
      JOIN fa_medicamentos m ON m.id = i."medicamentoId"
      JOIN fa_dispensaciones d ON d.id = i."dispensacionId"
      ${where}
      GROUP BY m.id, m."nombreGenerico", m."nombreComercial", m.concentracion, m.categoria
      ORDER BY "cantidadVendida" DESC LIMIT 50
    `, params);
  }

  async reporteIngresos(desde?: string, hasta?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const params: any[] = [empresaId];
    let where = `WHERE "empresaId" = $1 AND estado = 'completada'`;
    if (desde) { params.push(desde); where += ` AND fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta + ' 23:59:59'); where += ` AND fecha <= $${params.length}`; }
    const [totales] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int AS dispensaciones, SUM(total)::numeric AS total, SUM("montoCubierto")::numeric AS "cubiertoPorArs" FROM fa_dispensaciones ${where}`,
      params,
    );
    const porDia = await this.ds.query<any[]>(
      `SELECT DATE(fecha) AS dia, COUNT(*)::int AS dispensaciones, SUM(total)::numeric AS total FROM fa_dispensaciones ${where} GROUP BY DATE(fecha) ORDER BY dia`,
      params,
    );
    return { ...totales, porDia };
  }

  async reporteStockBajo() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(`
      SELECT id, "nombreGenerico", "nombreComercial", concentracion, "stockActual", "stockMinimo",
             ("stockMinimo" - "stockActual") AS "faltantes"
      FROM fa_medicamentos
      WHERE "empresaId" = $1 AND "isActive" = true AND "stockActual" <= "stockMinimo"
      ORDER BY "stockActual" ASC
    `, [empresaId]);
  }

  async reporteMedicamentosSinMovimiento(dias = 30) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ds.query<any[]>(`
      SELECT m.id, m."nombreGenerico", m."nombreComercial", m.concentracion, m."stockActual",
             MAX(d.fecha) AS "ultimaVenta"
      FROM fa_medicamentos m
      LEFT JOIN fa_dispensacion_items i ON i."medicamentoId" = m.id AND i."empresaId" = m."empresaId"
      LEFT JOIN fa_dispensaciones d ON d.id = i."dispensacionId"
      WHERE m."empresaId" = $1 AND m."isActive" = true
      GROUP BY m.id, m."nombreGenerico", m."nombreComercial", m.concentracion, m."stockActual"
      HAVING MAX(d.fecha) < NOW() - ($2 || ' days')::interval OR MAX(d.fecha) IS NULL
      ORDER BY m."nombreGenerico"
    `, [empresaId, dias]);
  }

  async alertasActivas() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const stockBajo = await this.reporteStockBajo();
    const vencimientos = await this.lotesProximosVencer(30);
    const loteVencidos = await this.ds.query<any[]>(`
      SELECT l.*, m."nombreGenerico"
      FROM fa_lotes l JOIN fa_medicamentos m ON m.id = l."medicamentoId"
      WHERE l."empresaId" = $1 AND l.estado = 'activo' AND l."fechaVencimiento" < CURRENT_DATE AND l."cantidadActual" > 0
    `, [empresaId]);
    return { stockBajo, vencimientosProximos: vencimientos, lotesVencidos: loteVencidos };
  }
}
