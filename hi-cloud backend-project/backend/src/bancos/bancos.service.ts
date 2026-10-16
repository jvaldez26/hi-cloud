import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaBancaria, TipoCuenta } from './entities/cuenta-bancaria.entity';
import { MovimientoBancario, TipoMovimientoBanco } from './entities/movimiento-bancario.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { ExtractoParserService } from './extracto-parser.service';
import { obtenerDatosUnificadosCuentasBancarias } from '../common/cuentas-bancarias/saldo-cuenta-bancaria.util';
import { TIPOS_ENTRADA as TIPOS_ENTRADA_TESORERIA } from '../tesoreria/entities/movimiento-bancario.entity';

/** Una fila del historial unificado de una cuenta — ver listarMovimientos(). */
export interface MovimientoUnificado {
  id: string;
  fecha: Date;
  descripcion: string;
  tipo: 'credito' | 'debito';
  monto: number;
  saldoResultante?: number;
  conciliado: boolean;
  referencia?: string;
  /** De qué tabla salió esta fila — para que la pantalla nunca mezcle sin decir de dónde viene cada una. */
  origenTabla: 'bancos' | 'tesoreria' | 'apertura';
  origen?: string;
}

interface CreateCuentaDto {
  nombre: string; banco: string; numeroCuenta: string;
  tipo?: TipoCuenta; moneda?: string; saldoInicial?: number; descripcion?: string;
}

interface CreateMovimientoDto {
  cuentaId: number; fecha: string; descripcion: string;
  referencia?: string; tipo: TipoMovimientoBanco; monto: number;
  saldoResultante?: number;
}

@Injectable()
export class BancosService {
  private readonly logger = new Logger(BancosService.name);

  constructor(
    @InjectRepository(CuentaBancaria)  private cuentaRepo: Repository<CuentaBancaria>,
    @InjectRepository(MovimientoBancario) private movRepo: Repository<MovimientoBancario>,
    private tenantService:  TenantService,
    private extractoParser: ExtractoParserService,
  ) {}

  // ── Cuentas bancarias ─────────────────────────────────────────────────────

  async crearCuenta(dto: CreateCuentaDto): Promise<CuentaBancaria> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.cuentaRepo.save(this.cuentaRepo.create({ ...dto, empresaId }));
  }

  /**
   * `saldoInicial` sigue viniendo tal cual lo declaró quien registró la
   * cuenta (lo usa el formulario de edición) — `saldoActual` es la cifra que
   * de verdad hay que mostrar (ver saldo-cuenta-bancaria.util.ts: la misma
   * fórmula que usa el widget de Inicio).
   */
  async listarCuentas(): Promise<(CuentaBancaria & { saldoActual: number })[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const cuentas = await this.cuentaRepo.find({ where: { empresaId, isActive: true }, order: { banco: 'ASC' } });
    const saldos  = await obtenerDatosUnificadosCuentasBancarias(this.cuentaRepo.manager, empresaId);
    return cuentas.map(c => ({ ...c, saldoActual: saldos.get(c.id)?.saldoActual ?? Number(c.saldoInicial) }));
  }

  async getCuenta(id: number): Promise<CuentaBancaria> {
    const c = await this.cuentaRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return c;
  }

  /**
   * Defensa en profundidad: arma el UPDATE a mano con solo los campos de
   * identidad de la cuenta (nunca `dto` completo con un spread/`as any`) —
   * ver el mismo patrón en tesoreria.service.ts.updateCuenta, cerrado tras
   * el incidente 2026-10-15 (docs/deuda-tecnica-bancos-tesoreria.md).
   * `saldoInicial` SÍ se permite aquí: es un valor estático que declara
   * quien registra la cuenta, no un libro vivo — nunca fue la columna
   * involucrada en ese incidente (esa es `saldo`, del módulo tesorería).
   */
  async actualizarCuenta(id: number, dto: Partial<CreateCuentaDto>) {
    await this.getCuenta(id);
    const { nombre, banco, numeroCuenta, tipo, moneda, saldoInicial, descripcion } = dto;
    const cambios = Object.fromEntries(
      Object.entries({ nombre, banco, numeroCuenta, tipo, moneda, saldoInicial, descripcion }).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cambios).length > 0) {
      await this.cuentaRepo.update(id, cambios);
    }
    return this.getCuenta(id);
  }

  async eliminarCuenta(id: number) {
    await this.getCuenta(id);
    await this.cuentaRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Movimientos ───────────────────────────────────────────────────────────

  async agregarMovimiento(dto: CreateMovimientoDto): Promise<MovimientoBancario> {
    const empresaId = this.tenantService.getEmpresaId();
    await this.getCuenta(dto.cuentaId);
    return this.movRepo.save(this.movRepo.create({
      empresaId,
      ...dto,
      fecha: new Date(dto.fecha),
    }));
  }

  /**
   * TODOS los movimientos que componen el saldo de la cuenta, de las DOS
   * tablas que lo pueden tocar (`bancos_conciliacion` y
   * `movimientos_bancarios` — ver saldo-cuenta-bancaria.util.ts), más el
   * saldo de apertura como primera línea del historial. El saldo nunca
   * puede incluir algo que esta lista no muestre — requisito explícito
   * tras el incidente 2026-10-15 (empresa 53): el saldo subió RD$24,000 sin
   * que ningún movimiento lo explicara en ninguna de las dos tablas.
   */
  async listarMovimientos(cuentaId: number, pagination: PaginationDto, soloNoConciliados = false) {
    const { limit = 20, page = 1 } = pagination;
    const cuenta = await this.getCuenta(cuentaId);

    const qb = this.movRepo.createQueryBuilder('m')
      .where('m.cuentaId = :cid', { cid: cuentaId })
      .andWhere('m.isActive = true');
    if (soloNoConciliados) qb.andWhere('m.conciliado = false');
    const movsBancos = await qb.getMany();

    const movsTesoreria = await this.cuentaRepo.manager.query<any[]>(`
      SELECT id, tipo, monto, fecha, descripcion, referencia, origen, "saldoNuevo", conciliado
      FROM movimientos_bancarios
      WHERE "cuentaBancariaId" = $1 AND "isActive" = true ${soloNoConciliados ? 'AND conciliado = false' : ''}
    `, [cuentaId]);

    const unificados: MovimientoUnificado[] = [
      {
        id: `apertura-${cuenta.id}`,
        fecha: cuenta.createdAt,
        descripcion: 'Saldo de apertura',
        tipo: 'credito' as const,
        monto: Number(cuenta.saldoInicial),
        saldoResultante: Number(cuenta.saldoInicial),
        conciliado: true,
        origenTabla: 'apertura' as const,
      },
      ...movsBancos.map((m): MovimientoUnificado => ({
        id: `bancos-${m.id}`,
        fecha: m.fecha,
        descripcion: m.descripcion,
        tipo: m.tipo === TipoMovimientoBanco.CREDITO ? 'credito' : 'debito',
        monto: Number(m.monto),
        saldoResultante: m.saldoResultante != null ? Number(m.saldoResultante) : undefined,
        conciliado: m.conciliado,
        referencia: m.referencia ?? undefined,
        origenTabla: 'bancos',
        origen: m.sistemaTipo ?? 'manual',
      })),
      ...movsTesoreria.map((m: any): MovimientoUnificado => ({
        id: `tesoreria-${m.id}`,
        fecha: m.fecha,
        descripcion: m.descripcion,
        tipo: TIPOS_ENTRADA_TESORERIA.includes(m.tipo) ? 'credito' : 'debito',
        monto: Number(m.monto),
        saldoResultante: Number(m.saldoNuevo),
        conciliado: m.conciliado,
        referencia: m.referencia ?? undefined,
        origenTabla: 'tesoreria',
        origen: m.origen,
      })),
    ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    const total = unificados.length;
    const start = (page - 1) * limit;
    const data  = unificados.slice(start, start + limit);

    return { data, meta: { total, page, limit } };
  }

  async conciliarMovimiento(id: number, sistemaId?: number, sistemaTipo?: string) {
    const m = await this.movRepo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Movimiento #${id} no encontrado`);
    await this.movRepo.update(id, { conciliado: true, sistemaId, sistemaTipo });
    return this.movRepo.findOne({ where: { id } });
  }

  async desconciliar(id: number) {
    await this.movRepo.update(id, { conciliado: false, sistemaId: undefined, sistemaTipo: undefined });
    return { ok: true };
  }

  async eliminarMovimiento(id: number) {
    await this.movRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Resumen de conciliación ───────────────────────────────────────────────

  /**
   * "Saldo inicial" de un mes = saldoInicial de la cuenta + TODOS los
   * movimientos anteriores al mes, de las DOS tablas (requisito explícito
   * tras el incidente 2026-10-15 — antes esto solo miraba
   * `bancos_conciliacion` y usaba `cuenta.saldo`(tesorería) como un bloque
   * fijo, sin filtrar por fecha: una cuenta con movimientos de tesorería
   * quedaba igual en cualquier mes que se consultara). Permite moverse a
   * meses anteriores (parámetros `mes`/`anio`) para encontrar de dónde
   * salió cualquier diferencia.
   */
  async getResumenConciliacion(cuentaId: number, mes: number, anio: number) {
    const cuenta  = await this.getCuenta(cuentaId);
    const desde   = new Date(anio, mes - 1, 1);
    const hasta   = new Date(anio, mes, 0, 23, 59, 59);

    const movimientosBancos = await this.movRepo.find({
      where: { cuentaId, isActive: true },
      order: { fecha: 'ASC' },
    });
    const movimientosTesoreria = await this.cuentaRepo.manager.query<{ tipo: string; monto: string; fecha: string }[]>(`
      SELECT tipo, monto, fecha FROM movimientos_bancarios
      WHERE "cuentaBancariaId" = $1 AND "isActive" = true
    `, [cuentaId]);

    const netoBancos = (arr: MovimientoBancario[]) => arr.reduce(
      (s, m) => s + (m.tipo === TipoMovimientoBanco.CREDITO ? Number(m.monto) : -Number(m.monto)), 0,
    );
    const netoTesoreria = (arr: { tipo: string; monto: string }[]) => arr.reduce(
      (s, m) => s + (TIPOS_ENTRADA_TESORERIA.includes(m.tipo as any) ? Number(m.monto) : -Number(m.monto)), 0,
    );

    const antesBancos      = movimientosBancos.filter(m => m.fecha < desde);
    const delPeriodoBancos = movimientosBancos.filter(m => m.fecha >= desde && m.fecha <= hasta);
    const antesTesoreria      = movimientosTesoreria.filter(m => new Date(m.fecha) < desde);
    const delPeriodoTesoreria = movimientosTesoreria.filter(m => new Date(m.fecha) >= desde && new Date(m.fecha) <= hasta);

    const totalCreditos = delPeriodoBancos.filter(m => m.tipo === TipoMovimientoBanco.CREDITO).reduce((s, m) => s + Number(m.monto), 0)
      + delPeriodoTesoreria.filter(m => TIPOS_ENTRADA_TESORERIA.includes(m.tipo as any)).reduce((s, m) => s + Number(m.monto), 0);
    const totalDebitos = delPeriodoBancos.filter(m => m.tipo === TipoMovimientoBanco.DEBITO).reduce((s, m) => s + Number(m.monto), 0)
      + delPeriodoTesoreria.filter(m => !TIPOS_ENTRADA_TESORERIA.includes(m.tipo as any)).reduce((s, m) => s + Number(m.monto), 0);

    const conciliados      = delPeriodoBancos.filter(m => m.conciliado).length;
    const noConciliados    = delPeriodoBancos.filter(m => !m.conciliado).length;
    const movimientosPeriodo = delPeriodoBancos.length + delPeriodoTesoreria.length;

    const saldoInicial = Number(cuenta.saldoInicial) + netoBancos(antesBancos) + netoTesoreria(antesTesoreria);
    const saldoFinal   = saldoInicial + totalCreditos - totalDebitos;
    // Saldo de HOY (replay completo, sin importar el mes consultado) — para
    // que el encabezado de la cuenta siempre muestre el real, aunque se esté
    // mirando un mes anterior para investigar una diferencia.
    const saldoActual  = Number(cuenta.saldoInicial) + netoBancos(movimientosBancos) + netoTesoreria(movimientosTesoreria);

    return {
      cuenta: { id: cuenta.id, nombre: cuenta.nombre, banco: cuenta.banco, numeroCuenta: cuenta.numeroCuenta },
      periodo: { mes, anio },
      saldoInicial,
      totalCreditos,
      totalDebitos,
      saldoFinal,
      saldoActual,
      movimientosPeriodo,
      conciliados,
      noConciliados,
      porcentajeConciliado: movimientosPeriodo > 0
        ? Math.round((conciliados / movimientosPeriodo) * 100) : 100,
    };
  }

  // ── Importar estado de cuenta CSV ─────────────────────────────────────────
  // Soporta formatos de: Banreservas, BHD León, Popular, Scotiabank, APAP y genérico

  async importarCSV(
    cuentaId: number,
    csvContent: string,
    banco = 'generico',
  ): Promise<{ importados: number; errores: string[]; banco: string; resumen: any }> {
    const cuenta = await this.getCuenta(cuentaId);
    const empresaId = this.tenantService.getEmpresaId();

    // Usar el parser inteligente por banco
    const resultado = this.extractoParser.parse(csvContent, banco);
    let importados = 0;

    for (const linea of resultado.filas) {
      try {
        // Evitar duplicados: mismo cuentaId + fecha + monto + descripcion
        const existe = await this.movRepo.findOne({
          where: {
            cuentaBancariaId: cuentaId,
            descripcion:      linea.descripcion,
          } as any,
        });
        if (existe) continue;

        await this.movRepo.save(this.movRepo.create({
          empresaId,
          cuentaBancariaId: cuentaId,
          fecha:       new Date(linea.fecha + 'T00:00:00'),
          descripcion: linea.descripcion || 'Importado',
          referencia:  linea.referencia || undefined,
          tipo:        linea.tipo === 'credito' ? TipoMovimientoBanco.CREDITO : TipoMovimientoBanco.DEBITO,
          monto:       Math.abs(linea.monto),
        } as any));
        importados++;
      } catch (err) {
        resultado.errores.push(`Error guardando ${linea.fecha}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`CSV ${banco} — cuenta #${cuentaId} "${cuenta.nombre}": ${importados}/${resultado.filas.length} importados`);
    return {
      importados,
      errores:  resultado.errores,
      banco:    resultado.banco,
      resumen:  {
        totalFilas:    resultado.filas.length,
        totalCredito:  resultado.totalCredito,
        totalDebito:   resultado.totalDebito,
      },
    };
  }
}
