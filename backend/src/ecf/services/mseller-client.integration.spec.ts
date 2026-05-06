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
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { MSellerClientService } from './mseller-client.service';
import { EcfEncryptionService } from './ecf-encryption.service';
import { EcfConfigService } from './ecf-config.service';
import { ECFBuilderService } from './ecf-builder.service';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MSellerClientService,
        { provide: HttpService, useValue: { post: jest.fn(), get: jest.fn() } },
        { provide: EcfConfigService, useValue: mockEcfConfigSvc },
      ],
    }).compile();

    service    = module.get<MSellerClientService>(MSellerClientService);
    httpService = module.get(HttpService);
  });

  it('autentica y cachea el token', async () => {
    const { of } = await import('rxjs');
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
    const { of } = await import('rxjs');
    (httpService.post as jest.Mock).mockReturnValue(
      of({ data: { idToken: 'token-nuevo', accessToken: 'at', refreshToken: 'rt' } }),
    );

    await service.getIdToken(1);
    service.invalidateToken(1);
    await service.getIdToken(1);

    expect(httpService.post).toHaveBeenCalledTimes(2); // re-autenticó
  });

  it('EcfValidacionError en respuesta 4xx (no reintentable)', async () => {
    const { EcfValidacionError } = await import('../errors/ecf.errors');
    const { throwError, of } = await import('rxjs');

    // Auth mock
    (httpService.post as jest.Mock).mockReturnValueOnce(
      of({ data: { idToken: 'tok', accessToken: 'at', refreshToken: 'rt' } }),
    );
    // Envío → 400
    (httpService.post as jest.Mock).mockReturnValueOnce(
      throwError(() => ({
        response: { status: 400, data: { message: 'TipoeCF inválido', code: 'ECF_VALIDATION_FAILED' } },
      })),
    );

    const payload = {} as any;
    await expect(service.enviarDocumento(payload, 1)).rejects.toThrow(EcfValidacionError);
    // Solo 2 llamadas HTTP (auth + envío), sin reintentos
    expect(httpService.post).toHaveBeenCalledTimes(2);
  });
});
