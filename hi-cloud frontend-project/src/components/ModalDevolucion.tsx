/**
 * Devolver un conduce — el MISMO modal en los tres sitios que lo permiten: el
 * módulo, el panel de conduces del POS y el panel lateral genérico del POS.
 *
 * Hace dos trabajos a la vez, y por eso es uno solo y no tres:
 *
 *  1. Pide el motivo, que es obligatorio. El backend lo exige de todas formas
 *     (marcarDevuelto valida y devuelve 400), pero pedirlo aquí evita el viaje
 *     y explica el mínimo antes de escribir.
 *  2. Sirve de confirmación. En el POS esto se hacía con un clic suelto en un
 *     botón de estado: devolver revierte una entrega, mueve el reporte de
 *     entrega y toca inventario — no puede pasar por un dedo mal puesto.
 */
import { useState, useEffect } from 'react';
import { Modal, Input, Typography } from 'antd';

const { Text } = Typography;

/** Mismo mínimo que aplica el backend (ConduceService.MOTIVO_DEVOLUCION_MIN). */
export const MOTIVO_MIN = 10;

interface Props {
  /** Conduce a devolver; null mantiene el modal cerrado. */
  conduce: { id: number; numero?: string } | null;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
  confirmando?: boolean;
}

export default function ModalDevolucion({ conduce, onCancel, onConfirm, confirmando }: Props) {
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);

  // Cada apertura empieza en blanco: el motivo del conduce anterior no tiene
  // por qué ser el de este.
  useEffect(() => { if (conduce) { setMotivo(''); setTocado(false); } }, [conduce?.id]);

  const limpio  = motivo.trim();
  const corto   = limpio.length < MOTIVO_MIN;
  const invalido = tocado && corto;

  return (
    <Modal
      open={!!conduce}
      title={`↩️ Registrar devolución${conduce?.numero ? ` · ${conduce.numero}` : ''}`}
      okText="Registrar devolución"
      cancelText="Cancelar"
      okButtonProps={{ danger: true, disabled: corto }}
      confirmLoading={confirmando}
      onCancel={onCancel}
      onOk={() => { setTocado(true); if (!corto) onConfirm(limpio); }}
      destroyOnClose
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        La mercancía vuelve al almacén y el conduce deja de contar como entregado
        en el reporte de entrega. Explica qué pasó.
      </Text>
      <Input.TextArea
        rows={3}
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        onBlur={() => setTocado(true)}
        maxLength={500}
        showCount
        status={invalido ? 'error' : undefined}
        placeholder="Ej: El cliente rechazó la mercancía porque llegó mojada"
        style={{ marginTop: 12 }}
        autoFocus
      />
      {invalido && (
        <Text type="danger" style={{ fontSize: 12 }}>
          Escribe al menos {MOTIVO_MIN} caracteres — que se entienda qué pasó.
        </Text>
      )}
    </Modal>
  );
}
