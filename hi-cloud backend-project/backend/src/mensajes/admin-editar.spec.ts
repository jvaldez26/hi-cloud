import { MensajesService } from './mensajes.service';

/**
 * Editar un mensaje ya publicado tiene que cambiarlo DE VERDAD.
 *
 * Historia de este archivo: el PATCH devolvía 400 porque `tipo` no estaba en el
 * UpdateMensajeDto. Se agregó al DTO y el 400 desapareció — pero el UPDATE del
 * servicio nunca escribió la columna. El endpoint pasó a responder 200 y a no
 * hacer nada, en silencio, que es peor que el 400: el 400 al menos avisaba.
 *
 * Por eso estos tests no comprueban "no lanzó" ni "respondió 200". Aplican el
 * UPDATE real sobre una fila y afirman cómo queda. Un test que solo mirase el
 * código de respuesta habría pasado en verde durante todo el bug.
 */
describe('adminEditar — el mensaje publicado cambia en la base', () => {
  /**
   * Base de datos de mentira que aplica el UPDATE de verdad.
   *
   * Interpreta las asignaciones `col = COALESCE($n, col)` del SQL real y las
   * aplica sobre la fila: si el parámetro es null la columna se queda como
   * estaba, y si no, se sobrescribe. Es la semántica de COALESCE, que es
   * justamente la que decide si una edición se guarda o se pierde.
   *
   * Se interpreta el SQL en vez de comprobarlo con un regex para que el test
   * siga valiendo si mañana se reordenan las columnas o se renumeran los $n.
   */
  const crearService = (fila: Record<string, unknown>) => {
    const row = { ...fila };

    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/^\s*SELECT/i.test(sql)) return [{ id: row.id }];

      for (const [, col, idx] of sql.matchAll(/"?(\w+)"?\s*=\s*COALESCE\(\$(\d+),/g)) {
        const valor = params[Number(idx) - 1];
        if (valor !== null && valor !== undefined) row[col] = valor;
      }

      // "editadoEn" = CASE WHEN $n THEN now() ELSE "editadoEn" END
      const marca = sql.match(/"editadoEn"\s*=\s*CASE WHEN \$(\d+)/);
      if (marca && params[Number(marca[1]) - 1] === true) row.editadoEn = new Date();

      return [];
    });

    const svc: any = Object.create(MensajesService.prototype);
    svc.ds = { query };
    return { svc, row, query };
  };

  const publicado = () => ({
    id:        'e6f1a0c2-0000-4000-8000-000000000001',
    titulo:    'Mantenimiento del sábado',
    cuerpo:    'El sistema estará fuera de servicio de 2 a 4 AM.',
    tipo:      'novedad',          // mal clasificado: esto es un aviso
    activo:    true,
    editadoEn: null as Date | null,
  });

  it('corrige el tipo de un mensaje ya publicado', async () => {
    const { svc, row } = crearService(publicado());

    await svc.adminEditar(row.id, { tipo: 'aviso' });

    // El assert que importa: la columna, no el código de respuesta.
    expect(row.tipo).toBe('aviso');
  });

  it('cambiar el tipo marca editadoEn — es una enmienda visible, no metadatos', async () => {
    const { svc, row } = crearService(publicado());

    await svc.adminEditar(row.id, { tipo: 'aviso' });

    expect(row.editadoEn).toBeInstanceOf(Date);
  });

  it('corregir el tipo no toca el resto del mensaje', async () => {
    const original = publicado();
    const { svc, row } = crearService(original);

    await svc.adminEditar(row.id, { tipo: 'aviso' });

    expect(row.titulo).toBe(original.titulo);
    expect(row.cuerpo).toBe(original.cuerpo);
    expect(row.activo).toBe(true);
  });

  it('editar solo el cuerpo deja el tipo como estaba', async () => {
    // El COALESCE tiene que proteger en las dos direcciones: lo que no se manda
    // no se pisa. Un UPDATE sin COALESCE pondría tipo = NULL aquí.
    const { svc, row } = crearService(publicado());

    await svc.adminEditar(row.id, { cuerpo: 'Se pospone al domingo.' });

    expect(row.cuerpo).toBe('Se pospone al domingo.');
    expect(row.tipo).toBe('novedad');
  });

  it('el UPDATE incluye la columna tipo', async () => {
    // Guardia explícita contra la regresión concreta que hubo: que `tipo` se
    // acepte en el DTO pero desaparezca antes de llegar al SQL.
    const { svc, row, query } = crearService(publicado());

    await svc.adminEditar(row.id, { tipo: 'aviso' });

    const update = query.mock.calls.find(([sql]) => /UPDATE mensajes/i.test(sql))![0];
    expect(update).toMatch(/tipo\s*=\s*COALESCE/);
  });

  it('un id que no existe es 404, no un UPDATE silencioso', async () => {
    const { svc } = crearService(publicado());
    svc.ds.query = jest.fn(async () => []);   // el SELECT no encuentra nada

    await expect(svc.adminEditar('no-existe', { tipo: 'aviso' })).rejects.toThrow();
  });
});
