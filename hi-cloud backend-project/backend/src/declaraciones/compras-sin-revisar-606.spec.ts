/**
 * Bloque 1 — reconciliación 606/IR-2: DeclaracionesService::getComprasSinRevisar606().
 *
 * A diferencia de un gasto incompleto (que se EXCLUYE del 606), una compra
 * nunca se excluye — siempre sale, con COALESCE(...,'09'/'04') al exportar
 * (ver getFormato606). Esta consulta es la advertencia paralela: qué
 * compras del período nadie clasificó nunca (tipoBienes/formaPago en
 * NULL), para que el contador las revise antes de declarar en vez de
 * confiar en el default de exportación.
 */

import { DataSource } from 'typeorm';
import { DeclaracionesService } from './declaraciones.service';
import { DgiiValidatorService } from './dgii-validator.service';

const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)(
  'DeclaracionesService.getComprasSinRevisar606() contra Postgres (con limpieza al final)',
  () => {
    let dataSource: DataSource;
    const EMPRESA = -782;
    let proveedorId: number;

    beforeAll(async () => {
      dataSource = new DataSource({
        type:     'postgres',
        host:     process.env['DB_HOST'],
        port:     Number(process.env['DB_PORT'] ?? 5432),
        username: process.env['DB_USERNAME'],
        password: process.env['DB_PASSWORD'],
        database: process.env['DB_NAME'],
        ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      });
      await dataSource.initialize();
      const [prov] = await dataSource.query(
        `INSERT INTO proveedores ("empresaId", nombre, rnc) VALUES ($1, 'Proveedor — verificación 606', '130000001') RETURNING id`,
        [EMPRESA],
      );
      proveedorId = prov.id;
    });

    afterAll(async () => {
      await dataSource.query(`DELETE FROM compras WHERE "empresaId" = $1`, [EMPRESA]);
      await dataSource.query(`DELETE FROM proveedores WHERE "empresaId" = $1`, [EMPRESA]);
      await dataSource?.destroy();
    });

    it('solo lista compras recibidas/pagadas con tipoBienes o formaPago en NULL — nunca las ya clasificadas ni las en borrador', async () => {
      const svc = new DeclaracionesService(
        {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        dataSource,
        { getEmpresaId: () => EMPRESA } as any,
        new DgiiValidatorService(),
      );

      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-15`;

      // 1) Sin clasificar, recibida → debe aparecer.
      const [sinClasificar] = await dataSource.query(
        `INSERT INTO compras ("empresaId", folio, fecha, estado, "proveedorId", "usuarioId", total)
         VALUES ($1, 'OC-SIN-CLASIFICAR', $2, 'recibida', $3, 4, 500) RETURNING id`,
        [EMPRESA, fecha, proveedorId],
      );
      // 2) Ya clasificada → NO debe aparecer.
      await dataSource.query(
        `INSERT INTO compras ("empresaId", folio, fecha, estado, "proveedorId", "usuarioId", total, "tipoBienes", "formaPago")
         VALUES ($1, 'OC-CLASIFICADA', $2, 'recibida', $3, 4, 300, '09', '01')`,
        [EMPRESA, fecha, proveedorId],
      );
      // 3) Sin clasificar pero en BORRADOR (nunca se reportará al 606 así) → NO debe aparecer.
      await dataSource.query(
        `INSERT INTO compras ("empresaId", folio, fecha, estado, "proveedorId", "usuarioId", total)
         VALUES ($1, 'OC-BORRADOR', $2, 'borrador', $3, 4, 200)`,
        [EMPRESA, fecha, proveedorId],
      );

      const resultado = await svc.getComprasSinRevisar606(hoy.getMonth() + 1, hoy.getFullYear());

      expect(resultado).toHaveLength(1);
      expect(resultado[0].id).toBe(sinClasificar.id);
      expect(resultado[0].folio).toBe('OC-SIN-CLASIFICAR');
      expect(resultado[0].motivos).toEqual(
        expect.arrayContaining(['Sin tipo de bienes', 'Sin forma de pago']),
      );
    });
  },
);
