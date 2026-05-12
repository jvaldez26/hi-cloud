/**
 * HiCloud ERP — Migración segura de tablas faltantes
 * Crea tablas y tipos que TypeORM no pudo crear por colisión de índice.
 *
 * Uso: npm run db:migrate
 */

import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const AppDataSource = new DataSource({
  type:        'postgres',
  host:        process.env.DB_HOST     ?? 'localhost',
  port:        Number(process.env.DB_PORT ?? 5432),
  username:    process.env.DB_USERNAME ?? 'postgres',
  password:    process.env.DB_PASSWORD ?? 'Higlobal4691',
  database:    process.env.DB_NAME     ?? 'hicloud',
  synchronize: false,
  logging:     false,
});

async function typeExists(em: EntityManager, name: string): Promise<boolean> {
  const r = await em.query(`SELECT 1 FROM pg_type WHERE typname = $1`, [name]);
  return r.length > 0;
}

async function tableExists(em: EntityManager, name: string): Promise<boolean> {
  const r = await em.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return r.length > 0;
}

async function createEnum(em: EntityManager, name: string, values: string[]): Promise<void> {
  if (await typeExists(em, name)) return;
  const vals = values.map(v => `'${v}'`).join(',');
  await em.query(`CREATE TYPE "public"."${name}" AS ENUM(${vals})`);
  console.log(`  🔤 Tipo enum ${name} creado`);
}

async function migrate(): Promise<void> {
  console.log('\n🔧 HiCloud ERP — Migración de tablas faltantes\n');
  await AppDataSource.initialize();
  console.log('✅ Conectado a la BD\n');

  const em = AppDataSource.createEntityManager();
  let created = 0;

  // ── Helper ─────────────────────────────────────────────────────────
  async function crearTabla(nombre: string, sql: string): Promise<void> {
    if (await tableExists(em, nombre)) {
      console.log(`  ⏭️  ${nombre} (ya existe)`);
      return;
    }
    await em.query(sql);
    console.log(`  ✅ ${nombre} creada`);
    created++;
  }

  // ── 1. vendedores ──────────────────────────────────────────────────
  await crearTabla('vendedores', `
    CREATE TABLE "vendedores" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "codigo" varchar(10) NOT NULL,
      "nombre" varchar(150) NOT NULL,
      "cedula" varchar(11),
      "email" varchar(100),
      "telefono" varchar(20),
      "zona" varchar(100),
      "cargo" varchar(60),
      "comisionPct" numeric(5,2) NOT NULL DEFAULT 5,
      "metaMensual" numeric(12,2) NOT NULL DEFAULT 0,
      "usuarioId" integer,
      "fechaIngreso" date,
      "notas" text,
      "activo" boolean NOT NULL DEFAULT true
    )`);

  // ── 2. vendedor_clientes ───────────────────────────────────────────
  await crearTabla('vendedor_clientes', `
    CREATE TABLE "vendedor_clientes" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "vendedorId" integer NOT NULL,
      "clienteId" integer NOT NULL,
      "fechaAsignacion" date NOT NULL
    )`);

  // ── 3. recibos_cobro ──────────────────────────────────────────────
  await createEnum(em, 'recibos_cobro_metodopago_enum', ['efectivo','transferencia','cheque','tarjeta','otro']);
  await crearTabla('recibos_cobro', `
    CREATE TABLE "recibos_cobro" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "numero" varchar(20) NOT NULL,
      "fecha" date NOT NULL,
      "clienteId" integer NOT NULL,
      "clienteNombre" varchar(200),
      "monto" numeric(14,2) NOT NULL,
      "metodoPago" "public"."recibos_cobro_metodopago_enum" NOT NULL DEFAULT 'efectivo',
      "concepto" varchar(300) NOT NULL,
      "facturaId" integer,
      "facturaFolio" varchar(20),
      "cxcId" integer,
      "referencia" varchar(100),
      "usuarioId" integer NOT NULL,
      "nombreUsuario" varchar(150),
      "notas" text
    )`);

  // ── 4. pre_factura_detalles ────────────────────────────────────────
  await crearTabla('pre_factura_detalles', `
    CREATE TABLE "pre_factura_detalles" (
      "id" SERIAL PRIMARY KEY,
      "preFacturaId" integer NOT NULL,
      "productoId" integer,
      "descripcion" varchar(300) NOT NULL,
      "unidadMedida" varchar(20) NOT NULL DEFAULT 'PZA',
      "cantidad" numeric(12,4) NOT NULL,
      "precioUnitario" numeric(12,2) NOT NULL,
      "porcentajeIva" numeric(5,2) NOT NULL DEFAULT 18,
      "subtotal" numeric(12,2) NOT NULL,
      "iva" numeric(12,2) NOT NULL,
      "total" numeric(12,2) NOT NULL
    )`);

  // ── 5. pre_facturas ────────────────────────────────────────────────
  await createEnum(em, 'pre_facturas_estado_enum', ['borrador','enviada','aprobada','rechazada','convertida','vencida']);
  await crearTabla('pre_facturas', `
    CREATE TABLE "pre_facturas" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "folio" varchar(20) NOT NULL,
      "fecha" date NOT NULL,
      "fechaVencimiento" date,
      "estado" "public"."pre_facturas_estado_enum" NOT NULL DEFAULT 'borrador',
      "clienteId" integer NOT NULL,
      "usuarioId" integer NOT NULL,
      "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
      "iva" numeric(12,2) NOT NULL DEFAULT 0,
      "total" numeric(12,2) NOT NULL DEFAULT 0,
      "tipoNcf" varchar(10) DEFAULT 'E32',
      "facturaId" integer,
      "conduceId" integer,
      "sucursalId" integer,
      "vendedorId" integer,
      "nombreVendedor" varchar(150),
      "notas" text,
      "motivoRechazo" text,
      "condicionesPago" varchar(50),
      "validezDias" integer DEFAULT 30,
      "nombreVendedorStr" varchar(150)
    )`);

  // ── 6. periodos_contables ──────────────────────────────────────────
  await createEnum(em, 'periodos_contables_estado_enum', ['abierto','cerrado','bloqueado']);
  await crearTabla('periodos_contables', `
    CREATE TABLE "periodos_contables" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "anio" integer NOT NULL,
      "mes" integer NOT NULL,
      "nombre" varchar(50) NOT NULL,
      "fechaInicio" date NOT NULL,
      "fechaFin" date NOT NULL,
      "estado" "public"."periodos_contables_estado_enum" NOT NULL DEFAULT 'abierto',
      "totalDebitos" numeric(14,2) NOT NULL DEFAULT 0,
      "totalCreditos" numeric(14,2) NOT NULL DEFAULT 0,
      "cantidadAsientos" integer NOT NULL DEFAULT 0,
      "cerradoPorId" integer,
      "fechaCierre" TIMESTAMP,
      "notasCierre" text,
      UNIQUE("empresaId","anio","mes")
    )`);

  // ── 7. nota_debito_detalles ────────────────────────────────────────
  await crearTabla('nota_debito_detalles', `
    CREATE TABLE "nota_debito_detalles" (
      "id" SERIAL PRIMARY KEY,
      "notaDebitoId" integer NOT NULL,
      "productoId" integer,
      "descripcion" varchar(300) NOT NULL,
      "unidadMedida" varchar(20) NOT NULL DEFAULT 'PZA',
      "cantidad" numeric(12,4) NOT NULL,
      "precioUnitario" numeric(12,2) NOT NULL,
      "porcentajeIva" numeric(5,2) NOT NULL DEFAULT 18,
      "subtotal" numeric(12,2) NOT NULL,
      "iva" numeric(12,2) NOT NULL,
      "total" numeric(12,2) NOT NULL
    )`);

  // ── 8. notas_debito ────────────────────────────────────────────────
  await createEnum(em, 'notas_debito_motivo_enum', ['cargo_adicional','ajuste_precio','intereses','flete_adicional','diferencia_cambio','otro']);
  await createEnum(em, 'notas_debito_estado_enum', ['borrador','emitida','anulada']);
  await crearTabla('notas_debito', `
    CREATE TABLE "notas_debito" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "numero" varchar(20) NOT NULL,
      "fecha" date NOT NULL,
      "tipoNcf" varchar(10) NOT NULL DEFAULT 'E33',
      "facturaOriginalId" integer,
      "facturaOriginalFolio" varchar(20),
      "clienteId" integer NOT NULL,
      "usuarioId" integer NOT NULL,
      "motivo" "public"."notas_debito_motivo_enum" NOT NULL DEFAULT 'cargo_adicional',
      "descripcionMotivo" text,
      "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
      "iva" numeric(12,2) NOT NULL DEFAULT 0,
      "total" numeric(12,2) NOT NULL DEFAULT 0,
      "estado" "public"."notas_debito_estado_enum" NOT NULL DEFAULT 'borrador',
      "vendedorId" integer,
      "nombreVendedor" varchar(150),
      "notas" text
    )`);

  // ── 9. nota_credito_compra_detalles ───────────────────────────────
  await crearTabla('nota_credito_compra_detalles', `
    CREATE TABLE "nota_credito_compra_detalles" (
      "id" SERIAL PRIMARY KEY,
      "notaCreditoCompraId" integer NOT NULL,
      "productoId" integer,
      "descripcion" varchar(300) NOT NULL,
      "unidadMedida" varchar(20) NOT NULL DEFAULT 'PZA',
      "cantidad" numeric(12,4) NOT NULL,
      "precioUnitario" numeric(12,2) NOT NULL,
      "porcentajeIva" numeric(5,2) NOT NULL DEFAULT 18,
      "subtotal" numeric(12,2) NOT NULL,
      "iva" numeric(12,2) NOT NULL,
      "total" numeric(12,2) NOT NULL
    )`);

  // ── 10. notas_credito_compras ──────────────────────────────────────
  await createEnum(em, 'notas_credito_compras_motivo_enum', ['devolucion','descuento','ajuste','otro']);
  await createEnum(em, 'notas_credito_compras_estado_enum', ['borrador','emitida','anulada']);
  await crearTabla('notas_credito_compras', `
    CREATE TABLE "notas_credito_compras" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "numero" varchar(20) NOT NULL,
      "fecha" date NOT NULL,
      "proveedorId" integer NOT NULL,
      "compraOriginalId" integer,
      "compraOriginalFolio" varchar(20),
      "motivo" "public"."notas_credito_compras_motivo_enum" NOT NULL DEFAULT 'devolucion',
      "descripcionMotivo" text,
      "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
      "iva" numeric(12,2) NOT NULL DEFAULT 0,
      "total" numeric(12,2) NOT NULL DEFAULT 0,
      "estado" "public"."notas_credito_compras_estado_enum" NOT NULL DEFAULT 'borrador',
      "usuarioId" integer NOT NULL,
      "notas" text
    )`);

  // ── 11. programa_fidelidad ─────────────────────────────────────────
  await crearTabla('programa_fidelidad', `
    CREATE TABLE "programa_fidelidad" (
      "id" SERIAL PRIMARY KEY,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "empresaId" integer,
      "nombre" varchar(100) NOT NULL,
      "descripcion" text,
      "puntosPerDOP" numeric(8,4) NOT NULL DEFAULT 1,
      "DopPerPunto" numeric(8,4) NOT NULL DEFAULT 1,
      "puntosMinCanje" integer NOT NULL DEFAULT 100,
      "activo" boolean NOT NULL DEFAULT true
    )`);

  // ── Resumen ────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────────────────`);
  if (created === 0) {
    console.log('✅ Todas las tablas ya existían — BD al día');
  } else {
    console.log(`✅ ${created} tabla(s) creadas correctamente`);
  }
  console.log('─────────────────────────────────────────────\n');

  await AppDataSource.destroy();
}

migrate().catch(err => {
  console.error('\n❌ Error en migración:', err.message ?? err);
  process.exit(1);
});
