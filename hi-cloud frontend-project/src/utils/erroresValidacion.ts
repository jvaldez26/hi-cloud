/**
 * Traduce los mensajes crudos de class-validator (siempre en inglés, uno por
 * campo que falló — "costoUnitario must be a number conforming to the
 * specified constraints") a algo legible en español. Vive en un solo lugar
 * para que TODA la app se beneficie (se usa desde el interceptor de Axios,
 * ver api/client.ts) en vez de que cada pantalla muestre el texto técnico
 * tal cual llega del backend.
 *
 * Si un mensaje no calza con ningún patrón conocido (errores de negocio que
 * YA vienen en español, o constraints que no cubrimos todavía), se devuelve
 * sin tocar — nunca hay que bloquear ni inventar texto.
 */

const ETIQUETAS_CAMPO: Record<string, string> = {
  costoUnitario: 'El costo unitario',
  cantidad: 'La cantidad',
  productoId: 'El producto',
  motivo: 'El motivo',
  referencia: 'La referencia',
  almacenId: 'El almacén',
  precioUnitario: 'El precio unitario',
  nombre: 'El nombre',
  email: 'El correo',
  monto: 'El monto',
  telefono: 'El teléfono',
};

function etiquetaCampo(campo: string): string {
  const conocida = ETIQUETAS_CAMPO[campo];
  if (conocida) return conocida;
  // "costoPromedio" → "campo "costo promedio""— seguro en género aunque no
  // sepamos el artículo correcto del sustantivo.
  const humano = campo.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return `El campo "${humano}"`;
}

interface Regla {
  patron: RegExp;
  mensaje: (campo: string, m: RegExpMatchArray) => string;
}

const REGLAS: Regla[] = [
  { patron: /^(\S+) must be a number conforming to the specified constraints$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser un número válido` },
  { patron: /^(\S+) must be a positive number$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser mayor que cero` },
  { patron: /^(\S+) must be an integer number$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser un número entero` },
  { patron: /^(\S+) must not be less than ([\d.]+)$/,
    mensaje: (c, m) => `${etiquetaCampo(c)} no puede ser menor que ${m[2]}` },
  { patron: /^(\S+) must not be greater than ([\d.]+)$/,
    mensaje: (c, m) => `${etiquetaCampo(c)} no puede ser mayor que ${m[2]}` },
  { patron: /^(\S+) should not be empty$/,
    mensaje: c => `${etiquetaCampo(c)} es obligatorio` },
  { patron: /^(\S+) must be a string$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser texto` },
  { patron: /^(\S+) must be longer than or equal to (\d+) characters$/,
    mensaje: (c, m) => `${etiquetaCampo(c)} debe tener al menos ${m[2]} caracteres` },
  { patron: /^(\S+) must be shorter than or equal to (\d+) characters$/,
    mensaje: (c, m) => `${etiquetaCampo(c)} no puede superar los ${m[2]} caracteres` },
  { patron: /^(\S+) must be a valid ISO 8601 date string$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser una fecha válida` },
  { patron: /^(\S+) must be an email$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser un correo válido` },
  { patron: /^(\S+) must be a boolean value$/,
    mensaje: c => `${etiquetaCampo(c)} debe ser verdadero o falso` },
];

/** Traduce UN mensaje de class-validator. Lo que no reconoce, lo deja igual. */
export function traducirMensajeValidacion(mensaje: string): string {
  for (const regla of REGLAS) {
    const m = mensaje.match(regla.patron);
    if (m) return regla.mensaje(m[1], m);
  }
  return mensaje;
}

/**
 * Para formularios que quieran resaltar el campo exacto (antd
 * `form.setFields`) en vez de solo mostrar un toast genérico — parsea el
 * array completo de mensajes de un 400 de class-validator (no solo el
 * primero, que es lo único que usa el toast genérico de api/client.ts) y
 * devuelve { nombreDeCampo: mensajeTraducido }.
 *
 * Devuelve undefined si la respuesta no trae ese array (errores de negocio
 * ya en español, con forma distinta) — el formulario cae a su manejo normal.
 */
export function extraerErroresPorCampo(err: unknown): Record<string, string> | undefined {
  const mensajes = (err as any)?.response?.data?.message;
  if (!Array.isArray(mensajes) || mensajes.length === 0) return undefined;

  const porCampo: Record<string, string> = {};
  for (const m of mensajes) {
    if (typeof m !== 'string') continue;
    const campo = m.match(/^(\S+) /)?.[1];
    if (!campo) continue;
    porCampo[campo] = traducirMensajeValidacion(m);
  }
  return Object.keys(porCampo).length > 0 ? porCampo : undefined;
}
