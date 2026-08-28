/**
 * El comprador de una E33/E34 sale del e-CF que la nota modifica, no del
 * cliente vinculado. Los casos de aquí están calcados de lo que la DGII rechazó
 * con código 615: la NC E340000000009 (empresa 42) salió a nombre de
 * "consumidor final" / 000000000 sobre la factura E310000000005, que se había
 * declarado a RODELA CONSTRUCCIONES RODECO SRL / 131904718.
 */
import { resolverCompradorNota, normalizarRnc } from './comprador.section';
import { EcfCompradorNotaError } from '../../errors/ecf.errors';

const CLIENTE_GENERICO = {
  nombre:      'consumidor final',
  rfc:         '000000000',   // 9 ceros — el centinela del código miraba 11
  rncReceptor: null,
  razonSocial: null,
  direccion:   null,
};

const RODELA = {
  rnc:         '131904718',
  razonSocial: 'RODELA CONSTRUCCIONES RODECO SRL',
  direccion:   null,
};

describe('normalizarRnc', () => {
  it('colapsa a vacío los centinelas de ceros de cualquier largo', () => {
    expect(normalizarRnc('000000000')).toBe('');
    expect(normalizarRnc('00000000000')).toBe('');
    expect(normalizarRnc('')).toBe('');
    expect(normalizarRnc(null)).toBe('');
    expect(normalizarRnc(undefined)).toBe('');
  });

  it('deja solo dígitos y conserva los RNC reales', () => {
    expect(normalizarRnc('131904718')).toBe('131904718');
    expect(normalizarRnc('131-90471-8')).toBe('131904718');
    expect(normalizarRnc('05401436216')).toBe('05401436216');
  });
});

describe('resolverCompradorNota', () => {
  it('toma el comprador del e-CF original cuando el cliente es el genérico', () => {
    const c = resolverCompradorNota(34, 'E310000000005', CLIENTE_GENERICO, RODELA);
    expect(c.rnc).toBe('131904718');
    expect(c.razonSocial).toBe('RODELA CONSTRUCCIONES RODECO SRL');
  });

  it('rechaza cuando el cliente apunta a otro contribuyente', () => {
    const otro = { ...CLIENTE_GENERICO, nombre: 'VIGOMISA SRL', rfc: '130266808' };
    expect(() => resolverCompradorNota(34, 'E310000000005', otro, RODELA))
      .toThrow(EcfCompradorNotaError);
  });

  it('rechaza cuando el original no identificó comprador y el cliente sí trae RNC', () => {
    const conRnc = { ...CLIENTE_GENERICO, rfc: '131904718' };
    expect(() => resolverCompradorNota(34, 'E320000000151', conRnc, { rnc: '00000000000' }))
      .toThrow(EcfCompradorNotaError);
  });

  it('acepta consumidor final sobre consumidor final (E32 normal)', () => {
    const c = resolverCompradorNota(34, 'E320000000151', CLIENTE_GENERICO, { rnc: '000000000' });
    expect(c.rnc).toBe('00000000000');
    expect(c.razonSocial).toBe('consumidor final');
  });

  it('acepta que coincidan y prefiere la razón social declarada a la del cliente', () => {
    const mismo = { ...CLIENTE_GENERICO, nombre: 'Rodela (sucursal Este)', rfc: '131904718' };
    const c = resolverCompradorNota(33, 'E310000000005', mismo, RODELA);
    expect(c.rnc).toBe('131904718');
    expect(c.razonSocial).toBe('RODELA CONSTRUCCIONES RODECO SRL');
  });

  it('sin snapshot del original cae al cliente — comportamiento previo intacto', () => {
    const c = resolverCompradorNota(34, 'E310000000005', CLIENTE_GENERICO, undefined);
    expect(c.rnc).toBe('00000000000');
    expect(c.razonSocial).toBe('consumidor final');
  });

  it('sin snapshot no bloquea aunque el cliente traiga RNC (reintentos, tests)', () => {
    const conRnc = { ...CLIENTE_GENERICO, nombre: 'Empresa Ejemplo SRL', rfc: '101234567' };
    expect(resolverCompradorNota(34, 'E310000000001', conRnc, undefined).rnc).toBe('101234567');
    expect(resolverCompradorNota(34, 'E310000000001', conRnc, { razonSocial: 'X' }).rnc).toBe('101234567');
  });

  it('el mensaje del error nombra ambos RNC y el comprobante modificado', () => {
    const otro = { ...CLIENTE_GENERICO, rfc: '130266808' };
    try {
      resolverCompradorNota(34, 'E310000000005', otro, RODELA);
      fail('debió lanzar');
    } catch (e) {
      const err = e as EcfCompradorNotaError;
      expect(err.code).toBe('ECF_COMPRADOR_NOTA_NO_COINCIDE');
      expect(err.message).toContain('E310000000005');
      expect(err.message).toContain('131904718');
      expect(err.message).toContain('130266808');
    }
  });
});
