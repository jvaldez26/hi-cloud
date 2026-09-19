import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReglaDistribucion, PeriodicitadRegla } from './entities/regla-distribucion.entity';
import { ReglaDistribucionLinea } from './entities/regla-distribucion-linea.entity';
import { TenantService } from '../tenant/tenant.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

@Injectable()
export class DistribucionCostosService {
  constructor(
    @InjectRepository(ReglaDistribucion)
    private reglaRepo: Repository<ReglaDistribucion>,
    @InjectRepository(ReglaDistribucionLinea)
    private lineaRepo: Repository<ReglaDistribucionLinea>,
    private dataSource: DataSource,
    private tenantService: TenantService,
    private asientosService: AsientosAutomaticosService,
  ) {}

  // ── CRUD Reglas ────────────────────────────────────────────────────────────

  async crearRegla(dto: {
    nombre: string; descripcion?: string;
    cuentaOrigenId: number; cuentaOrigenNombre?: string;
    periodicidad?: PeriodicitadRegla;
    lineas: Array<{
      cuentaDestinoId: number; cuentaDestinoNombre?: string;
      centroCostoId?: number; centroCostoNombre?: string;
      porcentaje: number; descripcion?: string;
    }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();

    // Validar que los porcentajes sumen 100
    const totalPct = dto.lineas.reduce((s, l) => s + Number(l.porcentaje), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException(`Los porcentajes deben sumar 100%. Suma actual: ${totalPct.toFixed(2)}%`);
    }

    const regla = await this.reglaRepo.save(
      this.reglaRepo.create({ ...dto, empresaId, activa: true, vecesEjecutada: 0 }),
    );

    const lineas = dto.lineas.map(l =>
      this.lineaRepo.create({ ...l, reglaId: regla.id, empresaId }),
    );
    await this.lineaRepo.save(lineas);

    return this.findReglaById(regla.id);
  }

  async getReglas() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.reglaRepo.find({
      where: { empresaId, isActive: true },
      relations: ['lineas'],
      order: { nombre: 'ASC' },
    });
  }

  async findReglaById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const r = await this.reglaRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!r) throw new NotFoundException(`Regla #${id} no encontrada`);
    return r;
  }

  async deleteRegla(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.reglaRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Regla eliminada' };
  }

  // ── Ejecutar regla → genera asiento contable de distribución ──────────────

  async ejecutarRegla(
    reglaId: number,
    monto: number,
    fecha: string,
    userId: number,
    concepto?: string,
  ) {
    const regla    = await this.findReglaById(reglaId);
    const empresaId = this.tenantService.getEmpresaId();

    if (monto <= 0) throw new BadRequestException('El monto debe ser positivo');
    if (!regla.lineas?.length) throw new BadRequestException('La regla no tiene líneas de distribución');

    // Calcular montos por línea
    const lineasCalculadas = regla.lineas.map(l => ({
      ...l,
      montoDistribuido: Number((monto * Number(l.porcentaje) / 100).toFixed(2)),
    }));

    // Ajuste de redondeo — agregar diferencia a la primera línea
    const totalCalc = lineasCalculadas.reduce((s, l) => s + l.montoDistribuido, 0);
    const diferencia = Number((monto - totalCalc).toFixed(2));
    if (diferencia !== 0) lineasCalculadas[0].montoDistribuido += diferencia;

    // Crear asiento contable
    const lineaDescripcion = concepto ?? `Distribución: ${regla.nombre}`;

    // Las líneas de la regla guardan cuentaOrigenId/cuentaDestinoId — el FK
    // numérico a cuentas_contables que el usuario eligió al crear la regla —
    // pero el motor central (AsientosAutomaticosService) resuelve cuentas
    // por código, no por id. Se busca el código aquí antes de armar el
    // asiento; esto es una lectura contra el catálogo, no una escritura al
    // libro diario, así que no rompe la regla de "solo el motor escribe en
    // asientos_contables/asiento_lineas".
    //
    // Migrado del SQL crudo directo a esas dos tablas (2026-09-19) — además
    // de bypasear la validación de partida doble y el reporte a Sentry del
    // motor, el INSERT nunca ponía "numero" (columna NOT NULL): cada
    // ejecución de una regla fallaba con una violación de constraint.
    const idsCuentas = [regla.cuentaOrigenId, ...lineasCalculadas.map(l => l.cuentaDestinoId)];
    const filasCuentas = await this.dataSource.query<{ id: number; codigo: string }[]>(
      `SELECT id, codigo FROM cuentas_contables WHERE id = ANY($1) AND "empresaId" = $2`,
      [idsCuentas, empresaId],
    );
    const codigoPorId = new Map(filasCuentas.map(f => [f.id, f.codigo]));

    const codigoOrigen = codigoPorId.get(regla.cuentaOrigenId);
    if (!codigoOrigen) {
      throw new BadRequestException(
        `La cuenta origen de la regla (#${regla.cuentaOrigenId}) no existe o no pertenece a esta empresa`,
      );
    }

    const lineas = [
      // Crédito en la cuenta origen (se saca el costo del origen)
      { codigo: codigoOrigen, descripcion: lineaDescripcion, debe: 0, haber: monto },
      // Débito en cada cuenta destino
      ...lineasCalculadas.map(l => {
        const codigo = codigoPorId.get(l.cuentaDestinoId);
        if (!codigo) {
          throw new BadRequestException(
            `La cuenta destino #${l.cuentaDestinoId} de la regla no existe o no pertenece a esta empresa`,
          );
        }
        return {
          codigo,
          descripcion: `${lineaDescripcion} — ${Number(l.porcentaje).toFixed(2)}% → ${l.cuentaDestinoNombre ?? l.cuentaDestinoId}`,
          debe: l.montoDistribuido, haber: 0,
        };
      }),
    ];

    const asiento = await this.asientosService.crearAsientoContabilizado({
      descripcion:     lineaDescripcion,
      tipoOrigen:      TipoOrigenAsiento.MANUAL,
      referenciaId:    reglaId,
      referenciaFolio: `DIST-${reglaId}-${fecha}`,
      fecha,
      userId,
      lineas,
    });
    if (!asiento) {
      // El motor ya reportó a Sentry el código exacto que faltó — acá solo
      // se traduce a un error legible para quien ejecutó la regla.
      throw new BadRequestException(
        'No se pudo generar el asiento — alguna cuenta de la regla no permite movimientos o dejó de existir.',
      );
    }

    // Actualizar estadísticas de la regla
    await this.reglaRepo.update(reglaId, {
      vecesEjecutada:  (regla.vecesEjecutada ?? 0) + 1,
      ultimaEjecucion: new Date(),
    } as any);

    return {
      asientoId:        asiento.id,
      monto,
      lineasDistribuidas: lineasCalculadas.length,
      detalle:          lineasCalculadas.map(l => ({
        cuenta:     l.cuentaDestinoNombre ?? `#${l.cuentaDestinoId}`,
        porcentaje: Number(l.porcentaje),
        monto:      l.montoDistribuido,
      })),
    };
  }

  // ── Simulación (preview sin guardar) ──────────────────────────────────────

  async simularRegla(reglaId: number, monto: number) {
    const regla = await this.findReglaById(reglaId);

    const lineasCalculadas = regla.lineas.map(l => ({
      cuentaDestino:   l.cuentaDestinoNombre ?? `#${l.cuentaDestinoId}`,
      centroCosto:     l.centroCostoNombre,
      porcentaje:      Number(l.porcentaje),
      montoDistribuido: Number((monto * Number(l.porcentaje) / 100).toFixed(2)),
    }));

    return {
      monto,
      cuentaOrigen:     regla.cuentaOrigenNombre ?? `#${regla.cuentaOrigenId}`,
      lineasDistribuidas: lineasCalculadas,
      totalVerificado:  lineasCalculadas.reduce((s, l) => s + l.montoDistribuido, 0),
    };
  }
}
