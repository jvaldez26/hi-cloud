/**
 * Escapa texto para interpolarlo en el HTML de un email.
 *
 * S-65: los correos de aprobación/rechazo interpolaban directamente el nombre de
 * la empresa, el del usuario y el motivo. El nombre lo elige el cliente al
 * registrarse, así que podía inyectar etiquetas o enlaces en un correo enviado
 * desde el dominio de HiCloud.
 *
 * Para atributos entrecomillados escapa también comillas simples y dobles.
 */
export function escapeHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
