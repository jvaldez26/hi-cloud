import { describe, it, expect, beforeEach } from 'vitest';
import { useAutorizacionRemotaSonidoStore } from './autorizacionRemotaSonido.store';

describe('useAutorizacionRemotaSonidoStore', () => {
  beforeEach(() => {
    useAutorizacionRemotaSonidoStore.setState({ vistas: new Set(), preferencia: null });
  });

  it('marcarVista agrega el id sin perder los anteriores', () => {
    useAutorizacionRemotaSonidoStore.getState().marcarVista(1);
    useAutorizacionRemotaSonidoStore.getState().marcarVista(2);
    expect(useAutorizacionRemotaSonidoStore.getState().vistas).toEqual(new Set([1, 2]));
  });

  it('marcar la misma vista dos veces no crea un Set nuevo (no dispara re-render de más)', () => {
    useAutorizacionRemotaSonidoStore.getState().marcarVista(1);
    const primero = useAutorizacionRemotaSonidoStore.getState().vistas;
    useAutorizacionRemotaSonidoStore.getState().marcarVista(1);
    expect(useAutorizacionRemotaSonidoStore.getState().vistas).toBe(primero);
  });

  it('setPreferencia actualiza el valor compartido — así Perfil y el componente global quedan sincronizados', () => {
    useAutorizacionRemotaSonidoStore.getState().setPreferencia('on');
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('on');
    useAutorizacionRemotaSonidoStore.getState().setPreferencia('off');
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('off');
  });
});
