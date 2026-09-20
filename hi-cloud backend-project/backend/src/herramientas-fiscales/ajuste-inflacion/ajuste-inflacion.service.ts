import { Injectable } from '@nestjs/common';
import { ParametrosFiscalesService } from '../../parametros-fiscales/parametros-fiscales.service';
import { ParametroFiscal } from '../../parametros-fiscales/entities/parametro-fiscal.entity';
import { CalcularAjusteInflacionDto } from './dto/calcular-ajuste-inflacion.dto';
import {
  calcularAjusteInflacion, TramoParametro, ValorIndiceInflacion, ResultadoAjusteInflacion,
} from './ajuste-inflacion.calculo';

function aTramo<T>(f: ParametroFiscal): TramoParametro<T> {
  return {
    valor:         f.valor as T | null,
    vigenciaDesde: f.vigenciaDesde,
    vigenciaHasta: f.vigenciaHasta ?? null,
    estado:        f.estado as 'VALIDADO' | 'PENDIENTE_VALIDACION',
  };
}

/**
 * Orquesta la calculadora de ajuste por inflación (impuro: lee
 * ParametrosFiscalesService) y delega toda la aritmética en
 * calcularAjusteInflacion(), la función pura.
 */
@Injectable()
export class AjusteInflacionService {
  constructor(private parametrosFiscales: ParametrosFiscalesService) {}

  async calcular(dto: CalcularAjusteInflacionDto): Promise<ResultadoAjusteInflacion> {
    const filas = await this.parametrosFiscales.listar('indice_inflacion_dgii');
    const fila = filas
      .filter(f => f.vigenciaDesde <= dto.fechaEnajenacion && (!f.vigenciaHasta || f.vigenciaHasta >= dto.fechaEnajenacion))
      .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];

    return calcularAjusteInflacion(dto, fila ? aTramo<ValorIndiceInflacion>(fila) : null);
  }
}
