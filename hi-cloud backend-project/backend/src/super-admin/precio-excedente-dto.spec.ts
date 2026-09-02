import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsNumber, Min, Max } from 'class-validator';

/**
 * Copia exacta del DTO del controlador. Se replica aquí porque la clase vive
 * dentro de `super-admin.controller.ts` y no se exporta; importar el
 * controlador arrastraría medio Nest para validar tres decoradores.
 *
 * Si el DTO real cambia y este no, el test deja de proteger nada — por eso
 * comprueba los MISMOS límites que están escritos allí.
 */
class UpdatePrecioExcedenteDto {
  @IsNumber() @Min(0) @Max(1000)
  precioEcfExcedente!: number;
}

const validar = async (v: unknown) =>
  validate(plainToInstance(UpdatePrecioExcedenteDto, { precioEcfExcedente: v }));

describe('el precio del excedente que acepta el endpoint', () => {
  it('acepta un precio normal', async () => {
    expect(await validar(3)).toHaveLength(0);
    expect(await validar(2.5)).toHaveLength(0);
  });

  it('acepta 0 — es "sin configurar", un estado válido', async () => {
    expect(await validar(0)).toHaveLength(0);
  });

  it('RECHAZA el error de tecleo que multiplica por mil', async () => {
    // 3000 donde iba 3.00 convierte un cargo de RD$1.236 en uno de RD$1.236.000
    // en la cuenta de un cliente. Este número se multiplica por cientos.
    expect(await validar(3000)).not.toHaveLength(0);
  });

  it('rechaza un precio negativo: convertiría el cargo en un crédito', async () => {
    expect(await validar(-1)).not.toHaveLength(0);
  });

  it('rechaza lo que no es un número', async () => {
    expect(await validar('tres')).not.toHaveLength(0);
    expect(await validar(null)).not.toHaveLength(0);
    expect(await validar(undefined)).not.toHaveLength(0);
  });

  it('el tope está justo donde se documentó', async () => {
    expect(await validar(1000)).toHaveLength(0);
    expect(await validar(1000.01)).not.toHaveLength(0);
  });
});
