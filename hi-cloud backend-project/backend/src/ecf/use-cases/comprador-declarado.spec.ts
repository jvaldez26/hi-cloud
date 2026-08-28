/**
 * Jerarquía del comprador declarado: el snapshot fiscal de la factura manda.
 *
 * Estos casos existen para que nadie "sincronice" el snapshot con el cliente
 * vinculado. Son dos campos con dos dueños: si el cliente cambia de razón
 * social, la nota de crédito de una factura vieja tiene que seguir saliendo con
 * el nombre con el que se emitió, o la DGII la rechaza con código 615.
 */
import { leerCompradorDeclarado } from './emitir-ecf.use-case';
import { ECF } from '../entities/ecf.entity';
import { Factura } from '../../facturas/entities/factura.entity';

const ecfCon = (comprador: Record<string, string>, columnas: Partial<ECF> = {}) => ({
  jsonEnviado: { ECF: { Encabezado: { Comprador: comprador } } },
  ...columnas,
}) as unknown as ECF;

describe('leerCompradorDeclarado', () => {
  it('el snapshot de la factura gana sobre el jsonEnviado y sobre las columnas', () => {
    const ecf = ecfCon(
      { RNCComprador: '111111111', RazonSocialComprador: 'DEL JSON' },
      { rncComprador: '222222222', razonSocialComprador: 'DE LA COLUMNA' } as Partial<ECF>,
    );
    const factura = {
      rncComprador: '131904718',
      razonSocialComprador: 'RODELA CONSTRUCCIONES RODECO SRL',
    } as Factura;

    const c = leerCompradorDeclarado(ecf, factura);
    expect(c.rnc).toBe('131904718');
    expect(c.razonSocial).toBe('RODELA CONSTRUCCIONES RODECO SRL');
  });

  it('sin snapshot cae al jsonEnviado — el registro fiel de lo que recibió la DGII', () => {
    const ecf = ecfCon({ RNCComprador: '131904718', RazonSocialComprador: 'RODELA' });
    const c = leerCompradorDeclarado(ecf, { } as Factura);
    expect(c.rnc).toBe('131904718');
    expect(c.razonSocial).toBe('RODELA');
  });

  it('sin snapshot ni jsonEnviado cae a las columnas del e-CF', () => {
    const ecf = {
      rncComprador: '130266808', razonSocialComprador: 'VIGOMISA SRL',
    } as unknown as ECF;
    const c = leerCompradorDeclarado(ecf, null);
    expect(c.rnc).toBe('130266808');
    expect(c.razonSocial).toBe('VIGOMISA SRL');
  });

  it('nunca mira al cliente vinculado, ni cuando no hay nada más', () => {
    const ecf = { } as unknown as ECF;
    const factura = { cliente: { nombre: 'consumidor final', rfc: '000000000' } } as unknown as Factura;
    const c = leerCompradorDeclarado(ecf, factura);
    expect(c.rnc).toBeUndefined();
    expect(c.razonSocial).toBeUndefined();
  });
});
