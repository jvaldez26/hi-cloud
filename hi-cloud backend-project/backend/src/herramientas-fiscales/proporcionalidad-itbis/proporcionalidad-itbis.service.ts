import { Injectable } from '@nestjs/common';
import { ParametrosFiscalesService } from '../../parametros-fiscales/parametros-fiscales.service';
import { ParametroFiscal } from '../../parametros-fiscales/entities/parametro-fiscal.entity';
import { CalcularProporcionalidadItbisDto } from './dto/calcular-proporcionalidad-itbis.dto';
import {
  calcularProporcionalidadItbis, TramoParametro, ValorPeriodoProrrata, ResultadoProporcionalidadItbis,
} from './proporcionalidad-itbis.calculo';

function aTramo<T>(f: ParametroFiscal): TramoParametro<T> {
  return {
    valor:         f.valor as T | null,
    vigenciaDesde: f.vigenciaDesde,
    vigenciaHasta: f.vigenciaHasta ?? null,
    estado:        f.estado as 'VALIDADO' | 'PENDIENTE_VALIDACION',
  };
}

/**
 * Orquesta la calculadora de proporcionalidad del ITBIS (impuro: lee
 * ParametrosFiscalesService) y delega toda la aritmética en
 * calcularProporcionalidadItbis(), la función pura.
 */
@Injectable()
export class ProporcionalidadItbisService {
  constructor(private parametrosFiscales: ParametrosFiscalesService) {}

  async calcular(dto: CalcularProporcionalidadItbisDto): Promise<ResultadoProporcionalidadItbis> {
    const filas = await this.parametrosFiscales.listar('proporcionalidad_itbis_periodo');
    const fila = filas
      .filter(f => f.vigenciaDesde <= dto.fecha && (!f.vigenciaHasta || f.vigenciaHasta >= dto.fecha))
      .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];

    return calcularProporcionalidadItbis(dto, fila ? aTramo<ValorPeriodoProrrata>(fila) : null);
  }
}
