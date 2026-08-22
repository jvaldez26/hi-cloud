import { readFileSync } from 'fs';
import { join } from 'path';
import { FORMULA_EFECTIVO_VERSION } from './efectivo-esperado.util';

/**
 * Trazabilidad del recierre de caja.
 *
 * Reabrir un cierre es un flujo legítimo, pero `anularCierre` ponía
 * saldoCierre, saldoFisico y diferencia a 0: los números con los que alguien
 * cuadró dinero real desaparecían sin dejar rastro. Y con dos fórmulas
 * distintas conviviendo en la tabla, había que adivinar por la fecha si dos
 * cierres eran comparables.
 *
 * Estos tests fijan las reglas sobre el fuente — instanciar CajaService
 * arrastraría TypeORM, Redis y colas para comprobar tres asignaciones.
 */
describe('Recierre de caja — el original no se pierde', () => {
  const src = readFileSync(join(__dirname, 'caja.service.ts'), 'utf8');
  const entidad = readFileSync(join(__dirname, 'entities', 'cierre-caja.entity.ts'), 'utf8');

  /** anularCierre() es la reapertura: pasa el cierre a estado ABIERTA. */
  const anularCierre = (() => {
    const i = src.indexOf('async anularCierre');
    return src.slice(i, src.indexOf('\n  }', i));
  })();

  it('guarda los valores del cierre antes de ponerlos a cero', () => {
    for (const campo of [
      'esperadoOriginal',
      'contadoOriginal',
      'diferenciaOriginal',
      'formulaVersionOriginal',
    ]) {
      expect(anularCierre).toContain(campo);
    }
  });

  it('NO sobrescribe en un segundo recierre — el original es el PRIMERO', () => {
    // La guarda: solo se escriben si aún no hay original.
    expect(anularCierre).toMatch(/esperadoOriginal\s*==\s*null/);
    // Y se aplican por spread, así que si la guarda no se cumple no van en el update.
    expect(anularCierre).toMatch(/\.\.\.conservarOriginal/);
  });

  it('registra quién reabrió y cuándo', () => {
    expect(anularCierre).toContain('reabiertoPorUsuarioId');
    expect(anularCierre).toContain('reabiertoPorNombre');
    expect(anularCierre).toContain('reabiertoEn');
  });

  it('el usuario sale del contexto autenticado, no del body', () => {
    const controller = readFileSync(join(__dirname, 'caja.controller.ts'), 'utf8');
    const i = controller.indexOf('anularCierre(');
    const bloque = controller.slice(i, i + 400);
    // @GetUser() → usuario.id / usuario.nombre. Nunca dto.usuarioId ni similares.
    expect(bloque).toMatch(/usuario\.id/);
    expect(bloque).toMatch(/usuario\.nombre/);
    expect(bloque).not.toMatch(/dto\.(usuarioId|usuarioNombre|reabiertoPor)/);
  });

  it('sigue poniendo los valores vigentes a cero — el cierre se recalcula al recerrar', () => {
    expect(anularCierre).toMatch(/saldoCierre:\s*0/);
    expect(anularCierre).toMatch(/saldoFisico:\s*0/);
    expect(anularCierre).toMatch(/diferencia:\s*0/);
  });
});

describe('formulaVersion — el cierre dice cómo se calculó', () => {
  const src = readFileSync(join(__dirname, 'caja.service.ts'), 'utf8');
  const entidad = readFileSync(join(__dirname, 'entities', 'cierre-caja.entity.ts'), 'utf8');

  it('la versión actual es 2 (solo efectivo en el cajón)', () => {
    expect(FORMULA_EFECTIVO_VERSION).toBe(2);
  });

  it('los cierres históricos quedan en 1 por defecto — sin recalcular', () => {
    // default: 1 en la entidad = todo lo ya cerrado se marca como fórmula vieja,
    // que es exacto: esos números salieron de ella.
    expect(entidad).toMatch(/@Column\(\{\s*type:\s*'int',\s*default:\s*1\s*\}\)\s*\n\s*formulaVersion/);
  });

  it('cerrar una caja graba la versión actual', () => {
    const i = src.indexOf('EstadoCierre.CERRADA');
    expect(src.slice(i - 400, i + 600)).toContain('formulaVersion:   FORMULA_EFECTIVO_VERSION');
  });

  it('los campos Original son nullable — NULL significa "nunca se recerró"', () => {
    for (const campo of ['esperadoOriginal', 'contadoOriginal', 'diferenciaOriginal']) {
      const i = entidad.indexOf(campo);
      expect(entidad.slice(i - 200, i)).toContain('nullable: true');
    }
  });
});
