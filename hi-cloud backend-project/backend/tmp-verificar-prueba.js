// Verifica el resultado de la prueba. Borrar cuando termine.
require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT||5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false });
  await c.connect();
  const rec = (await c.query(`SELECT * FROM facturas_recurrentes WHERE "empresaId"=57 ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!rec) { console.log('No hay plantilla.'); return c.end(); }
  console.log('PLANTILLA  :', rec.nombre);
  console.log('  generadas:', rec.totalGeneradas, '| ultima:', String(rec.ultimaEjecucion).substring(0,15), '| proxima:', String(rec.proximaEjecucion).substring(0,15));
  console.log('  ultimoError:', rec.ultimoError ?? '(ninguno)');
  const f = (await c.query(
    `SELECT f.id, f.folio, f.estado, f.total, f."tipoNcf", f."vendedorId", f."nombreVendedor",
            f."tipoPago", f."formasPago", f."ecfId", f."ecfError",
            f."emailEstado", f."emailDestino", f."emailEnviadoAt", f."emailError", f."emailIntentos",
            e.numero AS encf, e."estadoDGII", e."trackId"
       FROM facturas f LEFT JOIN ecf e ON e.id=f."ecfId"
      WHERE f."facturaRecurrenteId"=$1 ORDER BY f.id DESC`, [rec.id])).rows;
  if (!f.length) { console.log('\nAun no se ha generado ninguna factura.'); return c.end(); }
  for (const x of f) {
    console.log('\nFACTURA    :', x.folio, '|', x.estado, '| RD$', x.total);
    console.log('  e-CF     :', x.encf ?? '(sin comprobante)', '| DGII:', x.estadoDGII ?? '-', '| trackId:', x.trackId ?? '-');
    console.log('  ecfError :', x.ecfError ?? '(ninguno)');
    console.log('  vendedor :', x.vendedorId ?? 'sin resolver', x.nombreVendedor ?? '');
    console.log('  pago     :', x.tipoPago, '|', JSON.stringify(x.formasPago));
    console.log('  correo   :', x.emailEstado ?? '(no intentado)', '->', x.emailDestino ?? '-',
                '| intentos:', x.emailIntentos, '| error:', x.emailError ?? '(ninguno)');
  }
  const sec = (await c.query(
    `SELECT s."secuenciaActual" FROM secuencias_ecf s JOIN tipos_ecf t ON t.id=s."tipoECFId"
      WHERE s."empresaId"=57 AND t.codigo='E32' AND s."isActiva"`)).rows[0];
  console.log('\nSecuencia E32 ahora en:', sec.secuenciaActual, '(estaba en 53)');
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
