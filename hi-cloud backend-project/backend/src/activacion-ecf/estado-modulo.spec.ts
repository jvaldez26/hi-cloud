import { ActivacionEcfService } from './activacion-ecf.service';
import { EstadoSolicitudActivacion } from './entities/solicitud-activacion-ecf.entity';

/**
 * Quién ve el módulo "Activar factura electrónica" y qué ve.
 *
 * UN SOLO SITIO DECIDE: lo consultan el menú lateral y la pantalla. Si cada uno
 * calculara por su cuenta, el menú podría mostrar una entrada que lleva a algo
 * que no corresponde.
 */

function servicio(opts: {
  config?: { activo: boolean; modo: string; tieneCredenciales: boolean } | null;
  solicitud?: any;
}) {
  const svc = new ActivacionEcfService(
    { findOne: async () => opts.solicitud ?? null } as any,   // repo
    {} as any,                                                // certificadoSvc
    { getEmpresaId: () => 1 } as any,                         // tenant
    {} as any,                                                // s3
    {} as any,                                                // intentos
    { query: async () => (opts.config ? [opts.config] : []) } as any,
  );
  return svc;
}

const CONFIG_PRODUCCION = { activo: true, modo: 'PRODUCCION', tieneCredenciales: true };

describe('estado() — cuándo se ve el módulo', () => {
  describe('empresa que YA factura electrónicamente', () => {
    it('config activa, en PRODUCCIÓN y con credenciales: no se ve', async () => {
      const r = await servicio({ config: CONFIG_PRODUCCION }).estado();
      expect(r.visible).toBe(false);
      expect(r.modo).toBe('ya-activo');
    });

    it('la última solicitud en "activada" también oculta el módulo', async () => {
      // Tapa la ventana: si se marca activada ANTES de configurar MSeller, sin
      // esta rama al cliente le volvería a salir el formulario de alta como si
      // nunca hubiera pedido nada.
      const r = await servicio({
        config: null,
        solicitud: { id: 3, estado: EstadoSolicitudActivacion.ACTIVADA },
      }).estado();
      expect(r.visible).toBe(false);
      expect(r.modo).toBe('ya-activo');
    });
  });

  describe('TEST no cuenta como activo', () => {
    it('config en TEST: el módulo SIGUE visible', async () => {
      // En TEST la empresa todavía no factura de verdad. Ocultarle el módulo la
      // dejaría sin vía para pedir que le terminen la activación.
      const r = await servicio({
        config: { activo: true, modo: 'TEST', tieneCredenciales: true },
      }).estado();
      expect(r.visible).toBe(true);
      expect(r.modo).toBe('formulario');
    });

    it('activo pero SIN credenciales: fila creada y sin configurar, sigue visible', async () => {
      const r = await servicio({
        config: { activo: true, modo: 'PRODUCCION', tieneCredenciales: false },
      }).estado();
      expect(r.visible).toBe(true);
    });

    it('config inactiva: visible', async () => {
      const r = await servicio({
        config: { activo: false, modo: 'PRODUCCION', tieneCredenciales: true },
      }).estado();
      expect(r.visible).toBe(true);
    });

    it('sin ninguna config: visible con el formulario', async () => {
      const r = await servicio({ config: null }).estado();
      expect(r.visible).toBe(true);
      expect(r.modo).toBe('formulario');
      expect(r.solicitud).toBeNull();
    });
  });

  describe('solicitud en curso: se ve el estado, no el formulario', () => {
    for (const estado of [
      EstadoSolicitudActivacion.PENDIENTE_PAGO,
      EstadoSolicitudActivacion.PAGO_RECIBIDO,
      EstadoSolicitudActivacion.EN_PROCESO,
    ]) {
      it(`en ${estado} muestra el estado`, async () => {
        const r = await servicio({
          config: null, solicitud: { id: 9, estado },
        }).estado();
        expect(r.visible).toBe(true);
        expect(r.modo).toBe('estado-solicitud');
        expect(r.solicitud?.id).toBe(9);   // y con los datos, para pintarlo
      });
    }

    it('una solicitud RECHAZADA no bloquea: se puede volver a intentar', async () => {
      const r = await servicio({
        config: null,
        solicitud: { id: 4, estado: EstadoSolicitudActivacion.RECHAZADA },
      }).estado();
      expect(r.visible).toBe(true);
      expect(r.modo).toBe('formulario');   // formulario, no estado
      expect(r.solicitud).toBeNull();
    });
  });

  describe('precedencia', () => {
    it('"ya activo" gana sobre una solicitud en curso', async () => {
      // Config lista y una solicitud vieja sin cerrar: lo que manda es que ya
      // factura.
      const r = await servicio({
        config: CONFIG_PRODUCCION,
        solicitud: { id: 1, estado: EstadoSolicitudActivacion.PENDIENTE_PAGO },
      }).estado();
      expect(r.modo).toBe('ya-activo');
      expect(r.visible).toBe(false);
    });
  });
});
