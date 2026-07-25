/**
 * Tests de integración con la API real de MSeller en modo CERTIFICACION.
 *
 * Requisitos para ejecutarlos:
 *   MSELLER_TEST_EMAIL=tu_email@empresa.com
 *   MSELLER_TEST_PASSWORD=tu_password
 *   MSELLER_TEST_API_KEY=tu_api_key
 *   MSELLER_TEST_RNC=tu_rnc_emisor
 *   MSELLER_TEST_RAZON=Tu Razon Social
 *
 * Saltar en CI si no hay variables: las variables no definidas causan skip automático.
 *
 * Ejecutar solo estos tests:
 *   npx jest --testPathPattern="mseller-client.integration" --runInBand
 */
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { MSellerClientService } from './mseller-client.service';
import { EcfEncryptionService } from './ecf-encryption.service';
import { EcfConfigService } from './ecf-config.service';
import { ECFBuilderService } from './ecf-builder.service';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';
import { EcfValidacionError } from '../errors/ecf.errors';
import { of, throwError } from 'rxjs';
import { assertEmisorOrder } from '../builders/sections/emisor.section';

const {
  MSELLER_TEST_EMAIL,
  MSELLER_TEST_PASSWORD,
  MSELLER_TEST_API_KEY,
  MSELLER_TEST_RNC,
  MSELLER_TEST_RAZON = 'Empresa Test SRL',
  DB_HOST,
} = process.env;

const TIENE_CREDENCIALES = !!(
  MSELLER_TEST_EMAIL &&
  MSELLER_TEST_PASSWORD &&
  MSELLER_TEST_API_KEY &&
  MSELLER_TEST_RNC
);

const BASE_URL   = 'https://ecf.api.mseller.app';
const ENV_PATH   = 'CerteCF';  // CERTIFICACION
const EMPRESA_ID = 99_001;     // ID de prueba, nunca en producción

/** JSON de ejemplo e-CF E32 basado en la documentación de MSeller */
function buildPayloadE32(encf: string, rnc: string, razon: string) {
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2,'0');
  const mm = String(hoy.getMonth()+1).padStart(2,'0');
  const yyyy = hoy.getFullYear();
  const fecha = `${dd}-${mm}-${yyyy}`;
  const vence = `31-12-${yyyy + 1}`;

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: {
          TipoeCF:                   32,
          eNCF:                      encf,
          FechaVencimientoSecuencia: vence,
          IndicadorEnvioDiferido:    0,
          IndicadorMontoGravado:     1,
          TipoIngresos:              '01',
          TipoPago:                  1,
          TotalPaginas:              1,
        },
        Emisor: {
          RNCEmisor:         rnc,
          RazonSocialEmisor: razon,
          NombreComercial:   razon,
          DireccionEmisor:   'Av. 27 de Febrero, Santo Domingo',
          Municipio:         '10101',
          Provincia:         '01',
          FechaEmision:      fecha,
        },
        Comprador: {
          RNCComprador:         '00000000000',
          RazonSocialComprador: 'Consumidor Final',
        },
        Totales: {
          MontoGravadoTotal:  100.00,
          MontoGravadoI1:     100.00,
          MontoGravadoI2:     0,
          MontoExento:        0,
          ITBIS1:             18,
          ITBIS2:             0,
          TotalITBIS:         18.00,
          TotalITBIS1:        18.00,
          TotalITBIS2:        0,
          MontoTotal:         118.00,
          MontoNoFacturable:  0,
        },
      },
      DetallesItems: {
        Item: [{
          NumeroLinea:           1,
          IndicadorFacturacion:  1,
          NombreItem:            'Servicio de prueba integración',
          IndicadorBienoServicio: 2,
          CantidadItem:          1,
          UnidadMedida:          43,
          PrecioUnitarioItem:    100.00,
          DescuentoMonto:        0,
          MontoItem:             100.00,
          TablaSubDescuento: {
            SubDescuento: { TipoSubDescuento: '01', SubDescuentoPorcentaje: 0 },
          },
        }],
      },
      FechaHoraFirma: '',
    },
  };
}

// ── Helpers para llamadas directas (sin el servicio completo) ─────────────────

async function autenticar(): Promise<{ idToken: string }> {
  const resp = await axios.post(
    `${BASE_URL}/${ENV_PATH}/customer/authentication`,
    { email: MSELLER_TEST_EMAIL, password: MSELLER_TEST_PASSWORD },
    { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
  );
  return { idToken: resp.data.idToken };
}

// ── Suite principal ───────────────────────────────────────────────────────────

(TIENE_CREDENCIALES ? describe : describe.skip)(
  'MSellerClientService — integración CERTIFICACION',
  () => {
    let idToken: string;

    beforeAll(async () => {
      // Autenticar una vez para todos los tests
      const auth = await autenticar();
      idToken = auth.idToken;
    }, 20_000);

    it('autentica correctamente y devuelve idToken', () => {
      expect(idToken).toBeTruthy();
      expect(typeof idToken).toBe('string');
      expect(idToken.length).toBeGreaterThan(20);
    });

    it('construye y envía E31 a CERTIFICACION con el nuevo ECFBuilderService', async () => {
      const builderService = new ECFBuilderService();

      // eNCF único por timestamp para evitar duplicados en CERT
      const ts   = Date.now().toString().slice(-6);
      const encf = `E31${ts.padStart(13, '0')}`;

      const hoy          = new Date();
      const fechaVencSec = new Date(hoy.getFullYear() + 1, 11, 31);

      const mockConfig: any = {
        rncEmisor:         MSELLER_TEST_RNC!,
        razonSocialEmisor: MSELLER_TEST_RAZON,
        direccionEmisor:   'Av. 27 de Febrero #123, Santo Domingo',
        municipio:         undefined,
        provincia:         undefined,
        nombreComercial:   undefined,
        modo:              ModoEcf.CERTIFICACION,
        activo:            true,
      };

      const mockFactura: any = {
        fecha:    hoy,
        subtotal: 100,
        iva:      18,
        total:    118,
        cliente: {
          nombre:      MSELLER_TEST_RAZON,
          rncReceptor: MSELLER_TEST_RNC!,
          rfc:         null,
          direccion:   'Av. 27 de Febrero #123, Santo Domingo',
        },
        detalles: [{
          descripcion:    'Servicio de prueba E31 — ECFBuilderService',
          cantidad:       1,
          precioUnitario: 100,
          porcentajeIva:  18,
          importeIva:     18,
          subtotal:       100,
        }],
      };

      const payload = builderService.build(31, {
        encf,
        factura:      mockFactura,
        config:       mockConfig,
        fechaVencSec,
      });

      // ── Log del JSON completo ─────────────────────────────────────────────
      console.log('\n=== JSON E31 A ENVIAR A MSELLER ===');
      console.log(JSON.stringify(payload, null, 2));
      console.log('=== FIN JSON E31 ===\n');

      // ── Verificar orden del Emisor ────────────────────────────────────────
      const emisorKeys = Object.keys(payload.ECF.Encabezado.Emisor as Record<string, unknown>);
      console.log('Orden Emisor:', emisorKeys.join(' → '));
      assertEmisorOrder(payload.ECF.Encabezado.Emisor as object);
      expect(emisorKeys[emisorKeys.length - 1]).toBe('FechaEmision');

      // ── Enviar a MSeller CERTIFICACION ────────────────────────────────────
      const resp = await axios.post(
        `${BASE_URL}/${ENV_PATH}/documentos-ecf`,
        payload,
        {
          timeout: 30_000,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-API-KEY':     MSELLER_TEST_API_KEY!,
          },
        },
      );

      console.log('\n=== RESPUESTA MSELLER E31 ===');
      console.log(JSON.stringify(resp.data, null, 2));
      console.log('=== FIN RESPUESTA ===\n');

      // ── Verificar respuesta ───────────────────────────────────────────────
      expect(resp.status).toBe(200);
      expect(resp.data.internalTrackId).toBeTruthy();
      expect(resp.data.securityCode).toBeTruthy();
    }, 35_000);

    it('valida un documento E32 sin consumir secuencia (validate=true)', async () => {
      const encf = 'E320000000001'; // eNCF de prueba
      const payload = buildPayloadE32(encf, MSELLER_TEST_RNC!, MSELLER_TEST_RAZON);

      const resp = await axios.post(
        `${BASE_URL}/${ENV_PATH}/documentos-ecf?validate=true`,
        payload,
        {
          timeout: 15_000,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${idToken}`,
            'X-API-KEY':     MSELLER_TEST_API_KEY!,
          },
        },
      );

      expect(resp.status).toBe(200);
      expect(resp.data).toHaveProperty('valid');
      // Puede ser válido o inválido según el RNC — lo importante es que responde
      console.log('Validación:', JSON.stringify(resp.data, null, 2));
    }, 20_000);

    it('rechaza payload malformado con 400 y detalles de validación', async () => {
      const malformado = {
        ECF: {
          Encabezado: {
            Version: '1.0',
            IdDoc: { TipoeCF: 322 }, // tipo inválido
          },
        },
      };

      try {
        await axios.post(
          `${BASE_URL}/${ENV_PATH}/documentos-ecf?validate=true`,
          malformado,
          {
            timeout: 15_000,
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${idToken}`,
              'X-API-KEY':     MSELLER_TEST_API_KEY!,
            },
          },
        );
        fail('Debería haber lanzado 400');
      } catch (err: any) {
        expect(err.response?.status).toBe(400);
        console.log('Error de validación 400:', JSON.stringify(err.response?.data, null, 2));
      }
    }, 20_000);

    it('rechaza con 401 si el idToken es inválido', async () => {
      try {
        await axios.post(
          `${BASE_URL}/${ENV_PATH}/documentos-ecf`,
          buildPayloadE32('E320000000001', MSELLER_TEST_RNC!, MSELLER_TEST_RAZON),
          {
            timeout: 15_000,
            headers: {
              'Content-Type':  'application/json',
              'Authorization': 'Bearer token-invalido',
              'X-API-KEY':     MSELLER_TEST_API_KEY!,
            },
          },
        );
        fail('Debería haber lanzado 401');
      } catch (err: any) {
        expect([401, 403]).toContain(err.response?.status);
      }
    }, 15_000);
  },
);

// ── Tests unitarios del MSellerClientService (sin red) ────────────────────────

describe('MSellerClientService — unitarios', () => {
  let service: MSellerClientService;
  let httpService: jest.Mocked<HttpService>;

  const mockConfig = {
    email:    'test@empresa.com',
    password: 'pass',
    apiKey:   'key',
    urlBase:  BASE_URL,
    modo:     ModoEcf.TEST,
    envPath:  'TesteCF',
  };

  beforeEach(async () => {
    const mockEcfConfigSvc = {
      getCredencialesDescifradas: jest.fn().mockResolvedValue(mockConfig),
    };

    // El servicio pasó a cachear el idToken en CACHE_MANAGER (Redis en prod).
    // Sin este provider el módulo ni siquiera compilaba. Se usa un doble con Map
    // real —no jest.fn() vacíos— para que la aserción de "usa el cache y no
    // repite la llamada HTTP" siga comprobando algo de verdad.
    const store = new Map<string, unknown>();
    const mockCache = {
      get: jest.fn(async (k: string) => store.get(k)),
      set: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
      del: jest.fn(async (k: string) => { store.delete(k); }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MSellerClientService,
        { provide: HttpService, useValue: { post: jest.fn(), get: jest.fn() } },
        { provide: EcfConfigService, useValue: mockEcfConfigSvc },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service    = module.get<MSellerClientService>(MSellerClientService);
    httpService = module.get(HttpService);
  });

  it('autentica y cachea el token', async () => {
    
    (httpService.post as jest.Mock).mockReturnValueOnce(
      of({ data: { idToken: 'token-test', accessToken: 'at', refreshToken: 'rt' } }),
    );

    const result = await service.getIdToken(1);
    expect(result.idToken).toBe('token-test');

    // Segunda llamada usa el cache (no llama HTTP de nuevo)
    const result2 = await service.getIdToken(1);
    expect(result2.idToken).toBe('token-test');
    expect(httpService.post).toHaveBeenCalledTimes(1); // solo 1 llamada HTTP
  });

  it('invalida el token correctamente', async () => {
    
    (httpService.post as jest.Mock).mockReturnValue(
      of({ data: { idToken: 'token-nuevo', accessToken: 'at', refreshToken: 'rt' } }),
    );

    await service.getIdToken(1);
    service.invalidateToken(1);
    await service.getIdToken(1);

    expect(httpService.post).toHaveBeenCalledTimes(2); // re-autenticó
  });

  it('EcfValidacionError en respuesta 4xx (no reintentable)', async () => {

    // Auth → éxito; todas las llamadas siguientes → 400 (no reintentable)
    (httpService.post as jest.Mock)
      .mockReturnValueOnce(of({ data: { idToken: 'tok', accessToken: 'at', refreshToken: 'rt' } }))
      .mockReturnValue(
        throwError(() => ({
          response: { status: 400, data: { message: 'TipoeCF inválido', code: 'ECF_VALIDATION_FAILED' } },
        })),
      );

    // Payload mínimo con Emisor válido (guard verifica FechaEmision al final)
    const payload = {
      ECF: {
        Encabezado: {
          IdDoc: { eNCF: 'E320000000001' },
          Emisor: { RNCEmisor: '132269551', RazonSocialEmisor: 'Test SRL', DireccionEmisor: 'Av. Test', FechaEmision: '08-05-2026' },
        },
      },
    } as any;
    await expect(service.enviarDocumento(payload, 1)).rejects.toThrow(EcfValidacionError);
    // Solo 2 llamadas HTTP (auth + envío), sin reintentos
    expect(httpService.post).toHaveBeenCalledTimes(2);
  }, 15_000);
});
