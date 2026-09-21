import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PASO 0(a) — 42 facturas de CONTADO que, por un hueco del pipeline de
 * despliegue (workers viejos sirviendo tráfico real hasta 3h21min después
 * de que el fix del motor de venta por medio de pago se diera por
 * desplegado — commit d91de0b3, 2026-09-20), debitaron Clientes por el
 * neto completo en vez de Caja/Bancos por su medio de pago real. El
 * pipeline ya está corregido (commits c73b4b79/f6851d35: verifica
 * build_id contra /api/v1/version antes de dar el job en verde — cero
 * casos desde entonces). Esto es la corrección de DATOS de los 42 que ya
 * quedaron mal clasificados mientras tanto.
 *
 * LISTA HARDCODEADA a propósito, no un criterio de búsqueda — a diferencia
 * de la migración de redondeo (1766400000000), que sí vuelve a calcular su
 * propia lista en cada corrida: el patrón "contado debitando Clientes" NO
 * es, por sí solo, una señal inequívoca de este incidente (una factura de
 * contado mal cargada a mano produciría el mismo patrón y NO debe
 * tocarse). Los 42 IDs se obtuvieron diagnosticando la ventana exacta del
 * incidente (2026-09-20 15:27–18:49, hora RD) contra el respaldo de
 * producción de esa madrugada — ver el registro de esta sesión.
 *
 * Por cada factura, esta migración vuelve a verificar en vivo (nunca
 * confía en el diagnóstico congelado en la lista):
 *   1. La factura no está CANCELADA.
 *   2. No tiene recibo de cobro ni nota de crédito activos — cualquiera de
 *      los dos significa que ya hay actividad económica encima de esta
 *      venta que una reclasificación silenciosa podría desordenar.
 *   3. Su asiento de venta (tipoOrigen='factura') TODAVÍA debita Clientes
 *      — si ya no lo hace (alguien lo corrigió a mano, o los datos
 *      cambiaron), se salta: no hay nada que reclasificar.
 *   4. No existe ya un asiento de reclasificación para esta factura —
 *      idempotencia: correr esta migración dos veces no duplica nada.
 * Si CUALQUIER condición falla, esa factura se salta y se registra en el
 * log — nunca aborta las demás.
 *
 * tipoOrigen='ajuste' — el mismo cajón multipropósito que ya usan gastos,
 * nómina, mantenimiento y devoluciones (ver el comentario de NOTA_CREDITO
 * en asiento-contable.entity.ts), cada uno namespaced por su propio
 * "espacio" de referenciaId. Se descartó agregar un TipoOrigenAsiento
 * nuevo: `ALTER TYPE ... ADD VALUE` no es seguro de usar en la MISMA
 * sesión de Postgres que lo agrega —ni siquiera en una transacción
 * POSTERIOR ya confirmada— y el runner de migraciones de este proyecto
 * corre TODAS las pendientes en un solo proceso/conexión (ver [3/6] en
 * deploy.yml), así que una migración "agregar el valor" + otra "usarlo" en
 * el MISMO despliegue habría fallado en producción exactamente como falló
 * en la primera prueba contra el respaldo restaurado (error 55P04 de
 * Postgres, "uso inseguro del nuevo valor del tipo enum"). La idempotencia
 * del punto 4 se resuelve entonces por tipoOrigen='ajuste' +
 * referenciaId=facturaId + el prefijo fijo de la descripción
 * ('Reclasificación de contado —'), no por un tipoOrigen dedicado.
 *
 * El asiento ORIGINAL de la venta NUNCA se edita ni se revierte — esto no
 * es un error en el monto ni en las cuentas de Ventas/ITBIS, así que
 * tocarlo sería más invasivo que necesario. En su lugar, un asiento NUEVO
 * mueve el saldo: Haber Clientes (lo cancela) / Debe la cuenta real del
 * medio de pago (efectivo→Caja, tarjeta/transferencia/cheque→ vía el mismo
 * concepto configurable que usa el motor en vivo, con el mismo respaldo a
 * Bancos/Caja). Fechado en la fecha de la FACTURA, no en la fecha de esta
 * migración — el efecto
 * económico ocurrió el día de la venta, no hoy.
 */
export class ReclasificarFacturasContadoPostFaseA1766600000000 implements MigrationInterface {
  name = 'ReclasificarFacturasContadoPostFaseA1766600000000';

  // id, empresaId, folio — el resto (estado, formasPago, fecha, total) se
  // relee EN VIVO desde `facturas` en vez de congelarlo aquí: si algo
  // cambió desde el diagnóstico, esta migración debe verlo, no repetir un
  // dato viejo.
  private readonly FACTURAS: { id: number; empresaId: number; folio: string }[] = [
    { id: 20078, empresaId: 44, folio: 'FAC-15420' },
    { id: 20079, empresaId: 44, folio: 'FAC-15421' },
    { id: 20080, empresaId: 44, folio: 'FAC-15422' },
    { id: 20081, empresaId: 44, folio: 'FAC-15423' },
    { id: 20082, empresaId: 44, folio: 'FAC-15424' },
    { id: 20083, empresaId: 44, folio: 'FAC-15425' },
    { id: 20084, empresaId: 44, folio: 'FAC-15426' },
    { id: 20085, empresaId: 44, folio: 'FAC-15427' },
    { id: 20086, empresaId: 44, folio: 'FAC-15428' },
    { id: 20087, empresaId: 44, folio: 'FAC-15429' },
    { id: 20088, empresaId: 44, folio: 'FAC-15430' },
    { id: 20089, empresaId: 44, folio: 'FAC-15431' },
    { id: 20092, empresaId: 44, folio: 'FAC-15432' },
    { id: 20093, empresaId: 44, folio: 'FAC-15433' },
    { id: 20096, empresaId: 44, folio: 'FAC-15434' },
    { id: 20097, empresaId: 44, folio: 'FAC-15435' },
    { id: 20098, empresaId: 44, folio: 'FAC-15436' },
    { id: 20099, empresaId: 44, folio: 'FAC-15437' },
    { id: 20100, empresaId: 44, folio: 'FAC-15438' },
    { id: 20102, empresaId: 44, folio: 'FAC-15439' },
    { id: 20103, empresaId: 44, folio: 'FAC-15440' },
    { id: 20090, empresaId: 42, folio: 'FAC-1772'  },
    { id: 20105, empresaId: 42, folio: 'FAC-1773'  },
    { id: 20109, empresaId: 42, folio: 'FAC-1774'  },
    { id: 20111, empresaId: 42, folio: 'FAC-1775'  },
    { id: 20113, empresaId: 42, folio: 'FAC-1776'  },
    { id: 20116, empresaId: 42, folio: 'FAC-1777'  },
    { id: 20117, empresaId: 42, folio: 'FAC-1778'  },
    { id: 20119, empresaId: 42, folio: 'FAC-1779'  },
    { id: 20107, empresaId: 53, folio: 'FAC-384'   },
    { id: 20108, empresaId: 53, folio: 'FAC-385'   },
    { id: 20091, empresaId: 61, folio: 'FAC-1543'  },
    { id: 20094, empresaId: 61, folio: 'FAC-1544'  },
    { id: 20095, empresaId: 61, folio: 'FAC-1545'  },
    { id: 20101, empresaId: 61, folio: 'FAC-1546'  },
    { id: 20104, empresaId: 61, folio: 'FAC-1547'  },
    { id: 20106, empresaId: 61, folio: 'FAC-1548'  },
    { id: 20110, empresaId: 61, folio: 'FAC-1549'  },
    { id: 20112, empresaId: 61, folio: 'FAC-1550'  },
    { id: 20114, empresaId: 61, folio: 'FAC-1551'  },
    { id: 20115, empresaId: 61, folio: 'FAC-1552'  },
    { id: 20118, empresaId: 61, folio: 'FAC-1553'  },
  ];

  private readonly CODIGO_CLIENTES = '1.1.2.01';
  private readonly CODIGO_CAJA     = '1.1.1.02';
  private readonly CODIGO_BANCOS   = '1.1.1.03';

  // Mismo mapa que METODO_POR_TIPO_FORMA_PAGO en asientos-automaticos.service.ts.
  private readonly METODO_POR_TIPO: Record<number, string> = {
    1: 'efectivo', 2: 'transferencia', 3: 'tarjeta', 5: 'permuta', 6: 'nc',
  };
  // Mismo mapa que CONCEPTO_POR_METODO_PAGO — concepto configurable por empresa.
  private readonly CONCEPTO_POR_METODO: Record<string, string> = {
    efectivo: 'CAJA', tarjeta: 'COBRO_TARJETA', transferencia: 'COBRO_TRANSFERENCIA', cheque: 'COBRO_CHEQUE',
  };

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    let corregidas = 0;
    const saltadas: { id: number; folio: string; motivo: string }[] = [];

    for (const f of this.FACTURAS) {
      const [factura] = await qr.query(`
        SELECT id, folio, fecha::text, estado, total, "formasPago", "empresaId", "usuarioId"
        FROM facturas WHERE id = $1 AND "empresaId" = $2 AND "isActive" = true
      `, [f.id, f.empresaId]);

      if (!factura) { saltadas.push({ id: f.id, folio: f.folio, motivo: 'factura no encontrada' }); continue; }
      if (factura.estado === 'cancelada') { saltadas.push({ id: f.id, folio: f.folio, motivo: 'factura cancelada' }); continue; }

      const [{ n: tieneRecibo }] = await qr.query(
        `SELECT COUNT(*)::int AS n FROM recibos_cobro WHERE "facturaId" = $1 AND "isActive" = true`, [f.id],
      );
      if (tieneRecibo > 0) { saltadas.push({ id: f.id, folio: f.folio, motivo: `tiene ${tieneRecibo} recibo(s) de cobro` }); continue; }

      const [{ n: tieneNC }] = await qr.query(
        `SELECT COUNT(*)::int AS n FROM notas_credito WHERE "facturaOriginalId" = $1 AND "isActive" = true`, [f.id],
      );
      if (tieneNC > 0) { saltadas.push({ id: f.id, folio: f.folio, motivo: `tiene ${tieneNC} nota(s) de crédito` }); continue; }

      const [yaReclasificada] = await qr.query(`
        SELECT id FROM asientos_contables
        WHERE "tipoOrigen" = 'ajuste' AND "referenciaId" = $1 AND "empresaId" = $2 AND "isActive" = true
          AND descripcion LIKE 'Reclasificación de contado —%'
      `, [f.id, f.empresaId]);
      if (yaReclasificada) { saltadas.push({ id: f.id, folio: f.folio, motivo: 'ya reclasificada (idempotencia)' }); continue; }

      const [asientoVenta] = await qr.query(`
        SELECT id FROM asientos_contables
        WHERE "tipoOrigen" = 'factura' AND "referenciaId" = $1 AND "empresaId" = $2 AND "isActive" = true
      `, [f.id, f.empresaId]);
      if (!asientoVenta) { saltadas.push({ id: f.id, folio: f.folio, motivo: 'sin asiento de venta activo' }); continue; }

      const cuentaClientes = await this.resolverCuentaPorCodigo(qr, f.empresaId, this.CODIGO_CLIENTES);
      const [lineaClientes] = await qr.query(`
        SELECT id, debe FROM asiento_lineas
        WHERE "asientoId" = $1 AND "cuentaContableId" = $2 AND "isActive" = true AND debe > 0
      `, [asientoVenta.id, cuentaClientes]);
      if (!lineaClientes) {
        saltadas.push({ id: f.id, folio: f.folio, motivo: 'el asiento de venta ya NO debita Clientes — nada que reclasificar' });
        continue;
      }

      const monto = Number(lineaClientes.debe);
      const formasPago: { tipo: number; monto: number }[] = factura.formasPago ?? [];
      const entradasReales = formasPago.filter(p => p.tipo !== 4 && Number(p.monto) > 0);

      const lineasDebe: { cuentaId: number; monto: number; metodo: string }[] = [];
      if (entradasReales.length) {
        for (const entrada of entradasReales) {
          const metodo  = this.METODO_POR_TIPO[entrada.tipo] ?? 'otro';
          const cuentaId = await this.resolverCuentaPorMetodoPago(qr, f.empresaId, metodo);
          lineasDebe.push({ cuentaId, monto: +Number(entrada.monto).toFixed(2), metodo });
        }
      } else {
        // Legacy sin formasPago — todo a Caja, igual que el motor en vivo.
        lineasDebe.push({ cuentaId: await this.resolverCuentaPorCodigo(qr, f.empresaId, this.CODIGO_CAJA), monto, metodo: 'efectivo (legacy)' });
      }

      const sumaDebe = +lineasDebe.reduce((s, l) => s + l.monto, 0).toFixed(2);
      if (Math.abs(sumaDebe - monto) > 0.02) {
        saltadas.push({ id: f.id, folio: f.folio, motivo: `formasPago (${sumaDebe}) no cuadra contra el débito de Clientes (${monto}) — revisar a mano` });
        continue;
      }

      const [{ id: nuevoAsientoId }] = await qr.query(`
        INSERT INTO asientos_contables
          (numero, fecha, descripcion, "tipoOrigen", "referenciaId", "referenciaFolio", estado, "totalDebe", "totalHaber", "userId", "empresaId")
        VALUES
          ('REC-' || $1::int::text, $2::date, $3, 'ajuste', $1::int, $4, 'contabilizado', $5, $5, $6, $7)
        RETURNING id
      `, [f.id, factura.fecha, `Reclasificación de contado — ${factura.folio}`, factura.folio, monto, factura.usuarioId, f.empresaId]);

      await qr.query(`
        INSERT INTO asiento_lineas ("asientoId","cuentaContableId",descripcion,debe,haber,"empresaId","isActive")
        VALUES ($1,$2,$3,0,$4,$5,true)
      `, [nuevoAsientoId, cuentaClientes, `Reversa de Clientes — ${factura.folio}`, monto, f.empresaId]);

      for (const l of lineasDebe) {
        await qr.query(`
          INSERT INTO asiento_lineas ("asientoId","cuentaContableId",descripcion,debe,haber,"empresaId","isActive")
          VALUES ($1,$2,$3,$4,0,$5,true)
        `, [nuevoAsientoId, l.cuentaId, `Cobro ${l.metodo} (reclasificado) — ${factura.folio}`, l.monto, f.empresaId]);
      }

      await qr.query(`
        INSERT INTO audit_logs
          (accion, modulo, entidad, "entidadId", descripcion, "valorAnterior", "valorNuevo",
           metodo, ruta, exitoso, nivel, "empresaId", "createdAt")
        VALUES
          ('create', 'contabilidad', 'AsientoContable', $1, $2, $3, $4,
           'MIGRATE', '/migrations/1766600000000', true, 'CRITICO', $5, NOW())
      `, [
        String(nuevoAsientoId),
        `Reclasificación de contado — factura ${factura.folio}: RD$${monto.toFixed(2)} movido de Clientes a ${lineasDebe.map(l => l.metodo).join('+')}`,
        JSON.stringify({ asientoOriginalId: asientoVenta.id, cuentaClientes: this.CODIGO_CLIENTES, monto }),
        JSON.stringify({ asientoNuevoId: nuevoAsientoId, lineas: lineasDebe }),
        f.empresaId,
      ]);

      corregidas++;
      console.log(`[ReclasificarContado] ${factura.folio} (id ${f.id}, empresa ${f.empresaId}) — RD$${monto.toFixed(2)} reclasificado → asiento #${nuevoAsientoId}`);
    }

    console.log(`[ReclasificarContado] ${corregidas} factura(s) corregida(s) de ${this.FACTURAS.length} candidata(s)`);
    if (saltadas.length) {
      console.log(`[ReclasificarContado] ${saltadas.length} saltada(s): ${JSON.stringify(saltadas)}`);
    }
  }

  /** Cuenta por código exacto — lanza si no existe (Clientes/Caja se garantizan por FASE A commit 1). */
  private async resolverCuentaPorCodigo(qr: QueryRunner, empresaId: number, codigo: string): Promise<number> {
    const [cuenta] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId" = $1 AND codigo = $2 AND "isActive" = true`,
      [empresaId, codigo],
    );
    if (!cuenta) throw new Error(`Cuenta ${codigo} no existe para empresa ${empresaId} — no se puede reclasificar`);
    return cuenta.id;
  }

  /** Resuelve el concepto configurable de la empresa (configuraciones_cuentas_contables) con el mismo respaldo que el motor en vivo. */
  private async resolverCuentaPorMetodoPago(qr: QueryRunner, empresaId: number, metodo: string): Promise<number> {
    const concepto = this.CONCEPTO_POR_METODO[metodo] ?? 'COBRO_OTRO';
    const fallbackCodigo = metodo === 'efectivo' ? this.CODIGO_CAJA : this.CODIGO_BANCOS;

    const [config] = await qr.query(
      `SELECT "cuentaCodigo" FROM configuraciones_cuentas_contables WHERE "empresaId" = $1 AND concepto = $2 AND "isActive" = true`,
      [empresaId, concepto],
    );
    const codigo = config?.cuentaCodigo ?? fallbackCodigo;

    const [cuenta] = await qr.query(
      `SELECT id FROM cuentas_contables WHERE "empresaId" = $1 AND codigo = $2 AND "isActive" = true`,
      [empresaId, codigo],
    );
    if (cuenta) return cuenta.id;

    // La cuenta configurada no existe en el catálogo — mismo respaldo a Caja
    // que resolverCuentaPorMetodoPago() en el motor en vivo.
    console.log(`[ReclasificarContado] ⚠️  Cuenta ${codigo} (concepto ${concepto}) no existe para empresa ${empresaId} — se usa Caja como respaldo`);
    return this.resolverCuentaPorCodigo(qr, empresaId, this.CODIGO_CAJA);
  }

  public async down(): Promise<void> {
    // No reversible sin riesgo — mismo criterio que el resto de
    // migraciones de corrección contable de esta sesión: no hay forma de
    // distinguir esta línea de una escrita a mano después, sin una marca
    // dedicada.
  }
}
