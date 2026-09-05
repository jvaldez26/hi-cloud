import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegistrarEntradaDto } from './registrar-entrada.dto';
import { RegistrarSalidaDto } from './registrar-salida.dto';
import { RegistrarAjusteDto } from './registrar-ajuste.dto';

/**
 * Sentry #7712819145: POST /inventario/entrada tronó con "numeric field
 * overflow" en productos.stock (numeric(12,4)). No era la columna — coincide
 * con la entidad y ningún producto de la empresa reportante se acerca a ese
 * techo (el máximo histórico real es 3,000). El hueco real: ningún DTO de
 * este módulo ponía tope a la cantidad, así que un valor disparatado (typo,
 * integración rota) llegaba intacto hasta el UPDATE y reventaba en Postgres
 * en vez de rechazarse aquí con un 400 claro.
 *
 * `registrarDevolucion` no tiene DTO propio ni endpoint público: los tres
 * sitios que la llaman (compras, devoluciones, facturas) le pasan la
 * cantidad de una línea de documento ya creada, no un número libre desde una
 * petición — por eso no está en este archivo.
 */
describe('inventario — tope de cantidad en los DTO públicos', () => {
  const CANTIDAD_MAXIMA = 1_000_000;

  const validarEntrada = (cantidad: unknown) =>
    validate(plainToInstance(RegistrarEntradaDto, { productoId: 1, cantidad }));
  const validarSalida = (cantidad: unknown) =>
    validate(plainToInstance(RegistrarSalidaDto, { productoId: 1, cantidad }));
  const validarAjuste = (cantidadNueva: unknown) =>
    validate(plainToInstance(RegistrarAjusteDto, { productoId: 1, cantidadNueva, motivo: 'conteo físico' }));

  describe('RegistrarEntradaDto', () => {
    it('acepta cantidades reales — el máximo histórico visto es 3,000', async () => {
      expect(await validarEntrada(3000)).toHaveLength(0);
    });

    it('RECHAZA el valor que reventó en Sentry: del orden de decenas de millones', async () => {
      expect(await validarEntrada(50_000_000)).not.toHaveLength(0);
    });

    it('el tope está justo donde se documentó', async () => {
      expect(await validarEntrada(CANTIDAD_MAXIMA)).toHaveLength(0);
      expect(await validarEntrada(CANTIDAD_MAXIMA + 1)).not.toHaveLength(0);
    });
  });

  describe('RegistrarSalidaDto', () => {
    it('acepta cantidades reales y rechaza un disparate', async () => {
      expect(await validarSalida(300)).toHaveLength(0);
      expect(await validarSalida(50_000_000)).not.toHaveLength(0);
    });
  });

  describe('RegistrarAjusteDto — cantidadNueva es el stock RESULTANTE, no un delta', () => {
    it('acepta un conteo físico real y rechaza un disparate', async () => {
      expect(await validarAjuste(4058)).toHaveLength(0);
      expect(await validarAjuste(50_000_000)).not.toHaveLength(0);
    });

    it('sigue aceptando 0 — un producto agotado es un ajuste válido', async () => {
      expect(await validarAjuste(0)).toHaveLength(0);
    });
  });
});
