import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../../tenant/tenant.service';
import { FeriadosService } from '../feriados/feriados.service';
import { calcularTablaAmortizacion } from '../motor/amortizacion-v2.util';
import { construirParametrosPrestamo, aniosDelPlazo } from '../motor/motor-adaptador.util';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

/**
 * Etapa 1 — Simulador avanzado (docs/prestamista/etapa-1.md).
 */
@Injectable()
export class SimulacionesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly feriadosSvc: FeriadosService,
  ) {}

  /** Mismo cálculo que PrestamosService.simular() — una sola función fuente de verdad para "simular", la use quien la use. */
  private async calcularResultado(empresaId: number, p: any) {
    const config: any = {
      frecuencia: p.frecuencia, frecuenciaDiaria: p.frecuenciaDiaria, frecuenciaQuincenal: p.frecuenciaQuincenal,
      tasa: p.tasa, metodo: p.metodo, metodoPosteriorGracia: p.metodoPosteriorGracia,
      periodosSoloInteres: p.periodosSoloInteres, gracia: p.gracia, cargos: p.cargos,
    };
    const feriados = p.frecuencia === 'diaria' && p.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(p.fechaDesembolso, Number(p.plazoPeriodos)))
      : undefined;
    const params = construirParametrosPrestamo(config, {
      montoPrincipal: Number(p.montoPrincipal), fechaDesembolso: p.fechaDesembolso,
      fechaPrimerPago: p.fechaPrimerPago, plazoPeriodos: Number(p.plazoPeriodos),
    }, feriados);
    return calcularTablaAmortizacion(params);
  }

  async crear(empresaId: number, data: any) {
    if (!data.deudorId && !data.nombreProspecto) {
      throw new BadRequestException('Indica un deudor existente o el nombre del prospecto');
    }
    if (data.deudorId) {
      const [d] = await this.ds.query<any[]>(`SELECT 1 FROM pr_deudores WHERE id=$1 AND "empresaId"=$2`, [data.deudorId, empresaId]);
      if (!d) throw new NotFoundException(`Deudor #${data.deudorId} no encontrado`);
    }

    const resultado = await this.calcularResultado(empresaId, data.parametros);
    const uid = this.tenantSvc.getUserId();

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_simulaciones ("empresaId","deudorId","nombreProspecto",nombre,parametros,resultado,"creadoPor")
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [empresaId, data.deudorId ?? null, data.nombreProspecto ?? null, data.nombre,
       JSON.stringify(data.parametros), JSON.stringify(resultado), uid ?? null],
    );
    row.parametros = data.parametros;
    row.resultado = resultado;
    return row;
  }

  /** Listado liviano — sin `parametros`/`resultado` completos, solo los totales que se muestran en la tabla. */
  async listar(empresaId: number, deudorId?: number) {
    const params: any[] = [empresaId];
    let filtroDeudor = '';
    if (deudorId) { params.push(deudorId); filtroDeudor = ` AND "deudorId"=$${params.length}`; }
    return this.ds.query(
      `SELECT id, nombre, "deudorId", "nombreProspecto", "createdAt",
              (resultado->>'cuotaFija')::numeric AS "cuotaFija",
              (resultado->>'totalAPagar')::numeric AS "totalAPagar",
              (resultado->>'totalInteres')::numeric AS "totalInteres",
              (resultado->>'costoTotalCredito')::numeric AS "costoTotalCredito",
              (resultado->>'tea')::numeric AS tea,
              parametros->>'montoPrincipal' AS "montoPrincipal",
              parametros->>'frecuencia' AS frecuencia,
              parametros->>'metodo' AS metodo
       FROM pr_simulaciones WHERE "empresaId"=$1${filtroDeudor} ORDER BY "createdAt" DESC`,
      params,
    );
  }

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(`SELECT * FROM pr_simulaciones WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    if (!row) throw new NotFoundException(`Simulación #${id} no encontrada`);
    return row;
  }

  async obtener(empresaId: number, id: number) {
    return this.orFail(empresaId, id);
  }

  async eliminar(empresaId: number, id: number) {
    await this.orFail(empresaId, id);
    await this.ds.query(`DELETE FROM pr_simulaciones WHERE id=$1 AND "empresaId"=$2`, [id, empresaId]);
    return { success: true };
  }

  /** Convierte la simulación en una solicitud real — exige deudorId (de la simulación o del body, si era un prospecto). */
  async convertirSolicitud(empresaId: number, id: number, data: any) {
    const sim = await this.orFail(empresaId, id);
    const deudorId = sim.deudorId ?? data.deudorId;
    if (!deudorId) {
      throw new BadRequestException('Esta simulación es de un prospecto sin ficha — indica deudorId para crear la solicitud');
    }
    const [d] = await this.ds.query<any[]>(`SELECT 1 FROM pr_deudores WHERE id=$1 AND "empresaId"=$2`, [deudorId, empresaId]);
    if (!d) throw new NotFoundException(`Deudor #${deudorId} no encontrado`);

    const p: any = sim.parametros;
    const [seq] = await this.ds.query<any[]>(`SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'SOL']);
    const numero = `SOL-${seq.num}`;
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_solicitudes ("empresaId",numero,"deudorId","productoId","montoSolicitado","plazoMeses",
        "frecuenciaPago",proposito,"fechaSolicitud",estado,"creadoPor","simulacionId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [empresaId, numero, deudorId, data.productoId ?? null, p.montoPrincipal, p.plazoPeriodos,
       p.frecuencia, data.proposito ?? null, fechaHoyRD(), 'pendiente', this.tenantSvc.getUserId(), sim.id],
    );
    return row;
  }
}
