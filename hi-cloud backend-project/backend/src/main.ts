import './instrument';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

const bootLogger = new Logger('Bootstrap');

/**
 * Carga secretos desde AWS Secrets Manager en producción.
 * Ejecutar ANTES de crear la app para que ConfigService los vea.
 *
 * Configurar en AWS Console:
 *   Secrets Manager → Nuevo secreto → "hicloud/production"
 *   Valor JSON: { "DB_PASSWORD":"...", "JWT_SECRET":"...",
 *                 "SMTP_PASS":"...", "ECF_ENCRYPTION_KEY":"..." }
 */
async function loadSecretsIfProd(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  const secretName = process.env.AWS_SECRET_NAME ?? 'hicloud/production';
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-2' });
    const resp   = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    if (resp.SecretString) {
      const secrets = JSON.parse(resp.SecretString) as Record<string, string>;
      Object.assign(process.env, secrets);
      bootLogger.log(`${Object.keys(secrets).length} secretos cargados desde ${secretName}`);
    }
  } catch (e: any) {
    bootLogger.warn(
      `Secrets Manager no disponible (${e.message}) — usando variables del .env`,
    );
    // No fatal: si las variables están en .env el sistema funciona igual
  }
}

async function bootstrap() {
  await loadSecretsIfProd();

  // Advertencia si FRONTEND_URL apunta a localhost en producción
  const frontendUrl = process.env.FRONTEND_URL ?? '';
  if (process.env.NODE_ENV === 'production' && (!frontendUrl || frontendUrl.includes('localhost'))) {
    bootLogger.warn(
      `⚠️  FRONTEND_URL="${frontendUrl || '(vacío)'}" — los emails generarán links a localhost. ` +
      `Establece FRONTEND_URL=https://tudominio.com en el .env de producción.`,
    );
  }

  // bufferLogs: retiene los logs de arranque hasta que pino esté listo (useLogger).
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger estructurado pino como logger de la app: las 578 llamadas this.logger.*
  // existentes pasan a JSON sin tocar ningún call site.
  app.useLogger(app.get(PinoLogger));

  // Confiar en el proxy Nginx para que req.ip refleje la IP real del cliente.
  // Sin esto req.ip siempre es 127.0.0.1 y el throttler bloquea a todos juntos.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // ── Cookie parser — necesario para leer access_token de cookie httpOnly ──
  app.use(cookieParser());

  // Aumentar límite del body para permitir imágenes base64 (~10 MB máx).
  // verify: captura el buffer crudo antes de parsear — requerido por el guard HMAC
  // del webhook de MSeller (ecf-webhook.controller.ts). Sin esto rawBody=undefined
  // y la validación de firma nunca puede ejecutarse.
  app.use(require('express').json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; },
  }));
  app.use(require('express').urlencoded({ extended: true, limit: '10mb' }));

  const isDev = process.env.NODE_ENV !== 'production';

  const isProd = process.env.NODE_ENV === 'production';

  // ── Helmet — CSP permisivo solo en dev (Swagger), estricto en prod ──
  app.use(helmet({
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
        connectSrc:  ["'self'"],
        fontSrc:     ["'self'", 'https:'],
        objectSrc:   ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: isDev ? false : undefined,
    // HSTS: forzar HTTPS por 1 año en producción
    strictTransportSecurity: isProd
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    // X-Frame-Options: bloquear clickjacking
    frameguard:     { action: 'deny' },
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ── CORS ─────────────────────────────────────────────────────────
  // Siempre incluir origins de desarrollo local; en producción agregar
  // el dominio real via CORS_ORIGIN (puede ser lista separada por comas).
  const DEV_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:4200',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
    'http://127.0.0.1:3000',
  ];

  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(o => o && o !== '*')
    : [];

  const PROD_ORIGINS = [
    'https://hicloudrd.com',
    'https://www.hicloudrd.com',
  ];

  const allowedOrigins = [
    ...(isDev ? DEV_ORIGINS : []),
    ...PROD_ORIGINS,
    ...envOrigins,
  ];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Sin Origin: nginx proxy, health checks, scripts internas — no browsers.
      // Los browsers siempre envían Origin; requests sin Origin son internos
      // y no sujetos a CORS (CORS solo es enforced por browsers). Permitir.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origen no permitido → ${origin}`));
    },
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Empresa-ID'],
    credentials:    true,
    maxAge:         86_400, // cachear respuesta de preflight 24h (reduce OPTIONS requests)
  });

  // ── Prefijo global de la API ──────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validación global ─────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:             true,
      forbidNonWhitelisted:  true,
      transform:             true,
      transformOptions:      { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ── Swagger — disponible en /api ─────────────────────────────────
  const port = process.env.PORT ?? 3000;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HiCloud ERP API')
    .setDescription(
      `**Sistema ERP empresarial para República Dominicana**\n\n` +
      `Cumple con normativas DGII, TSS (Ley 87-01), Código de Trabajo y e-CF electrónico.\n\n` +
      `## Módulos disponibles\n` +
      `| Módulo | Prefijo |\n` +
      `|---|---|\n` +
      `| Autenticación | \`/api/v1/auth\` |\n` +
      `| Usuarios | \`/api/v1/users\` |\n` +
      `| Clientes | \`/api/v1/clientes\` |\n` +
      `| Productos | \`/api/v1/productos\` |\n` +
      `| Facturas | \`/api/v1/facturas\` |\n` +
      `| Proveedores | \`/api/v1/proveedores\` |\n` +
      `| Compras | \`/api/v1/compras\` |\n` +
      `| Inventario | \`/api/v1/inventario\` |\n` +
      `| e-CF DGII | \`/api/v1/ecf\` |\n` +
      `| Reportes | \`/api/v1/reportes\` |\n` +
      `| CxC | \`/api/v1/cxc\` |\n` +
      `| CxP | \`/api/v1/cxp\` |\n` +
      `| Contabilidad | \`/api/v1/contabilidad\` |\n` +
      `| Nómina | \`/api/v1/nomina\` |\n` +
      `| Tesorería | \`/api/v1/tesoreria\` |\n` +
      `| Activos Fijos | \`/api/v1/activos-fijos\` |\n\n` +
      `## Autenticación\n` +
      `1. Usa **POST /api/v1/auth/login** para obtener el token JWT.\n` +
      `2. Haz clic en **Authorize 🔓** e ingresa: \`Bearer <token>\``,
    )
    .setVersion('1.0.0')
    .setContact('HiCloud ERP', '', 'valdezgonzalez01@gmail.com')
    .setLicense('Privado', '')
    .addServer(`http://localhost:${port}`, 'Desarrollo local')
    .addBearerAuth(
      {
        type:         'http',
        scheme:       'bearer',
        bearerFormat: 'JWT',
        description:  'Ingresa el token JWT obtenido en POST /api/v1/auth/login',
        name:         'Authorization',
        in:           'header',
      },
      'access-token',
    )
    .build();

  // Swagger solo en desarrollo — en producción la ruta /api no existe
  if (isDev) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document, {
      customSiteTitle: 'HiCloud ERP — API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter:                 true,
        showExtensions:         true,
        tagsSorter:             'alpha',
        operationsSorter:       'alpha',
        docExpansion:           'none',
        defaultModelsExpandDepth: -1,
      },
    });
    bootLogger.log(`Swagger en http://localhost:${port}/api`);
  }

  await app.listen(port);

  bootLogger.log(`API lista en http://localhost:${port}/api/v1`);
}
bootstrap();
