import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaBancaria, TipoCuenta } from './entities/cuenta-bancaria.entity';
import { MovimientoBancario, TipoMovimientoBanco } from './entities/movimiento-bancario.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { ExtractoParserService } from './extracto-parser.service';
import { obtenerDatosUnificadosCuentasBancarias } from '../common/cuentas-bancarias/saldo-cuenta-bancaria.util';

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

  async actualizarCuenta(id: number, dto: Partial<CreateCuentaDto>) {
    await this.getCuenta(id);
    await this.cuentaRepo.update(id, dto as any);
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

  async listarMovimientos(cuentaId: number, pagination: PaginationDto, soloNoConciliados = false) {
    const { limit = 20, page = 1 } = pagination;
    const qb = this.movRepo.createQueryBuilder('m')
      .where('m.cuentaId = :cid', { cid: cuentaId })
      .andWhere('m.isActive = true');

    if (soloNoConciliados) qb.andWhere('m.conciliado = false');

    const [data, total] = await qb
      .orderBy('m.fecha', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

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

  async getResumenConciliacion(cuentaId: number, mes: number, anio: number) {
    const cuenta  = await this.getCuenta(cuentaId);
    const desde   = new Date(anio, mes - 1, 1);
    const hasta   = new Date(anio, mes, 0, 23, 59, 59);

    const movimientos = await this.movRepo.find({
      where: { cuentaId, isActive: true },
      order: { fecha: 'ASC' },
    });

    const delPeriodo = movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta);

    const totalCreditos    = delPeriodo.filter(m => m.tipo === TipoMovimientoBanco.CREDITO)
                              .reduce((s, m) => s + Number(m.monto), 0);
    const totalDebitos     = delPeriodo.filter(m => m.tipo === TipoMovimientoBanco.DEBITO)
                              .reduce((s, m) => s + Number(m.monto), 0);
    const conciliados      = delPeriodo.filter(m => m.conciliado).length;
    const noConciliados    = delPeriodo.filter(m => !m.conciliado).length;

    // Misma base que el widget de Inicio y la lista de cuentas (ver
    // saldo-cuenta-bancaria.util.ts): `saldoInicial` + la columna `saldo`
    // que mantiene el módulo de tesorería para esta MISMA fila física (0 si
    // esta cuenta nunca se tocó desde ahí) — sin eso, una cuenta creada aquí
    // pero con movimientos de tesorería (CxC/CxP/nómina) se habría visto
    // descuadrada en este resumen.
    const [filaTesoreria] = await this.cuentaRepo.manager.query<{ saldo: string }[]>(
      'SELECT saldo FROM cuentas_bancarias WHERE id = $1', [cuentaId],
    );
    const baseInicial = Number(cuenta.saldoInicial) + Number(filaTesoreria?.saldo ?? 0);

    // Saldo calculado desde el inicio
    const saldoActual = movimientos.reduce((s, m) => {
      return m.tipo === TipoMovimientoBanco.CREDITO
        ? s + Number(m.monto)
        : s - Number(m.monto);
    }, baseInicial);

    return {
      cuenta: { id: cuenta.id, nombre: cuenta.nombre, banco: cuenta.banco, numeroCuenta: cuenta.numeroCuenta },
      periodo: { mes, anio },
      saldoInicial:    baseInicial,
      totalCreditos,
      totalDebitos,
      saldoFinal:      baseInicial + totalCreditos - totalDebitos,
      saldoActual,
      movimientosPeriodo: delPeriodo.length,
      conciliados,
      noConciliados,
      porcentajeConciliado: delPeriodo.length > 0
        ? Math.round((conciliados / delPeriodo.length) * 100) : 100,
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
