import { describe, it, expect } from 'vitest';
import { credencialesFueronRechazadas } from './reautenticacionGate';

describe('credencialesFueronRechazadas', () => {
  describe('modo reautenticación (POST /auth/login)', () => {
    it('401 SÍ cuenta — credenciales inválidas de verdad', () => {
      expect(credencialesFueronRechazadas({ status: 401, reautenticandoTrasFallo: true, usuarioDistinto: false })).toBe(true);
    });
    it('400 (error de validación, como el bug real del campo "email") NO cuenta', () => {
      expect(credencialesFueronRechazadas({ status: 400, reautenticandoTrasFallo: true, usuarioDistinto: false })).toBe(false);
    });
    it('500 NO cuenta', () => {
      expect(credencialesFueronRechazadas({ status: 500, reautenticandoTrasFallo: true, usuarioDistinto: false })).toBe(false);
    });
    it('sin respuesta (red caída / timeout) NO cuenta', () => {
      expect(credencialesFueronRechazadas({ status: undefined, reautenticandoTrasFallo: true, usuarioDistinto: false })).toBe(false);
    });
  });

  describe('modo normal (POST /auth/verificar-password)', () => {
    it('400 SÍ cuenta — así reporta verificarPassword() la contraseña incorrecta', () => {
      expect(credencialesFueronRechazadas({ status: 400, reautenticandoTrasFallo: false, usuarioDistinto: false })).toBe(true);
    });
    it('401 NO cuenta — ahí significa "usuario no encontrado", no contraseña incorrecta', () => {
      expect(credencialesFueronRechazadas({ status: 401, reautenticandoTrasFallo: false, usuarioDistinto: false })).toBe(false);
    });
    it('500 NO cuenta', () => {
      expect(credencialesFueronRechazadas({ status: 500, reautenticandoTrasFallo: false, usuarioDistinto: false })).toBe(false);
    });
  });

  it('usuarioDistinto nunca cuenta, sin importar el status — la contraseña SÍ era correcta', () => {
    expect(credencialesFueronRechazadas({ status: 401, reautenticandoTrasFallo: true, usuarioDistinto: true })).toBe(false);
    expect(credencialesFueronRechazadas({ status: 400, reautenticandoTrasFallo: false, usuarioDistinto: true })).toBe(false);
  });
});
