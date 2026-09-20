import { Injectable } from '@nestjs/common';
import { ParametrosFiscalesService } from '../../parametros-fiscales/parametros-fiscales.service';
import { ParametroFiscal } from '../../parametros-fiscales/entities/parametro-fiscal.entity';
import { CalcularRecargosInteresesDto } from './dto/calcular-recargos-intereses.dto';
import {
  calcularRecargosIntereses, TramoParametro, ResultadoRecargosIntereses,
} from './recargos-intereses.calculo';

function aTramo<T>(f: ParametroFiscal): TramoParametro<T> {
  return {
    valor:         f.valor as T | null,
    vigenciaDesde: f.vigenciaDesde,
    vigenciaHasta: f.vigenciaHasta ?? null,
    estado:        f.estado as 'VALIDADO' | 'PENDIENTE_VALIDACION',
  };
}

/**
 * Orquesta la calculadora de recargos e intereses (impuro: lee
 * ParametrosFiscalesService) y delega TODA la aritmética en
 * calcularRecargosIntereses(), la función pura — ver ese archivo para el
 * porqué de la separación (testeable sin BD).
 */
@Injectable()
export class RecargosInteresesService {
  constructor(private parametrosFiscales: ParametrosFiscalesService) {}

  async calcular(dto: CalcularRecargosInteresesDto): Promise<ResultadoRecargosIntereses> {
    // recargo_mora e interes_indemnizatorio_mensual: LISTA completa — una
    // sola mora puede cruzar varios tramos de vigencia (el 1-jul-2026, o un
    // cambio de año calendario), y la función pura resuelve, mes a mes,
    // cuál tramo aplica a cada uno.
    const [tramosRecargoMora, tramosInteres] = await Promise.all([
      this.parametrosFiscales.listar('recargo_mora'),
      this.parametrosFiscales.listar('interes_indemnizatorio_mensual'),
    ]);

    // modo/descuento/amnistía: solo se resuelven si la entrada los necesita
    // — pedirle a Jean que valide "descuento_pronto_pago_recargos" para
    // poder calcular un caso 'normal' (que ni lo usa) sería un error
    // controlado por una razón equivocada.
    const [tramoModoInteres, tramoDescuentoProntoPago, tramoAmnistia] = await Promise.all([
      this.resolverTramoUnico('interes_indemnizatorio_modo', dto.fechaPago),
      dto.situacion !== 'normal'
        ? this.resolverTramoUnico('descuento_pronto_pago_recargos', dto.fechaPago)
        : Promise.resolve(null),
      dto.acogeAmnistia
        ? this.resolverTramoUnico('amnistia_ley_30_26', dto.fechaPago)
        : Promise.resolve(null),
    ]);

    return calcularRecargosIntereses(dto, {
      tramosRecargoMora: tramosRecargoMora.map(f => aTramo(f)),
      tramosInteres:      tramosInteres.map(f => aTramo(f)),
      tramoModoInteres:          tramoModoInteres as any,
      tramoDescuentoProntoPago:  tramoDescuentoProntoPago as any,
      tramoAmnistia:             tramoAmnistia as any,
    });
  }

  /**
   * La fila (de cualquier estado) cuya vigencia cubre `fecha` — NO filtra
   * por VALIDADO: eso lo decide la función pura al momento de usarla, para
   * que el error diga exactamente qué cálculo lo necesitaba, no solo que
   * "no se encontró".
   */
  private async resolverTramoUnico<T>(clave: string, fecha: string): Promise<TramoParametro<T> | null> {
    const filas = await this.parametrosFiscales.listar(clave);
    const fila = filas
      .filter(f => f.vigenciaDesde <= fecha && (!f.vigenciaHasta || f.vigenciaHasta >= fecha))
      .sort((a, b) => (a.vigenciaDesde < b.vigenciaDesde ? 1 : -1))[0];
    return fila ? aTramo<T>(fila) : null;
  }
}
