/**
 * TenantSubscriber — deteccion de PUNTOS CIEGOS (2026-09-23).
 *
 * El guardia cross-tenant arranca con `if (!entity?.empresaId) return`. Un
 * .select([...]) parcial que omita empresaId hace que la entidad llegue sin
 * ese campo y el guardia se salte sin validar nada: fue exactamente lo que
 * dejo pasar la fuga del Libro Mayor, sin 403 y sin log.
 *
 * No se bloquea (hay selects parciales legitimos en todo el repo), pero se
 * cuenta y se avisa.
 */

import { TenantSubscriber } from './tenant.subscriber';
import { TenantScoped } from './decorators/tenant-scoped.decorator';

/** DataSource minimo: el subscriber solo se registra en la lista. */
const makeDataSource = () => ({ subscribers: [] }) as any;

const makeCls = (empresaId: number | null) => ({
  get: (k: string) => (k === 'empresaId' ? empresaId ?? undefined : undefined),
}) as any;

/** LoadEvent de mentira con la metadata que mira registrarPuntoCiego(). */
function makeEvent(nombre: string, target: Function, conColumnaEmpresaId = true) {
  return {
    metadata: {
      name: nombre,
      target,
      columns: conColumnaEmpresaId
        ? [{ propertyName: 'id' }, { propertyName: 'empresaId' }]
        : [{ propertyName: 'id' }],
    },
  } as any;
}

// Entidad scopeada por tenant — se decora con el mismo @TenantScoped() real.
@TenantScoped()
class LineaScopeada {}

/** Entidad sin scope de tenant (catalogos globales, tablas de sistema). */
class EntidadGlobal {}

describe('TenantSubscriber — puntos ciegos', () => {
  it('cuenta la carga de una entidad @TenantScoped sin empresaId en el select', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(7));
    // entidad SIN empresaId — el select parcial lo dejo fuera
    sub.afterLoad({ id: 1, debe: 100 }, makeEvent('AsientoLinea', LineaScopeada));

    expect(sub.getPuntosCiegos()).toMatchObject({ AsientoLinea: 1 });
  });

  it('no cuenta entidades que no estan scopeadas por tenant', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(7));

    sub.afterLoad({ id: 1 }, makeEvent('EntidadGlobal', EntidadGlobal));

    expect(sub.getPuntosCiegos()).toEqual({});
  });

  it('no cuenta si la entidad ni siquiera tiene columna empresaId', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(7));
    sub.afterLoad({ id: 1 }, makeEvent('AsientoLinea', LineaScopeada, false));

    expect(sub.getPuntosCiegos()).toEqual({});
  });

  it('no cuenta sin contexto de empresa — no hay nada que validar', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(null));
    sub.afterLoad({ id: 1 }, makeEvent('AsientoLinea', LineaScopeada));

    expect(sub.getPuntosCiegos()).toEqual({});
  });

  it('sigue cortando la fuga cuando la entidad SI trae empresaId de otra empresa', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(7));

    expect(() => sub.afterLoad({ id: 1, empresaId: 99 })).toThrow(/Acceso denegado/);
  });

  it('no molesta cuando el empresaId coincide', () => {
    const sub = new TenantSubscriber(makeDataSource(), makeCls(7));

    expect(() => sub.afterLoad({ id: 1, empresaId: 7 })).not.toThrow();
    expect(sub.getPuntosCiegos()).toEqual({});
  });
});
