/**
 * Datos de prueba para el motor v2 de Prestamista (Fase 2A/2B).
 *
 * Requiere `npm run migration:run` (aplica 1772000000000-MotorV2Prestamista).
 * No depende de `npm run seed` — busca una empresa demo existente (por RNC
 * 132414691 o, si no existe, 000000001 "HiCloud ERP Demo") y vincula ahí
 * mismo a admin@hicloud.com como admin principal si no lo estaba.
 *
 * Crea/actualiza:
 *   - el módulo add-on "prestamista" activo para esa empresa
 *   - 7 productos de préstamo, uno por cada combinación de frecuencia/método
 *     que cubre el motor (ver docs/prestamista/motor-financiero.md)
 *   - 1 deudor de prueba
 *
 * Uso: npm run seed:prestamista-motor
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
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
  logging:     ['error'],
});

const RNCS_EMPRESA_DEMO = ['132414691', '000000001'];

function motorConfigBase(overrides: Record<string, unknown>) {
  return {
    tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
    mora: { base: 'cuota_vencida', tasaOMonto: 0.03, baseDiasMora: 360 },
    fiscal: {},
    permiteAjusteSolicitud: true,
    ...overrides,
  };
}

const PRODUCTOS = [
  {
    nombre: 'Diaria sin domingos',
    frecuenciaPago: 'diaria',
    metodoAmortizacion: 'frances',
    plazoMinimoMeses: 1, plazoMaximoMeses: 1,
    motorConfig: motorConfigBase({
      frecuencia: 'diaria', metodo: 'frances',
      frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: false },
    }),
  },
  {
    nombre: 'Semanal',
    frecuenciaPago: 'semanal',
    metodoAmortizacion: 'frances',
    plazoMinimoMeses: 1, plazoMaximoMeses: 12,
    motorConfig: motorConfigBase({ frecuencia: 'semanal', metodo: 'frances' }),
  },
  {
    nombre: 'Quincenal',
    frecuenciaPago: 'quincenal',
    metodoAmortizacion: 'frances',
    plazoMinimoMeses: 1, plazoMaximoMeses: 24,
    motorConfig: motorConfigBase({
      frecuencia: 'quincenal', metodo: 'frances',
      frecuenciaQuincenal: { modo: 'dias_fijos' },
    }),
  },
  {
    nombre: 'Mensual Francés',
    frecuenciaPago: 'mensual',
    metodoAmortizacion: 'frances',
    plazoMinimoMeses: 1, plazoMaximoMeses: 60,
    motorConfig: motorConfigBase({ frecuencia: 'mensual', metodo: 'frances' }),
  },
  {
    nombre: 'Mensual Alemán',
    frecuenciaPago: 'mensual',
    metodoAmortizacion: 'aleman',
    plazoMinimoMeses: 1, plazoMaximoMeses: 60,
    motorConfig: motorConfigBase({ frecuencia: 'mensual', metodo: 'aleman' }),
  },
  {
    nombre: 'Mensual Flat',
    frecuenciaPago: 'mensual',
    metodoAmortizacion: 'flat',
    plazoMinimoMeses: 1, plazoMaximoMeses: 24,
    motorConfig: motorConfigBase({ frecuencia: 'mensual', metodo: 'flat' }),
  },
  {
    nombre: 'Pago Único',
    frecuenciaPago: 'unico',
    metodoAmortizacion: 'frances',
    plazoMinimoMeses: 1, plazoMaximoMeses: 1,
    motorConfig: motorConfigBase({ frecuencia: 'unico', metodo: 'frances' }),
  },
];

async function run(): Promise<void> {
  await AppDataSource.initialize();
  console.log('\n✅ Conectado a la BD:', process.env.DB_NAME ?? 'hicloud');
  const em = AppDataSource.createEntityManager();

  const [empresa] = await em.query(
    `SELECT id, nombre FROM empresa WHERE rnc = ANY($1) ORDER BY id LIMIT 1`, [RNCS_EMPRESA_DEMO],
  );
  if (!empresa) {
    console.error(`\n❌ No existe ninguna empresa demo (RNC ${RNCS_EMPRESA_DEMO.join(' / ')}). Crea una empresa primero.`);
    await AppDataSource.destroy();
    process.exit(1);
  }
  const empresaId = empresa.id;
  console.log(`🏢 Empresa demo: #${empresaId} ${empresa.nombre}`);

  // 0. Admin principal vinculado a esa empresa (admin@hicloud.com / Admin1234, creado por `npm run seed`)
  const [admin] = await em.query(`SELECT id FROM users WHERE email = $1`, ['admin@hicloud.com']);
  if (admin) {
    const [vinculoAdmin] = await em.query(
      `SELECT id FROM usuario_empresa WHERE "userId"=$1 AND "empresaId"=$2`, [admin.id, empresaId],
    );
    if (vinculoAdmin) {
      await em.query(
        `UPDATE usuario_empresa SET rol='admin', "isPrincipal"=true, "isActive"=true WHERE id=$1`, [vinculoAdmin.id],
      );
    } else {
      await em.query(`UPDATE usuario_empresa SET "isPrincipal"=false WHERE "userId"=$1`, [admin.id]);
      await em.query(
        `INSERT INTO usuario_empresa ("userId","empresaId",rol,"isPrincipal","isActive","createdAt","updatedAt")
         VALUES ($1,$2,'admin',true,true,NOW(),NOW())`,
        [admin.id, empresaId],
      );
    }
    console.log(`✅ admin@hicloud.com (Admin1234) vinculado como admin principal de la empresa #${empresaId}`);
  } else {
    console.log('ℹ️  No existe admin@hicloud.com todavía — corre `npm run seed` para crearlo, o usa un usuario propio ya vinculado a esta empresa.');
  }

  // 1. Módulo add-on "prestamista" activo para la empresa demo
  const [modulo] = await em.query(`SELECT id FROM modulos_addon WHERE codigo = $1`, ['prestamista']);
  if (!modulo) {
    await em.query(
      `INSERT INTO modulos_addon (codigo, nombre, descripcion, "isActive", "activacionAutomatica")
       VALUES ($1,$2,$3,true,true)`,
      ['prestamista', 'Prestamista', 'Préstamos y financiamiento'],
    );
    console.log('✅ modulos_addon.prestamista creado');
  }
  const [vinculo] = await em.query(
    `SELECT id FROM empresa_modulos WHERE "empresaId"=$1 AND "moduloCodigo"=$2`, [empresaId, 'prestamista'],
  );
  if (vinculo) {
    await em.query(`UPDATE empresa_modulos SET activo=true WHERE id=$1`, [vinculo.id]);
    console.log('🔄 empresa_modulos.prestamista ya existía — reactivado');
  } else {
    await em.query(
      `INSERT INTO empresa_modulos ("empresaId","moduloCodigo",activo,origen,"esCortesia")
       VALUES ($1,$2,true,'manual',true)`,
      [empresaId, 'prestamista'],
    );
    console.log('✅ Módulo "prestamista" activado para la empresa demo');
  }

  // 2. Productos — uno por frecuencia/método
  for (const p of PRODUCTOS) {
    const [existente] = await em.query(
      `SELECT id FROM pr_productos_prestamo WHERE "empresaId"=$1 AND nombre=$2`, [empresaId, p.nombre],
    );
    if (existente) {
      await em.query(
        `UPDATE pr_productos_prestamo SET "frecuenciaPago"=$1,"metodoAmortizacion"=$2,
           "plazoMinimoMeses"=$3,"plazoMaximoMeses"=$4,"motorConfig"=$5,"isActive"=true
         WHERE id=$6`,
        [p.frecuenciaPago, p.metodoAmortizacion, p.plazoMinimoMeses, p.plazoMaximoMeses,
         JSON.stringify(p.motorConfig), existente.id],
      );
      console.log(`🔄 Producto actualizado: ${p.nombre} (id=${existente.id})`);
      continue;
    }
    const [{ id }] = await em.query(
      `INSERT INTO pr_productos_prestamo
         ("empresaId",nombre,"tipoCredito",descripcion,"montoMinimo","montoMaximo",
          "tasaInteresMensual","tipoTasa","plazoMinimoMeses","plazoMaximoMeses","frecuenciaPago",
          "metodoAmortizacion","porcentajeMora","cargoCierre","porcentajeCargoCierre","diasGracia",
          "requiereGarantia","requiereGarante","motorConfig")
       VALUES ($1,$2,'personal',$3,1000,500000,3,'mensual',$4,$5,$6,$7,3,0,0,0,false,false,$8)
       RETURNING id`,
      [empresaId, p.nombre, `Producto de prueba — ${p.nombre} (motor v2)`,
       p.plazoMinimoMeses, p.plazoMaximoMeses, p.frecuenciaPago, p.metodoAmortizacion,
       JSON.stringify(p.motorConfig)],
    );
    console.log(`✅ Producto creado: ${p.nombre} (id=${id})`);
  }

  // 3. Deudor de prueba
  const [deudorExistente] = await em.query(
    `SELECT id FROM pr_deudores WHERE "empresaId"=$1 AND cedula=$2`, [empresaId, '00100000001'],
  );
  if (deudorExistente) {
    console.log(`🔄 Deudor de prueba ya existía (id=${deudorExistente.id})`);
  } else {
    const [{ id }] = await em.query(
      `INSERT INTO pr_deudores
         ("empresaId",nombre,apellidos,cedula,telefono,email,direccion,ocupacion,"ingresoMensual","nivelRiesgo",estado)
       VALUES ($1,'Deudor','Demo Motor V2','00100000001','8095551234','deudor.demo@hicloud.test',
               'Calle Prueba #1, Santo Domingo','Empleado',35000,'bajo','activo')
       RETURNING id`,
      [empresaId],
    );
    console.log(`✅ Deudor de prueba creado (id=${id})`);
  }

  console.log('\n🎉 Listo — productos y deudor de prueba disponibles en la empresa demo.\n');
  await AppDataSource.destroy();
}

run().catch(async (err) => {
  console.error('\n❌ Error:', err);
  await AppDataSource.destroy().catch(() => {});
  process.exit(1);
});
