/**
 * Motivo del descarte (Fase 2c, auditoría HiCloud Xlink 2026-10-03): antes
 * el frontend mandaba siempre el texto fijo "Descartado desde HiCloud
 * Xlink" — el backend sí exigía `motivo` no vacío (xlink-recibir.controller.ts),
 * pero sin DTO, a mano, y sin tope de longitud.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DescartarXlinkDto } from './descartar-xlink.dto';

async function errores(payload: unknown): Promise<string[]> {
  const inst = plainToInstance(DescartarXlinkDto, payload);
  const res  = await validate(inst as object);
  return res.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('DescartarXlinkDto', () => {
  it('motivo con texto: válido', async () => {
    const errs = await errores({ motivo: 'No corresponde a mi empresa' });
    expect(errs).toHaveLength(0);
  });

  it('motivo vacío: inválido', async () => {
    const errs = await errores({ motivo: '' });
    expect(errs.join(' ')).toMatch(/motivo es obligatorio/i);
  });

  it('motivo ausente: inválido', async () => {
    const errs = await errores({});
    expect(errs.join(' ')).toMatch(/motivo/i);
  });

  it('motivo solo espacios: IsNotEmpty de class-validator no hace trim — lo verifica el controller (dto.motivo.trim())', async () => {
    const errs = await errores({ motivo: '   ' });
    expect(errs).toHaveLength(0); // válido a nivel DTO; el trim() real pasa en el controller antes de persistir
  });

  it('motivo de 301 caracteres: inválido (tope 300)', async () => {
    const errs = await errores({ motivo: 'a'.repeat(301) });
    expect(errs.join(' ')).toMatch(/motivo/i);
  });

  it('motivo de exactamente 300 caracteres: válido', async () => {
    const errs = await errores({ motivo: 'a'.repeat(300) });
    expect(errs).toHaveLength(0);
  });
});
