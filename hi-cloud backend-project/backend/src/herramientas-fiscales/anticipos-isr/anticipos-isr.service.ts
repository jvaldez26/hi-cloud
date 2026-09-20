import { Injectable } from '@nestjs/common';
import { ParametrosFiscalesService } from '../../parametros-fiscales/parametros-fiscales.service';
import { ParametroFiscal } from '../../parametros-fiscales/entities/parametro-fiscal.entity';
import { CalcularAnticiposISRDto } from './dto/calcular-anticipos-isr.dto';
import {
  calcularAnticiposISR, elegirRegimen, TramoParametro, ResultadoAnticiposISR,
} from './anticipos-isr.calculo';

function aTramo<T>(f: ParametroFiscal): TramoParametro<T> {
  return {
    valor:         f.valor as T | null,
    vigenciaDesde: f.vigenciaDesde,
    vigenciaHasta: f.vigenciaHasta ?? null,
    estado:        f.estado as 'VALIDADO' | 'PENDIENTE_VALIDACION',
  };
}

/**
 * Orquesta la calculadora de anticipos ISR (impuro: lee
 * ParametrosFiscalesService) y delega toda la aritmética en
 * calcularAnticiposISR(), la función pura. El régimen (y por tanto la
 * clave a resolver) se decide por el AÑO del ejercicio fiscal — ver
 * elegirRegimen() en el archivo de cálculo.
 */
@Injectable()
export class AnticiposISRService {
  constructor(private parametrosFiscales: ParametrosFiscalesService) {}

  async calcular(dto: CalcularAnticiposISRDto): Promise<ResultadoAnticiposISR> {
    const regimen = elegirRegimen(dto.fechaInicioEjercicio);
    const clave = regimen === 'TET' ? 'anticipos_isr_tet' : 'anticipos_isr_ley30_26';

    const filas = await this.parametrosFiscales.listar(clave);
    const fila = filas
      .filter(f => f.vigenciaDesde <= dto.fechaInicioEjercicio && (!f.vigenciaHasta || f.vigenciaHasta >= dto.fechaInicioEjercicio))
      .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];

    return calcularAnticiposISR(dto, { tramo: fila ? aTramo(fila) : null });
  }
}
