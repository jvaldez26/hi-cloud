import { Injectable } from '@nestjs/common';
import { ParametrosFiscalesService } from '../../parametros-fiscales/parametros-fiscales.service';
import { ParametroFiscal } from '../../parametros-fiscales/entities/parametro-fiscal.entity';
import {
  calcularItbis, calcularIsrPj, calcularIsrAsalariados, calcularIsrPf,
  calcularRetencionIR17, calcularDividendos, TramoParametro,
} from './impuestos-a-pagar.calculo';
import {
  CalcularItbisDto, CalcularIsrPjDto, CalcularIsrAsalariadosDto,
  CalcularIsrPfDto, CalcularRetencionIR17Dto, CalcularDividendosDto,
} from './dto/impuestos-a-pagar.dto';

function aTramo<T>(f: ParametroFiscal): TramoParametro<T> {
  return {
    valor: f.valor as T | null,
    vigenciaDesde: f.vigenciaDesde,
    vigenciaHasta: f.vigenciaHasta ?? null,
    estado: f.estado as 'VALIDADO' | 'PENDIENTE_VALIDACION',
  };
}

/**
 * Impuestos a Pagar — cada método resuelve el/los parámetro(s) vigentes de
 * SU calculador y delega toda la aritmética en la función pura
 * correspondiente (ver impuestos-a-pagar.calculo.ts, el registro real
 * {tipo → función}). Fase 2 (IPI, transferencia inmobiliaria, sucesiones,
 * ISC, operaciones financieras) se agrega como un método más, no toca
 * los que ya existen.
 */
@Injectable()
export class ImpuestosAPagarService {
  constructor(private parametrosFiscales: ParametrosFiscalesService) {}

  private async resolverTramoUnico<T>(clave: string, fecha: string): Promise<TramoParametro<T> | null> {
    const filas = await this.parametrosFiscales.listar(clave);
    const fila = filas
      .filter(f => f.vigenciaDesde <= fecha && (!f.vigenciaHasta || f.vigenciaHasta >= fecha))
      .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];
    return fila ? aTramo<T>(fila) : null;
  }

  itbis(dto: CalcularItbisDto) {
    return calcularItbis(dto);
  }

  async isrPj(dto: CalcularIsrPjDto) {
    const tramo = await this.resolverTramoUnico(`isr_pj`, `${dto.anio}-01-01`);
    return calcularIsrPj(dto, tramo as any);
  }

  async isrAsalariados(dto: CalcularIsrAsalariadosDto) {
    const tramo = await this.resolverTramoUnico(`escala_isr_pf`, `${dto.anio}-01-01`);
    return calcularIsrAsalariados(dto, tramo as any);
  }

  async isrPf(dto: CalcularIsrPfDto) {
    const tramo = await this.resolverTramoUnico(`escala_isr_pf`, `${dto.anio}-01-01`);
    return calcularIsrPf(dto, tramo as any);
  }

  async retencionIR17(dto: CalcularRetencionIR17Dto) {
    const tramo = await this.resolverTramoUnico(`retenciones_ir17`, dto.fecha);
    return calcularRetencionIR17(dto, tramo as any);
  }

  async dividendos(dto: CalcularDividendosDto) {
    const tramo = await this.resolverTramoUnico(`isr_dividendos`, dto.fecha);
    return calcularDividendos(dto, tramo as any);
  }
}
