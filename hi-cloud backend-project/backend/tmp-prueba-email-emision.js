// Prueba del envio automatico al emitir, en la empresa 57 (MSeller en modo TEST).
//   node tmp-prueba-email-emision.js preparar   -> enciende el interruptor y crea un borrador
//   node tmp-prueba-email-emision.js verificar  -> lee el resultado
//   node tmp-prueba-email-emision.js apagar     -> deja el interruptor como estaba
// Borrar cuando termine la verificacion.
require('dotenv').config();
const { Client } = require('pg');

const EMPRESA = 57;
const EMAIL   = 'valdezgonzalez01@gmail.com';
const accion  = process.argv[2];

const conectar = async () => {
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT||5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false });
  await c.connect();
  return c;
};

(async () => {
  const c = await conectar();

  const [cfg] = (await c.query(
    `SELECT modo FROM empresa_ecf_config WHERE "empresaId"=$1 AND activo AND "isActive"`, [EMPRESA])).rows;
  if (!cfg || cfg.modo !== 'TEST') throw new Error('ABORTADO: la empresa 57 no esta en modo TEST');

  if (accion === 'preparar') {
    const [antes] = (await c.query(
      `SELECT configuracion->>'autoEmailFacturaEmitida' AS v FROM empresa WHERE id=$1`, [EMPRESA])).rows;
    console.log('autoEmailFacturaEmitida antes:', antes.v ?? '(sin definir)');

    await c.query(
      `UPDATE empresa
          SET configuracion = COALESCE(configuracion,'{}'::jsonb)::jsonb || '{"autoEmailFacturaEmitida": true}'::jsonb
        WHERE id=$1`, [EMPRESA]);
    console.log('-> encendido');

    const [cli] = (await c.query(
      `SELECT id, nombre, email FROM clientes
        WHERE "empresaId"=$1 AND email=$2 AND "isActive" ORDER BY id DESC LIMIT 1`, [EMPRESA, EMAIL])).rows;
    if (!cli) throw new Error('No existe el cliente de prueba con ' + EMAIL);
    console.log('cliente:', '#'+cli.id, cli.nombre, '->', cli.email);

    const [usr] = (await c.query(
      `SELECT u.id FROM users u JOIN usuario_empresa ue ON ue."userId"=u.id
        WHERE ue."empresaId"=$1 AND ue."isActive" AND u."isActive" AND u.role='admin'
        ORDER BY u.id LIMIT 1`, [EMPRESA])).rows;

    const [{ numero }] = (await c.query(
      `SELECT siguiente_numero_secuencia($1,'FAC') AS numero`, [EMPRESA])).rows;
    const folio = 'FAC-' + numero;

    const [f] = (await c.query(
      `INSERT INTO facturas ("empresaId", folio, fecha, estado, "clienteId", "usuarioId", notas,
                             subtotal, iva, total, "netoCobrar", "tipoNcf", "tipoPago", "diasCredito",
                             "formasPago")
       VALUES ($1,$2,CURRENT_DATE,'borrador',$3,$4,'PRUEBA — envio automatico al emitir',
               200,36,236,236,'E32','CONTADO',0,'[{"tipo":1,"monto":236}]'::jsonb)
       RETURNING id, folio`, [EMPRESA, folio, cli.id, usr.id])).rows;

    await c.query(
      `INSERT INTO factura_detalles ("facturaId", descripcion, "precioUnitario", cantidad,
                                     "porcentajeIva", subtotal, "importeIva", total)
       VALUES ($1,'Prueba de envio automatico al emitir',200,1,18,200,36,236)`, [f.id]);

    console.log('borrador creado:', f.folio, '(id ' + f.id + ')');
    console.log('');
    console.log('AHORA: empresa 57 -> Facturas -> ' + f.folio + ' -> Emitir.');
    console.log('Luego: node tmp-prueba-email-emision.js verificar');
  }

  if (accion === 'verificar') {
    const r = (await c.query(
      `SELECT f.id, f.folio, f.estado, f.total, f."emailEstado", f."emailDestino",
              f."emailEnviadoAt", f."emailError", f."emailIntentos", f."ecfError",
              e.numero AS encf, e."estadoDGII", e."qrUrl"
         FROM facturas f LEFT JOIN ecf e ON e.id=f."ecfId"
        WHERE f."empresaId"=$1 AND f.notas LIKE 'PRUEBA — envio automatico%'
        ORDER BY f.id DESC LIMIT 1`, [EMPRESA])).rows[0];
    if (!r) { console.log('No encuentro la factura de prueba.'); }
    else {
      console.log('FACTURA  :', r.folio, '|', r.estado, '| RD$', r.total);
      console.log('  e-CF   :', r.encf ?? '(sin comprobante)', '|', r.estadoDGII ?? '-');
      console.log('  ecfError:', r.ecfError ?? '(ninguno)');
      console.log('  correo :', r.emailEstado ?? '(no intentado)', '->', r.emailDestino ?? '-');
      console.log('  enviado:', r.emailEnviadoAt ?? '-', '| intentos:', r.emailIntentos,
                  '| error:', r.emailError ?? '(ninguno)');
      console.log('  enlace verificacion en el correo:', r.qrUrl ?? '(sin URL)');
    }
    const [cfg2] = (await c.query(
      `SELECT configuracion->>'autoEmailFacturaEmitida' AS v FROM empresa WHERE id=$1`, [EMPRESA])).rows;
    console.log('\nautoEmailFacturaEmitida sigue en:', cfg2.v);
  }

  if (accion === 'apagar') {
    await c.query(
      `UPDATE empresa SET configuracion = configuracion::jsonb - 'autoEmailFacturaEmitida' WHERE id=$1`,
      [EMPRESA]);
    const [d] = (await c.query(
      `SELECT configuracion->>'autoEmailFacturaEmitida' AS v FROM empresa WHERE id=$1`, [EMPRESA])).rows;
    console.log('autoEmailFacturaEmitida ahora:', d.v ?? '(sin definir — apagado por defecto)');
  }

  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
