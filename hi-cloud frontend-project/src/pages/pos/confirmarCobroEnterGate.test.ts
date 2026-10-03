import { describe, it, expect } from 'vitest';
import { debeIgnorarEnterGlobal } from './confirmarCobroEnterGate';

describe('debeIgnorarEnterGlobal', () => {
  it('null → no ignora (comportamiento previo, nunca debería pasar en producción)', () => {
    expect(debeIgnorarEnterGlobal(null)).toBe(false);
  });

  it('un TEXTAREA cualquiera → se ignora', () => {
    const textarea = document.createElement('textarea');
    expect(debeIgnorarEnterGlobal(textarea)).toBe(true);
  });

  it('un input normal del carrito (fuera de cualquier modal) → NO se ignora, Enter confirma el cobro', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(debeIgnorarEnterGlobal(input)).toBe(false);
    input.remove();
  });

  it('el campo de PIN del modal de Autorización de Supervisor → se ignora (el bug real)', () => {
    const modal = document.createElement('div');
    modal.className = 'ant-modal';
    const input = document.createElement('input');
    modal.appendChild(input);
    document.body.appendChild(modal);

    expect(debeIgnorarEnterGlobal(input)).toBe(true);

    modal.remove();
  });

  it('cualquier campo dentro de CUALQUIER .ant-modal (no solo el de supervisor) → se ignora', () => {
    const modal = document.createElement('div');
    modal.className = 'ant-modal otra-clase-cualquiera';
    const select = document.createElement('div'); // antd Select no es un <input>
    modal.appendChild(select);
    document.body.appendChild(modal);

    expect(debeIgnorarEnterGlobal(select)).toBe(true);

    modal.remove();
  });
});
