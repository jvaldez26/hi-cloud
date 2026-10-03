import { describe, it, expect } from 'vitest';
import { debeIgnorarEnterGlobal, CLASE_MODAL_COBRO } from './confirmarCobroEnterGate';

function crearModal(clase: string): HTMLDivElement {
  const modal = document.createElement('div');
  modal.className = clase;
  document.body.appendChild(modal);
  return modal;
}

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

  it('dentro de la pantalla de cobro (.ant-modal.hc-modal-cobro) → NO se ignora — regresión real: Enter dejó de cobrar en producción', () => {
    const modal = crearModal(`ant-modal ${CLASE_MODAL_COBRO}`);
    const botonConfirmar = document.createElement('button');
    modal.appendChild(botonConfirmar);

    expect(debeIgnorarEnterGlobal(botonConfirmar)).toBe(false);

    modal.remove();
  });

  it('el campo de PIN del modal de Autorización de Supervisor (SIN la clase del modal de cobro) → se ignora (el bug original)', () => {
    const modal = crearModal('ant-modal');
    const input = document.createElement('input');
    modal.appendChild(input);

    expect(debeIgnorarEnterGlobal(input)).toBe(true);

    modal.remove();
  });

  it('cualquier otro modal apilado ENCIMA del de cobro (cliente, nota de crédito...) → se ignora', () => {
    const modalCobro = crearModal(`ant-modal ${CLASE_MODAL_COBRO}`);
    const modalCliente = crearModal('ant-modal'); // portal aparte, hermano del de cobro — mismo z-index que produce antd
    const select = document.createElement('div'); // antd Select no es un <input>
    modalCliente.appendChild(select);

    expect(debeIgnorarEnterGlobal(select)).toBe(true);

    modalCobro.remove();
    modalCliente.remove();
  });
});
