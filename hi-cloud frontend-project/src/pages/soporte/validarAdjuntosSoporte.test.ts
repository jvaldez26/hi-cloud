import { describe, it, expect } from 'vitest';
import { validarNuevosAdjuntos } from './validarAdjuntosSoporte';

function archivo(nombre: string, tipo: string, tamanioBytes: number): File {
  return new File([new Uint8Array(tamanioBytes)], nombre, { type: tipo });
}

const PNG_1KB = () => archivo('foto.png', 'image/png', 1024);

describe('validarNuevosAdjuntos', () => {
  it('acepta imágenes PNG/JPG/WEBP dentro del tamaño permitido', () => {
    const archivos = [
      archivo('a.png',  'image/png',  1024),
      archivo('b.jpg',  'image/jpeg', 1024),
      archivo('c.webp', 'image/webp', 1024),
    ];
    const { aceptados, rechazados } = validarNuevosAdjuntos([], archivos);
    expect(aceptados).toHaveLength(3);
    expect(rechazados).toHaveLength(0);
  });

  it('rechaza tipos no permitidos (PDF, GIF, etc.)', () => {
    const { aceptados, rechazados } = validarNuevosAdjuntos([], [archivo('doc.pdf', 'application/pdf', 1024)]);
    expect(aceptados).toHaveLength(0);
    expect(rechazados[0].motivo).toMatch(/PNG, JPG o WEBP/);
  });

  it('rechaza archivos de más de 5 MB', () => {
    const grande = archivo('grande.png', 'image/png', 5 * 1024 * 1024 + 1);
    const { aceptados, rechazados } = validarNuevosAdjuntos([], [grande]);
    expect(aceptados).toHaveLength(0);
    expect(rechazados[0].motivo).toMatch(/5 MB/);
  });

  it('acepta un archivo de exactamente 5 MB', () => {
    const exacto = archivo('exacto.png', 'image/png', 5 * 1024 * 1024);
    const { aceptados } = validarNuevosAdjuntos([], [exacto]);
    expect(aceptados).toHaveLength(1);
  });

  it('respeta el máximo de 5 contando lo YA seleccionado, no solo los nuevos', () => {
    const yaSeleccionados = [PNG_1KB(), PNG_1KB(), PNG_1KB(), PNG_1KB()]; // 4 ya puestos
    const nuevos = [PNG_1KB(), PNG_1KB()]; // intenta agregar 2 más → 6, solo cabe 1
    const { aceptados, rechazados } = validarNuevosAdjuntos(yaSeleccionados, nuevos);
    expect(aceptados).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0].motivo).toMatch(/Máximo 5/);
  });

  it('con 5 ya seleccionados, cualquier nuevo se rechaza por cupo', () => {
    const yaSeleccionados = [PNG_1KB(), PNG_1KB(), PNG_1KB(), PNG_1KB(), PNG_1KB()];
    const { aceptados, rechazados } = validarNuevosAdjuntos(yaSeleccionados, [PNG_1KB()]);
    expect(aceptados).toHaveLength(0);
    expect(rechazados[0].motivo).toMatch(/Máximo 5/);
  });

  it('lista vacía de nuevos: no hace nada', () => {
    const { aceptados, rechazados } = validarNuevosAdjuntos([PNG_1KB()], []);
    expect(aceptados).toHaveLength(0);
    expect(rechazados).toHaveLength(0);
  });
});
