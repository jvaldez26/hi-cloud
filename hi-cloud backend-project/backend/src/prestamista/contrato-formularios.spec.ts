/**
 * Etapa 1 (auditoría Prestamista) — tests de contrato.
 *
 * Mismo patrón que xlink/dto/vincular-xlink.dto.spec.ts: corre el
 * ValidationPipe REAL de main.ts (whitelist + forbidNonWhitelisted +
 * transform) contra el payload EXACTO que cada formulario construye hoy en
 * el frontend — no una aproximación. Si el frontend cambia un nombre de
 * campo o un valor de un Select, este archivo falla antes de que llegue a
 * producción.
 *
 * Por qué existe: la auditoría encontró 3 formularios rotos end-to-end
 * (Solicitudes "decidir", Simulador, Registrar Pago) y, al escribir estos
 * tests, aparecieron 4 más (Solicitudes "crear", Solicitudes "decidir" —
 * con MÁS campos de los ya corregidos —, el desembolso de Préstamos, la
 * gestión de Cobranza) que ninguna lectura manual había detectado. Cada
 * caso "payload real" de abajo es el que REALMENTE construye hoy la
 * pantalla correspondiente — si alguno cambia, cambiar el test junto con el
 * código, nunca al revés.
 */
import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import {
  CrearSolicitudDto, DecidirSolicitudDto, CrearPrestamoDto, SimularPrestamoDto,
  RegistrarPagoDto, CrearGarantiaDto, RegistrarGestionDto, CrearDeudorDto,
  CrearProductoPrestamoDto, CrearVehiculoDto, CancelarPrestamoDto,
} from './dto/prestamista.dto';
import { CrearFeriadoDto, ActualizarFeriadoDto } from './dto/prestamista-motor.dto';

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function aceptaPayloadReal(metatype: any, payload: Record<string, unknown>) {
  await expect(pipe.transform(payload, { type: 'body' as const, metatype, data: '' }))
    .resolves.toBeDefined();
}

describe('Contrato de formularios — Prestamista (ValidationPipe real)', () => {
  describe('SolicitudesPage.tsx — Nueva Solicitud (CrearSolicitudDto)', () => {
    it('acepta el payload real (sin vehiculoId: se excluye en el frontend; con fecha)', () =>
      aceptaPayloadReal(CrearSolicitudDto, {
        deudorId: 3, productoId: 9, montoSolicitado: 50000, plazoMeses: 12,
        fechaSolicitud: '2026-10-09', proposito: 'Capital de trabajo', notas: 'Cliente referido',
      }));

    it('acepta el payload mínimo (campos opcionales nunca tocados por el usuario)', () =>
      aceptaPayloadReal(CrearSolicitudDto, { deudorId: 3, montoSolicitado: 50000, plazoMeses: 12 }));

    it('Fase 2B: acepta el ajuste de frecuencia (punto 3 — "si el producto lo permite")', () =>
      aceptaPayloadReal(CrearSolicitudDto, {
        deudorId: 3, productoId: 9, montoSolicitado: 50000, plazoMeses: 12, frecuenciaPago: 'quincenal',
      }));

    it('REGRESIÓN: si volviera a mandarse `productoPrestamo` (nombre viejo) o `vehiculoId`, 400', async () => {
      await expect(pipe.transform(
        { deudorId: 3, productoPrestamo: 9, montoSolicitado: 50000, plazoMeses: 12 },
        { type: 'body', metatype: CrearSolicitudDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform(
        { deudorId: 3, vehiculoId: 1, montoSolicitado: 50000, plazoMeses: 12 },
        { type: 'body', metatype: CrearSolicitudDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('SolicitudesPage.tsx — Registrar Decisión (DecidirSolicitudDto)', () => {
    it('acepta el payload real completo (decision ya en el vocabulario del DTO + tasaAprobada + motivoDecision)', () =>
      aceptaPayloadReal(DecidirSolicitudDto, {
        decision: 'aprobada', montoAprobado: 45000, tasaAprobada: 3.5, motivoDecision: 'Buen historial',
      }));

    it('acepta rechazar sin los campos opcionales de aprobación', () =>
      aceptaPayloadReal(DecidirSolicitudDto, { decision: 'rechazada' }));

    it('REGRESIÓN: el vocabulario viejo (\'aprobar\'/\'rechazar\') vuelve a fallar si reaparece', async () => {
      await expect(pipe.transform(
        { decision: 'aprobar' },
        { type: 'body', metatype: DecidirSolicitudDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('SimuladorPage.tsx — Simular (SimularPrestamoDto, motor v2 — Fase 2B)', () => {
    it('acepta el payload real del Simulador rediseñado (motor v2 completo)', () =>
      aceptaPayloadReal(SimularPrestamoDto, {
        montoPrincipal: 100000, fechaDesembolso: '2026-10-01', fechaPrimerPago: '2026-11-01', plazoPeriodos: 12,
        frecuencia: 'mensual',
        tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
        metodo: 'frances',
      }));

    it('acepta diaria con exclusión de domingos/feriados', () =>
      aceptaPayloadReal(SimularPrestamoDto, {
        montoPrincipal: 10000, fechaDesembolso: '2026-10-01', fechaPrimerPago: '2026-10-02', plazoPeriodos: 30,
        frecuencia: 'diaria', frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: true },
        tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
        metodo: 'frances',
      }));

    it('acepta gracia y cargos', () =>
      aceptaPayloadReal(SimularPrestamoDto, {
        montoPrincipal: 100000, fechaDesembolso: '2026-10-01', fechaPrimerPago: '2026-11-01', plazoPeriodos: 12,
        frecuencia: 'mensual',
        tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
        metodo: 'frances',
        gracia: { tipo: 'capital', periodos: 2 },
        cargos: [{ concepto: 'Seguro', tipo: 'fijo', monto: 500, momento: 'por_cuota' }],
      }));

    it('REGRESIÓN: el vocabulario viejo (principal/plazoMeses/fechaPrimerPago sin tasa estructurada) vuelve a fallar si reaparece', async () => {
      await expect(pipe.transform(
        { principal: 100000, tasaInteresMensual: 3, plazoMeses: 12, metodoAmortizacion: 'frances', fechaPrimerPago: '2026-11-01' },
        { type: 'body', metatype: SimularPrestamoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('PrestamosPage.tsx — Nuevo Préstamo / Desembolso (CrearPrestamoDto)', () => {
    it('acepta el payload real (sin cuentaBancariaId, observaciones ya mapeado a notas, fecha como string)', () =>
      aceptaPayloadReal(CrearPrestamoDto, {
        solicitudId: 5, fechaDesembolso: '2026-10-09', notas: 'Desembolso en ventanilla',
      }));

    it('acepta el payload mínimo (sin observaciones)', () =>
      aceptaPayloadReal(CrearPrestamoDto, { solicitudId: 5, fechaDesembolso: '2026-10-09' }));

    it('REGRESIÓN: si volviera a mandarse cuentaBancariaId u observaciones sin mapear, 400', async () => {
      await expect(pipe.transform(
        { solicitudId: 5, fechaDesembolso: '2026-10-09', cuentaBancariaId: 7 },
        { type: 'body', metatype: CrearPrestamoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform(
        { solicitudId: 5, fechaDesembolso: '2026-10-09', observaciones: 'x' },
        { type: 'body', metatype: CrearPrestamoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('CancelarPrestamoDto', () => {
    it('acepta el payload real del modal de cancelar', () =>
      aceptaPayloadReal(CancelarPrestamoDto, { motivo: 'Liquidado por fuera, a solicitud del cliente' }));
  });

  describe('DetallePrestamo.tsx — Registrar Pago (RegistrarPagoDto)', () => {
    it('acepta el payload real (metodoPago/notas/claveIdempotencia, sin fechaPago ni formaPago crudos)', () =>
      aceptaPayloadReal(RegistrarPagoDto, {
        prestamoId: 5, montoPagado: 5000, metodoPago: 'efectivo', referencia: 'REC-001',
        notas: 'Pago en ventanilla', claveIdempotencia: '11111111-1111-4111-8111-111111111111',
      }));

    it('REGRESIÓN: si volviera a mandarse formaPago/fechaPago/observaciones crudos, 400', async () => {
      await expect(pipe.transform(
        { prestamoId: 5, montoPagado: 5000, formaPago: 'efectivo' },
        { type: 'body', metatype: RegistrarPagoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform(
        { prestamoId: 5, montoPagado: 5000, fechaPago: '2026-10-09' },
        { type: 'body', metatype: RegistrarPagoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('DetallePrestamo.tsx — Agregar Garantía (CrearGarantiaDto)', () => {
    it('acepta el payload real (sin fechaTasacion, que se excluye en el frontend)', () =>
      aceptaPayloadReal(CrearGarantiaDto, {
        prestamoId: 5, deudorId: 3, tipo: 'vehiculo', descripcion: 'Toyota Corolla 2020',
        valorTasado: 350000, notas: 'Tasación de referencia',
      }));

    it('REGRESIÓN: si volviera a mandarse fechaTasacion (sin columna en pr_garantias), 400', async () => {
      await expect(pipe.transform(
        { prestamoId: 5, deudorId: 3, tipo: 'vehiculo', descripcion: 'x', fechaTasacion: '2026-10-09' },
        { type: 'body', metatype: CrearGarantiaDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('CobranzaPage.tsx — Registrar Gestión (RegistrarGestionDto)', () => {
    it('acepta el payload real (tipo/proximaGestion/descripcion, valores alineados a @IsIn)', () =>
      aceptaPayloadReal(RegistrarGestionDto, {
        prestamoId: 5, tipo: 'llamada', resultado: 'promesa_pago',
        proximaGestion: '2026-10-20', descripcion: 'Promete pagar el viernes',
      }));

    it('acepta cada valor del Select de tipo tras el fix (llamada/visita/mensaje/carta/acuerdo/legal/otro)', async () => {
      for (const tipo of ['llamada', 'visita', 'mensaje', 'carta', 'acuerdo', 'legal', 'otro']) {
        await aceptaPayloadReal(RegistrarGestionDto, { prestamoId: 5, tipo, descripcion: 'x' });
      }
    });

    it('acepta cada valor del Select de resultado tras el fix', async () => {
      for (const resultado of ['promesa_pago', 'sin_respuesta', 'pago_parcial', 'negado', 'exitoso']) {
        await aceptaPayloadReal(RegistrarGestionDto, { prestamoId: 5, descripcion: 'x', resultado });
      }
    });

    it('REGRESIÓN: los nombres/valores viejos (tipoGestion, fechaProximaGestion, notas, acuerdo_pago, judicial, contactado) vuelven a fallar si reaparecen', async () => {
      await expect(pipe.transform(
        { prestamoId: 5, tipoGestion: 'llamada', notas: 'x' },
        { type: 'body', metatype: RegistrarGestionDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform(
        { prestamoId: 5, descripcion: 'x', tipo: 'acuerdo_pago' },
        { type: 'body', metatype: RegistrarGestionDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
      await expect(pipe.transform(
        { prestamoId: 5, descripcion: 'x', resultado: 'contactado' },
        { type: 'body', metatype: RegistrarGestionDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('DeudoresPage.tsx — Nuevo/Editar Deudor (CrearDeudorDto)', () => {
    it('acepta el payload real del formulario (incluido nivelRiesgo="critico")', () =>
      aceptaPayloadReal(CrearDeudorDto, {
        nombre: 'Juan Pérez', apellidos: 'Pérez Gómez', cedula: '00112345678', telefono: '8095551234',
        email: 'juan@example.com', ocupacion: 'Comerciante', empresaLabora: 'Colmado El Buen Precio',
        ingresoMensual: 35000, estadoCivil: 'casado', nivelRiesgo: 'critico',
        direccion: 'Calle Principal #1', notas: 'Cliente conocido',
      }));
  });

  describe('ProductosPrestamoPage.tsx — Nuevo/Editar Producto (CrearProductoPrestamoDto)', () => {
    it('acepta el payload real tras quitar frecuenciaPago (sin efecto en el motor) y con tipoCredito', () =>
      aceptaPayloadReal(CrearProductoPrestamoDto, {
        nombre: 'Préstamo Vehicular', tasaInteresMensual: 2.5, metodoAmortizacion: 'frances',
        tipoCredito: 'vehiculo', porcentajeMora: 5, diasGracia: 3, cargoCierre: 1000,
        plazoMinimoMeses: 6, plazoMaximoMeses: 48, montoMinimo: 50000, montoMaximo: 1000000,
        requiereGarantia: true, requiereGarante: false, descripcion: 'Financiamiento de vehículos',
      }));

    it("REGRESIÓN: 'americano' ya no es un método válido (el motor no lo calcula)", async () => {
      await expect(pipe.transform(
        { nombre: 'X', tasaInteresMensual: 3, metodoAmortizacion: 'americano' },
        { type: 'body', metatype: CrearProductoPrestamoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el formulario ya no necesita mandar frecuenciaPago (se quitó del Select, sin efecto en el motor)', () =>
      aceptaPayloadReal(CrearProductoPrestamoDto, { nombre: 'X', tasaInteresMensual: 3 }));

    it('Fase 2B: acepta motorConfig completo (frecuencia diaria, gracia, cargos, mora, fiscal vacío)', () =>
      aceptaPayloadReal(CrearProductoPrestamoDto, {
        nombre: 'Préstamo Diario', tasaInteresMensual: 3,
        motorConfig: {
          frecuencia: 'diaria',
          frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: true },
          tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
          metodo: 'frances',
          gracia: { tipo: 'capital', periodos: 3 },
          cargos: [
            { concepto: 'Comisión de apertura', tipo: 'porcentaje', monto: 2, momento: 'desembolso', tratamientoDesembolso: 'financiado' },
            { concepto: 'Seguro', tipo: 'fijo', monto: 150, momento: 'por_cuota' },
          ],
          mora: { base: 'cuota_vencida', tasaOMonto: 5, baseDiasMora: 360 },
          fiscal: {
            interes: { generaComprobante: null, tipoEcf: null, tratamientoItbis: null },
            mora: { generaComprobante: null, tipoEcf: null, tratamientoItbis: null },
          },
          permiteAjusteSolicitud: true,
        },
      }));

    it('Fase 2B: acepta motorConfig con frecuencia quincenal de días fijos', () =>
      aceptaPayloadReal(CrearProductoPrestamoDto, {
        nombre: 'Préstamo Quincenal', tasaInteresMensual: 3,
        motorConfig: {
          frecuencia: 'quincenal', frecuenciaQuincenal: { modo: 'dias_fijos' },
          tasa: { valor: 0.015, periodoExpresado: 'quincenal', tipo: 'nominal', baseDias: 360 },
          metodo: 'aleman',
        },
      }));

    it('REGRESIÓN: un motorConfig con un método inválido (fuera de la lista del motor) da 400', async () => {
      await expect(pipe.transform(
        { nombre: 'X', tasaInteresMensual: 3, motorConfig: { frecuencia: 'mensual', tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, metodo: 'inventado' } },
        { type: 'body', metatype: CrearProductoPrestamoDto, data: '' },
      )).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('FeriadosPage.tsx — Calendario de feriados (CrearFeriadoDto / ActualizarFeriadoDto)', () => {
    it('acepta crear un feriado', () =>
      aceptaPayloadReal(CrearFeriadoDto, { anio: 2026, fecha: '2026-05-01', nombre: 'Día del Trabajo' }));

    it('acepta actualizar solo el campo confirmado (al verificar el feriado trasladable del año)', () =>
      aceptaPayloadReal(ActualizarFeriadoDto, { confirmado: true }));

    it('acepta actualizar fecha y nombre juntos', () =>
      aceptaPayloadReal(ActualizarFeriadoDto, { fecha: '2026-05-02', nombre: 'Día del Trabajo (trasladado)' }));
  });

  describe('VehiculosPage.tsx — Nuevo/Editar Vehículo (CrearVehiculoDto)', () => {
    it('acepta el payload real (fecha ya formateada a string por el frontend)', () =>
      aceptaPayloadReal(CrearVehiculoDto, {
        placa: 'A123456', chasis: '1HGCM82633A004352', motor: 'M-0001', marca: 'Toyota', modelo: 'Corolla',
        anio: 2020, color: 'Gris', tipoVehiculo: 'sedan', valorMercado: 450000, valorFactura: 480000,
        aseguradora: 'Seguros Universal', polizaSeguro: 'POL-0001', fechaVencePoliza: '2027-01-01', activo: true,
      }));
  });
});
