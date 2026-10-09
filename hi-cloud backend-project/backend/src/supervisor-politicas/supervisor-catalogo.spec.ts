import { CATALOGO_SUPERVISOR, esClaveValida } from './supervisor-catalogo';

describe('CATALOGO_SUPERVISOR — imprimir_cierre_caja_abierta', () => {
  it('existe en el grupo "Caja", activada por defecto', () => {
    const item = CATALOGO_SUPERVISOR.find(c => c.clave === 'imprimir_cierre_caja_abierta');
    expect(item).toBeDefined();
    expect(item!.grupo).toBe('Caja');
    expect(item!.defaultRequerido).toBe(true);
    expect(['sesion', 'cada_vez']).toContain(item!.defaultModo);
  });

  it('esClaveValida la reconoce — el guard RequiereSupervisor y el PATCH de Configuración la aceptan', () => {
    expect(esClaveValida('imprimir_cierre_caja_abierta')).toBe(true);
  });
});
