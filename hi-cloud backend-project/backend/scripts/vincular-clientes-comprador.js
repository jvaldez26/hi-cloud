#!/usr/bin/env node
/**
 * Vincula al cliente real las facturas históricas que se emitieron a un RNC
 * pero quedaron apuntando al cliente genérico "consumidor final".
 *
 * Desde el arreglo del vínculo, toda emisión nueva resuelve esto sola. Este
 * script es solo para lo que ya estaba en la base: ventas que fiscalmente están
 * bien —el snapshot tiene el comprador correcto y las notas de crédito salen a
 * su nombre— pero que comercialmente no existen: no aparecen en el estado de
 * cuenta de ese cliente, ni en top clientes, ni en su historial.
 *
 * Aplica las MISMAS reglas que el servicio en caliente
 * (ecf/services/vinculo-cliente-comprador.service.ts):
 *
 *   un cliente con ese RNC  → vincula
 *   ninguno                 → crea el cliente y vincula
 *   varios                  → NO adivina; lo deja y lo lista
 *
 * Lo de "varios" no es teórico: hay clientes distintos que comparten RNC —
 * sucursales de un contribuyente registradas por separado para llevar
 * dirección, contacto y cuenta por cobrar propias. Elegir una al azar mandaría
 * la venta a la cuenta equivocada, que es peor que no vincular. Esos casos los
 * levanta también la alerta `comprador-sin-vincular` en el panel.
 *
 * NO TOCA EL SNAPSHOT. `rncComprador` y `razonSocialComprador` tienen otro
 * dueño (la emisión del e-CF) y son inmutables: si el cliente cambia de razón
 * social, la nota de una factura vieja tiene que seguir saliendo con el nombre
 * con el que se emitió. Este script solo escribe `clienteId`.
 *
 * Uso:
 *   node scripts/vincular-clientes-comprador.js                 # simulación (no escribe)
 *   node scripts/vincular-clientes-comprador.js --empresa 42    # acotado a una empresa
 *   node scripts/vincular-clientes-comprador.js --aplicar       # escribe de verdad
 *
 * Sin --aplicar no modifica nada: imprime el plan y sale.
 */
require('dotenv').config();
const { Client } = require('pg');

const APLICAR    = process.argv.includes('--aplicar');
const empresaArg = (() => {
  const i = process.argv.indexOf('--empresa');
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

const ok   = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const warn = m => console.log('  \x1b[33m!\x1b[0m ' + m);
const info = m => console.log('  · ' + m);

/** Mismo criterio que normalizarRnc(): ceros de cualquier largo = sin RNC. */
const SQL_NORM = (col) => `regexp_replace(COALESCE(${col}, ''), '^0+$', '')`;

/**
 * "Consumidor final" no sirve para bautizar un cliente identificado: es lo que
 * quedó declarado cuando el cajero tecleó el RNC sin esperar al padrón, y un
 * cliente con cédula real llamado así es indistinguible del genérico. Se cae al
 * RNC a secas, que se ve raro y por eso invita a corregirlo.
 * Mismo criterio que el servicio en caliente.
 */
const GENERICO = /^\s*consumidor\s*final\s*$/i;
const nombreParaCliente = (razon, rnc) => {
  const r = (razon || '').trim();
  return (!r || GENERICO.test(r)) ? `RNC ${rnc}` : r;
};

/**
 * Candidatas: la factura declaró un RNC real y su cliente actual no tiene ese
 * RNC ni ningún otro. Si el cliente vinculado ya tiene RNC propio no se toca —
 * esa fue una decisión de quien facturó, y manda sobre cualquier automatismo.
 */
async function candidatas(c) {
  const { rows } = await c.query(`
    SELECT f.id, f.folio, f."empresaId", f."clienteId",
           ${SQL_NORM('f."rncComprador"')} AS rnc,
           f."razonSocialComprador"        AS razon,
           cl.nombre                       AS cliente_actual
    FROM facturas f
    JOIN clientes cl ON cl.id = f."clienteId"
    WHERE f."isActive" = true
      AND ${SQL_NORM('f."rncComprador"')} <> ''
      AND ${SQL_NORM(`COALESCE(NULLIF(cl."rncReceptor", ''), NULLIF(cl.rfc, ''), '')`)} = ''
      ${empresaArg ? 'AND f."empresaId" = $1' : ''}
    ORDER BY f."empresaId", f.id
  `, empresaArg ? [empresaArg] : []);
  return rows;
}

async function clientesConRnc(c, empresaId, rnc) {
  const { rows } = await c.query(`
    SELECT id, nombre FROM clientes
    WHERE "empresaId" = $1 AND "isActive" = true
      AND ${SQL_NORM(`COALESCE(NULLIF("rncReceptor", ''), NULLIF(rfc, ''), '')`)} = $2
    ORDER BY id ASC
  `, [empresaId, rnc]);
  return rows;
}

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  console.log(APLICAR
    ? '\nVinculando facturas a su cliente real — ESCRIBIENDO\n'
    : '\nSimulación — no se escribe nada. Añade --aplicar para ejecutar.\n');

  const filas = await candidatas(c);
  if (!filas.length) { ok('No hay facturas pendientes de vincular.'); await c.end(); return; }

  const cuenta = { vinculado: 0, creado: 0, ambiguo: 0 };
  // Los clientes creados en esta corrida se reutilizan: dos facturas al mismo
  // RNC nuevo tienen que terminar en el MISMO cliente, no en dos duplicados.
  const creadosEnEstaCorrida = new Map();

  for (const f of filas) {
    const clave = `${f.empresaId}:${f.rnc}`;
    let destino = creadosEnEstaCorrida.get(clave) ?? null;
    let accion  = destino ? 'creado' : null;

    if (!destino) {
      const encontrados = await clientesConRnc(c, f.empresaId, f.rnc);

      if (encontrados.length > 1) {
        cuenta.ambiguo++;
        warn(`emp${f.empresaId} ${f.folio}: RNC ${f.rnc} tiene ${encontrados.length} clientes ` +
             `(ids ${encontrados.map(x => x.id).join(', ')}) — sin vincular, resolver a mano`);
        continue;
      }

      if (encontrados.length === 1) {
        destino = encontrados[0];
        accion  = 'vinculado';
      } else {
        const razon = nombreParaCliente(f.razon, f.rnc);
        if (APLICAR) {
          const { rows } = await c.query(`
            INSERT INTO clientes ("empresaId", nombre, "razonSocial", "rncReceptor", rfc,
                                  "tipoCliente", "isActive", "createdAt", "updatedAt")
            VALUES ($1, $2, $2, $3, $3, $4, true, NOW(), NOW())
            RETURNING id, nombre
          `, [f.empresaId, razon, f.rnc,
              f.rnc.length === 11 ? 'persona_fisica' : 'persona_juridica']);
          destino = rows[0];
        } else {
          destino = { id: '(nuevo)', nombre: razon };
        }
        accion = 'creado';
        creadosEnEstaCorrida.set(clave, destino);
      }
    }

    if (APLICAR) {
      // Solo clienteId. El snapshot no se toca, ni aquí ni al crear el cliente.
      await c.query(
        `UPDATE facturas SET "clienteId" = $1, "updatedAt" = NOW() WHERE id = $2 AND "empresaId" = $3`,
        [destino.id, f.id, f.empresaId],
      );
    }
    cuenta[accion]++;
    info(`emp${f.empresaId} ${f.folio}: "${f.cliente_actual}" → #${destino.id} "${destino.nombre}" ` +
         `RNC ${f.rnc} [${accion}]`);
  }

  console.log('');
  ok(`${cuenta.vinculado} vinculadas a un cliente existente`);
  ok(`${cuenta.creado} vinculadas a un cliente nuevo`);
  if (cuenta.ambiguo) warn(`${cuenta.ambiguo} sin vincular por RNC compartido — resolver a mano`);
  if (!APLICAR) console.log('\n  (simulación: no se escribió nada)\n');

  await c.end();
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
