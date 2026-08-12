import { Modal, Button } from 'antd';
import { useState, useEffect } from 'react';

/**
 * Advertencia de comprador con RNC no vigente ante DGII, compartida por todos
 * los caminos de emisión.
 *
 * La regla del backend (ecf/rules/comprador-vigente.rule.ts) advierte pero no
 * impide: responde COMPRADOR_NO_VIGENTE con confirmable:true y emite si se
 * reintenta con `confirmaRncNoVigente`. Si un camino de emisión muestra ese
 * mensaje sin ofrecer dónde confirmar, la emisión queda trabada de hecho —
 * pasó con el botón "Emitir" del listado de facturas. Por eso el aviso y su
 * casilla viven aquí y no sueltos en cada pantalla.
 */

/** Forma del error que devuelve el backend cuando falta confirmar. */
export interface ErrorRncNoVigente {
  message:     string;
  codigo:      'COMPRADOR_NO_VIGENTE';
  estadoRnc?:  string;
  rnc?:        string;
  confirmable: true;
}

/**
 * Extrae el error de RNC no vigente de una respuesta de axios, o null si el
 * fallo es cualquier otra cosa. Usarlo para decidir entre abrir el modal de
 * confirmación y mostrar un toast normal.
 *
 * El filtro global (common/filters/http-exception.filter.ts) aplana el cuerpo:
 * el texto queda en `errors[0]` y los campos extra del BadRequestException
 * suben al nivel raíz. No existe `data.message`.
 */
export function detectarRncNoVigente(err: any): ErrorRncNoVigente | null {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') return null;
  if (data.codigo !== 'COMPRADOR_NO_VIGENTE') return null;

  return {
    message:     data.errors?.[0] ?? data.message ?? 'El RNC del comprador no está vigente ante DGII.',
    codigo:      'COMPRADOR_NO_VIGENTE',
    estadoRnc:   data.estadoRnc,
    rnc:         data.rnc,
    confirmable: true,
  };
}

const COLOR = {
  fondo:  '#FFFBEB',
  borde:  '#FCD34D',
  texto:  '#92400E',
};

interface AvisoProps {
  /** Estado que reportó el padrón: SUSPENDIDO, DADO DE BAJA… */
  estadoRnc?: string;
  /** Tipo de comprobante en juego (E31, E44, E45) */
  tipoNcf?:   string;
  checked:    boolean;
  onChange:   (v: boolean) => void;
  /** Texto que ya viene del backend; si falta se arma uno equivalente */
  mensaje?:   string;
}

/**
 * Casilla ámbar de confirmación. Se usa embebida donde ya hay un contenedor
 * (el modal de cobro del POS) y dentro de ModalRncNoVigente donde no lo hay.
 */
export function AvisoRncNoVigente({ estadoRnc, tipoNcf, checked, onChange, mensaje }: AvisoProps) {
  const texto = mensaje ?? (
    `Este RNC está ${estadoRnc ?? 'no vigente'} ante la DGII. El crédito fiscal ` +
    `del ${tipoNcf ?? 'comprobante'} podría no serle reconocido al comprador.`
  );

  return (
    <label style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
      background: COLOR.fondo, border: `1px solid ${COLOR.borde}`, borderRadius: 6,
      padding: '8px 10px', fontSize: 12, lineHeight: 1.45, color: COLOR.texto,
    }}>
      <input
        type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
      />
      <span>{texto}</span>
    </label>
  );
}

interface ModalProps {
  /** El error devuelto por el backend; null cierra el modal */
  error:      ErrorRncNoVigente | null;
  /** Etiqueta de lo que se va a emitir, p. ej. "FAC-155" */
  documento?: string;
  emitiendo?: boolean;
  onCancel:   () => void;
  /** Reintenta la emisión con confirmaRncNoVigente: true */
  onConfirmar: () => void;
}

/**
 * Modal de confirmación para los caminos que no tienen dónde poner la casilla
 * (listado de facturas, detalle). Un toast no sirve: desaparece y no admite
 * interacción, así que el usuario ve el motivo pero no puede resolverlo.
 */
export function ModalRncNoVigente({
  error, documento, emitiendo, onCancel, onConfirmar,
}: ModalProps) {
  const [confirmado, setConfirmado] = useState(false);

  // Cada vez que se abre para un documento distinto se vuelve a decidir
  useEffect(() => { setConfirmado(false); }, [error, documento]);

  return (
    <Modal
      open={!!error}
      onCancel={onCancel}
      title={`Comprador con RNC ${error?.estadoRnc ?? 'no vigente'} ante DGII`}
      maskClosable={!emitiendo}
      closable={!emitiendo}
      footer={[
        <Button key="cancelar" onClick={onCancel} disabled={emitiendo}>
          Cancelar
        </Button>,
        <Button
          key="emitir" type="primary" danger
          disabled={!confirmado} loading={emitiendo}
          onClick={onConfirmar}
        >
          Emitir de todos modos
        </Button>,
      ]}
    >
      <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 0 }}>
        {error?.message}
      </p>
      {documento && (
        <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
          Documento: <strong>{documento}</strong>
          {error?.rnc ? <> · RNC del comprador: <strong>{error.rnc}</strong></> : null}
        </p>
      )}
      <AvisoRncNoVigente
        estadoRnc={error?.estadoRnc}
        checked={confirmado}
        onChange={setConfirmado}
        mensaje="Confirmo que quiero emitir el comprobante a este comprador."
      />
    </Modal>
  );
}
