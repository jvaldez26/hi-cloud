import { describe, it, expect } from 'vitest';
import { debeIntentarDesbloqueoEnGesto, debeMostrarAvisoActivarSonido } from './desbloqueoAudioGate';

describe('debeIntentarDesbloqueoEnGesto', () => {
  it('intenta el desbloqueo si la preferencia nunca se decidió (null)', () => {
    expect(debeIntentarDesbloqueoEnGesto(null)).toBe(true);
  });

  it('intenta el desbloqueo si la preferencia ya estaba en "on"', () => {
    expect(debeIntentarDesbloqueoEnGesto('on')).toBe(true);
  });

  it('NO intenta el desbloqueo si el usuario lo apagó a mano en Perfil', () => {
    expect(debeIntentarDesbloqueoEnGesto('off')).toBe(false);
  });
});

describe('debeMostrarAvisoActivarSonido', () => {
  it('muestra el aviso si el audio sigue bloqueado y la preferencia no es "off"', () => {
    expect(debeMostrarAvisoActivarSonido(null, false)).toBe(true);
    expect(debeMostrarAvisoActivarSonido('on', false)).toBe(true);
  });

  it('no muestra el aviso una vez que el audio ya quedó desbloqueado', () => {
    expect(debeMostrarAvisoActivarSonido('on', true)).toBe(false);
  });

  it('no muestra el aviso si el usuario desactivó el sonido explícitamente', () => {
    expect(debeMostrarAvisoActivarSonido('off', false)).toBe(false);
  });
});
