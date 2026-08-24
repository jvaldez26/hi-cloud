import * as forge from 'node-forge';
import { BadRequestException } from '@nestjs/common';
import { CertificadoPfxService } from './certificado-pfx.service';
import { precioPara, PRECIO_CON_CERTIFICADO, PRECIO_SIN_CERTIFICADO } from './tarifas-activacion';

/**
 * EL CERTIFICADO NO SE GUARDA. Este archivo comprueba que además no se filtra.
 *
 * Los PFX de prueba se generan de verdad con node-forge, no se simulan: si el
 * parser cambia de comportamiento, estos tests lo notan. Un doble no lo haría.
 */

/** Genera un PFX real con la vigencia que se le pida. */
function generarPfx(opts: { clave: string; cn?: string; diasVigencia?: number }): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024);   // 1024 basta y es rápido
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';

  const dias = opts.diasVigencia ?? 365;
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter  = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

  const attrs = [{ name: 'commonName', value: opts.cn ?? 'EMPRESA DE PRUEBA SRL' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], opts.clave, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

describe('CertificadoPfxService', () => {
  const svc = new CertificadoPfxService();

  describe('certificado válido', () => {
    it('lo abre y saca vencimiento y titular', () => {
      const pfx = generarPfx({ clave: 'secreta123', cn: 'FERRETERIA LOPEZ SRL' });
      const r = svc.validar(pfx, 'secreta123');

      expect(r.valido).toBe(true);
      expect(r.vencido).toBe(false);
      expect(r.titular).toBe('FERRETERIA LOPEZ SRL');
      expect(r.venceEn).toBeInstanceOf(Date);
      expect(r.venceEn!.getTime()).toBeGreaterThan(Date.now());
    });

    it('con certificado válido el precio baja a 15.000', () => {
      const pfx = generarPfx({ clave: 'abc' });
      expect(precioPara(svc.validar(pfx, 'abc').valido)).toBe(PRECIO_CON_CERTIFICADO);
      expect(PRECIO_CON_CERTIFICADO).toBe(15000);
    });
  });

  describe('certificado VENCIDO — no cuenta', () => {
    it('se abre bien, pero no cuenta como certificado', () => {
      // Un PFX vencido es un archivo perfectamente válido que NO sirve para
      // facturar. Cobrar la tarifa reducida seria venderle algo que no funciona.
      const pfx = generarPfx({ clave: 'x', diasVigencia: -30 });
      const r = svc.validar(pfx, 'x');

      expect(r.vencido).toBe(true);
      expect(r.valido).toBe(false);
      // Se conserva la fecha: hay que poder decirle DESDE CUÁNDO está vencido.
      expect(r.venceEn).toBeInstanceOf(Date);
      expect(r.venceEn!.getTime()).toBeLessThan(Date.now());
    });

    it('vencido sigue en 18.000', () => {
      const pfx = generarPfx({ clave: 'x', diasVigencia: -1 });
      expect(precioPara(svc.validar(pfx, 'x').valido)).toBe(PRECIO_SIN_CERTIFICADO);
      expect(PRECIO_SIN_CERTIFICADO).toBe(18000);
    });
  });

  describe('la clave no abre el archivo', () => {
    it('lanza BadRequest, no un error interno', () => {
      const pfx = generarPfx({ clave: 'la-buena' });
      expect(() => svc.validar(pfx, 'la-mala')).toThrow(BadRequestException);
    });

    it('EL MENSAJE NO FILTRA NADA: ni la clave ni el contenido', () => {
      // node-forge puede meter trozos del ASN.1 que está parseando en su
      // excepción. Ese texto acabaría en el log y en Sentry.
      const clave = 'clave-secretisima-del-cliente';
      const pfx = generarPfx({ clave });
      let mensaje = '';
      try { svc.validar(pfx, 'otra-cosa'); } catch (e: any) { mensaje = String(e?.message ?? ''); }

      expect(mensaje).not.toContain(clave);
      expect(mensaje).not.toContain('otra-cosa');
      expect(mensaje.length).toBeLessThan(400);      // no es un volcado
      expect(mensaje).toMatch(/no se pudo abrir/i);  // y dice algo útil
    });

    it('un archivo que no es un PFX tampoco revienta', () => {
      const basura = Buffer.from('esto no es un certificado, es texto plano');
      expect(() => svc.validar(basura, 'x')).toThrow(BadRequestException);
    });

    it('sin archivo o sin clave: mensaje claro', () => {
      expect(() => svc.validar(Buffer.alloc(0), 'x')).toThrow(BadRequestException);
      expect(() => svc.validar(generarPfx({ clave: 'a' }), '')).toThrow(BadRequestException);
    });
  });

  describe('el buffer se libera', () => {
    it('tras validar, el buffer del PFX queda a ceros', () => {
      // Este proceso sirve a todas las empresas: un volcado de memoria tras un
      // crash acabaría en Sentry con el PFX dentro.
      const pfx = generarPfx({ clave: 'abc' });
      expect(pfx.some(b => b !== 0)).toBe(true);   // antes tiene contenido

      svc.validar(pfx, 'abc');

      expect(pfx.every(b => b === 0)).toBe(true);  // después, nada
    });

    it('también se libera cuando la validación FALLA', () => {
      // El camino de error es justo donde es más fácil olvidarse.
      const pfx = generarPfx({ clave: 'buena' });
      try { svc.validar(pfx, 'mala'); } catch { /* esperado */ }
      expect(pfx.every(b => b === 0)).toBe(true);
    });

    it('y con un archivo que ni siquiera es un PFX', () => {
      const basura = Buffer.from('xxxxxxxxxxxxxxxxxxxx');
      try { svc.validar(basura, 'x'); } catch { /* esperado */ }
      expect(basura.every(b => b === 0)).toBe(true);
    });
  });

  describe('el CN es informativo, no se valida contra la empresa', () => {
    it('acepta cualquier formato de CN — los emisores no coinciden entre sí', () => {
      // Validar contra el CN acabaría rechazando certificados perfectamente
      // buenos. Que lo vea un humano y decida.
      for (const cn of ['ACME SRL', '131000000', 'CN=RAROTOTAL', 'Empresa, S.R.L.']) {
        const r = svc.validar(generarPfx({ clave: 'k', cn }), 'k');
        expect(r.valido).toBe(true);
        expect(r.titular).toBeTruthy();
      }
    });
  });
});
