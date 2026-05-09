/**
 * Genera y envía un E31 de prueba a MSeller CERTIFICACION.
 * Lee las credenciales cifradas directamente de la BD.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register src/ecf/scripts/generar-e31-prueba.ts
 */

import axios from 'axios';
import { createDecipheriv } from 'crypto';
import { Client } from 'pg';

import { buildECF } from '../builders/ecf-compositor';
import { assertEmisorOrder } from '../builders/sections/emisor.section';

// ── Configuración ─────────────────────────────────────────────────────────────

const DB = {
  host:     'hicloud-db.cjc0a822i31y.us-east-2.rds.amazonaws.com',
  port:     5432,
  user:     'postgres',
  password: 'Higlobal-4691',
  database: 'hicloud',
  ssl:      { rejectUnauthorized: false },
};

const ECF_KEY   = Buffer.from('iriFwem50R5Gzt5LqzbH3PZ+EzAjmZixjPE+5HvnxkY=', 'base64');
const BASE_URL  = 'https://ecf.api.mseller.app';
const ENV_PATH  = 'CerteCF';

// ── Helpers ───────────────────────────────────────────────────────────────────

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const iv      = Buffer.from(ivHex,  'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const data    = Buffer.from(dataHex,'hex');
  const d = createDecipheriv('aes-256-gcm', ECF_KEY, iv, { authTagLength: 16 } as any);
  d.setAuthTag(authTag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── 1. Obtener credenciales desde la BD ──────────────────────────────────
  console.log('Conectando a la BD para obtener credenciales MSeller...');
  const db = new Client(DB);
  await db.connect();

  const { rows } = await db.query<{
    rnc_emisor: string;
    razon_social_emisor: string;
    direccion_emisor: string;
    municipio: string | null;
    provincia: string | null;
    mseller_email: string;
    mseller_password_enc: string;
    mseller_api_key_enc: string;
    mseller_url_base: string;
  }>(`
    SELECT
      "rncEmisor"         AS rnc_emisor,
      "razonSocialEmisor" AS razon_social_emisor,
      "direccionEmisor"   AS direccion_emisor,
      municipio,
      provincia,
      "msellerEmail"       AS mseller_email,
      "msellerPasswordEnc" AS mseller_password_enc,
      "msellerApiKeyEnc"   AS mseller_api_key_enc,
      "msellerUrlBase"     AS mseller_url_base
    FROM empresa_ecf_config
    WHERE activo = true
    LIMIT 1
  `);
  await db.end();

  if (!rows.length) {
    throw new Error('No hay configuración ECF activa en la BD');
  }

  const cfg      = rows[0];
  const email    = cfg.mseller_email;
  const password = decrypt(cfg.mseller_password_enc);
  const apiKey   = decrypt(cfg.mseller_api_key_enc);
  const urlBase  = cfg.mseller_url_base ?? BASE_URL;

  console.log(`✅ Credenciales obtenidas para: ${cfg.rnc_emisor} — ${cfg.razon_social_emisor}`);

  // ── 2. Autenticar en MSeller ──────────────────────────────────────────────
  const envPath = ENV_PATH;
  console.log(`\nAutenticando en ${urlBase}/${envPath}...`);

  const authResp = await axios.post(
    `${urlBase}/${envPath}/customer/authentication`,
    { email, password },
    { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
  );
  const { idToken } = authResp.data;
  console.log('✅ Auth OK');

  // ── 3. Construir payload E31 ──────────────────────────────────────────────
  const hoy          = new Date();
  const fechaVencSec = new Date(hoy.getFullYear() + 1, 11, 31);
  const ts           = Date.now().toString().slice(-6);
  const encf         = `E31${ts.padStart(13, '0')}`;

  const mockConfig: any = {
    rncEmisor:         cfg.rnc_emisor,
    razonSocialEmisor: cfg.razon_social_emisor,
    direccionEmisor:   cfg.direccion_emisor ?? cfg.razon_social_emisor,
    municipio:         cfg.municipio ?? undefined,
    provincia:         cfg.provincia ?? undefined,
    nombreComercial:   undefined,
  };

  const mockFactura: any = {
    fecha:    hoy,
    subtotal: 100,
    iva:      18,
    total:    118,
    cliente: {
      nombre:      cfg.razon_social_emisor,     // auto-factura para prueba
      rncReceptor: cfg.rnc_emisor,
      rfc:         null,
      direccion:   cfg.direccion_emisor ?? cfg.razon_social_emisor,
    },
    detalles: [{
      descripcion:    'Servicio de prueba E31 — HiCloud ECF',
      cantidad:       1,
      precioUnitario: 100,
      porcentajeIva:  18,
      importeIva:     18,
      subtotal:       100,
    }],
  };

  const payload = buildECF(31, {
    encf,
    factura:      mockFactura,
    config:       mockConfig,
    fechaVencSec,
  });

  // ── 4. Mostrar JSON y verificar Emisor ────────────────────────────────────
  const emisor     = payload.ECF.Encabezado.Emisor as Record<string, unknown>;
  const emisorKeys = Object.keys(emisor);
  assertEmisorOrder(emisor);   // lanza si FechaEmision no está al final

  console.log('\n=== JSON E31 A ENVIAR A MSELLER ===');
  console.log(JSON.stringify(payload, null, 2));
  console.log('=== FIN JSON E31 ===');
  console.log(`\nOrden Emisor : ${emisorKeys.join(' → ')}`);
  console.log(`FechaEmision al final: ✅`);

  // ── 5. Enviar a MSeller ───────────────────────────────────────────────────
  console.log(`\nEnviando ${encf} a MSeller ${envPath}...`);

  const resp = await axios.post(
    `${urlBase}/${envPath}/documentos-ecf`,
    payload,
    {
      timeout: 30_000,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${idToken}`,
        'X-API-KEY':     apiKey,
      },
    },
  );

  console.log('\n=== RESPUESTA MSELLER E31 ===');
  console.log(JSON.stringify(resp.data, null, 2));
  console.log('=== FIN RESPUESTA ===\n');

  if (resp.data.internalTrackId) {
    console.log('✅ E31 ACEPTADO POR MSELLER');
    console.log(`   eNCF:         ${encf}`);
    console.log(`   trackId:      ${resp.data.internalTrackId}`);
    console.log(`   securityCode: ${resp.data.securityCode}`);
    console.log(`   signedDate:   ${resp.data.signedDate}`);
    console.log(`   qr_url:       ${resp.data.qr_url}`);
  } else {
    console.error('❌ MSeller respondió sin trackId');
  }
}

main().catch(err => {
  if (err.response) {
    console.error('\n❌ Error MSeller:');
    console.error(`   HTTP ${err.response.status}`);
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('❌ Error:', err.message);
  }
  process.exit(1);
});
