import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EcfEncryptionService } from './ecf-encryption.service';

/** Clave válida de 32 bytes en base64 para los tests. */
const VALID_KEY = Buffer.from('a'.repeat(32)).toString('base64'); // 32 bytes de 0x61
const VALID_KEY_2 = Buffer.from('b'.repeat(32)).toString('base64');
const INVALID_KEY_SHORT = Buffer.from('toocorto').toString('base64'); // 8 bytes

function buildService(key: string | undefined): EcfEncryptionService {
  const configService = { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
  return new EcfEncryptionService(configService);
}

describe('EcfEncryptionService', () => {

  describe('encrypt / decrypt — ciclo completo', () => {
    it('debe descifrar correctamente lo que cifró', () => {
      const svc = buildService(VALID_KEY);
      const original = 'mi-api-key-secreta-12345';
      const cifrado = svc.encrypt(original);
      expect(svc.decrypt(cifrado)).toBe(original);
    });

    it('debe manejar strings vacíos y caracteres especiales', () => {
      const svc = buildService(VALID_KEY);
      for (const val of ['', '   ', 'abc!@#$%^&*()', '🔐 clave émoji', '0'.repeat(500)]) {
        expect(svc.decrypt(svc.encrypt(val))).toBe(val);
      }
    });

    it('cada cifrado genera un IV diferente (no IV reuse)', () => {
      const svc = buildService(VALID_KEY);
      const texto = 'mismo-texto';
      const c1 = svc.encrypt(texto);
      const c2 = svc.encrypt(texto);
      expect(c1).not.toBe(c2); // IV distinto → ciphertext distinto
      expect(svc.decrypt(c1)).toBe(texto);
      expect(svc.decrypt(c2)).toBe(texto);
    });

    it('el valor cifrado tiene el formato iv:authTag:ciphertext', () => {
      const svc = buildService(VALID_KEY);
      const cifrado = svc.encrypt('test');
      const partes = cifrado.split(':');
      expect(partes).toHaveLength(3);
      expect(partes[0]).toHaveLength(24);  // 12 bytes hex = 24 chars
      expect(partes[1]).toHaveLength(32);  // 16 bytes hex = 32 chars
      expect(partes[2].length).toBeGreaterThan(0);
    });
  });

  describe('decrypt — validación de errores', () => {
    it('lanza InternalServerErrorException con formato inválido', () => {
      const svc = buildService(VALID_KEY);
      expect(() => svc.decrypt('sin-dos-puntos')).toThrow();
      expect(() => svc.decrypt('a:b')).toThrow();          // solo 2 partes
      expect(() => svc.decrypt('')).toThrow();
    });

    it('lanza error si el auth tag fue manipulado (integridad)', () => {
      const svc = buildService(VALID_KEY);
      const cifrado = svc.encrypt('datos-sensibles');
      const partes = cifrado.split(':');
      // Corromper el auth tag
      partes[1] = 'ff'.repeat(16);
      const corrupted = partes.join(':');
      expect(() => svc.decrypt(corrupted)).toThrow();
    });

    it('lanza error si se intenta descifrar con clave diferente', () => {
      const svc1 = buildService(VALID_KEY);
      const svc2 = buildService(VALID_KEY_2);
      const cifrado = svc1.encrypt('secreto');
      expect(() => svc2.decrypt(cifrado)).toThrow();
    });
  });

  describe('encryptOptional / decryptOptional', () => {
    it('retorna undefined para valores falsy', () => {
      const svc = buildService(VALID_KEY);
      expect(svc.encryptOptional(undefined)).toBeUndefined();
      expect(svc.encryptOptional(null)).toBeUndefined();
      expect(svc.encryptOptional('')).toBeUndefined();
      expect(svc.decryptOptional(undefined)).toBeUndefined();
      expect(svc.decryptOptional(null)).toBeUndefined();
    });

    it('cifra y descifra valores no vacíos', () => {
      const svc = buildService(VALID_KEY);
      const c = svc.encryptOptional('api-key');
      expect(c).toBeDefined();
      expect(svc.decryptOptional(c)).toBe('api-key');
    });
  });

  describe('configuración de clave', () => {
    it('lanza InternalServerErrorException si la clave tiene longitud incorrecta', () => {
      expect(() => buildService(INVALID_KEY_SHORT)).toThrow(/32 bytes/);
    });

    it('funciona sin clave configurada (fallback con advertencia, no lanza)', () => {
      // En entorno de desarrollo sin ECF_ENCRYPTION_KEY, no debe romper el arranque
      expect(() => buildService(undefined)).not.toThrow();
    });
  });
});
