import { useEffect, useState } from 'react';
import { Modal, Button, Input, Typography, Alert, InputNumber, Space } from 'antd';
import { comprasApi } from '../../api/compras.api';
import type { Compra } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;

/**
 * Modal de recepción de mercancía — una sola fuente de verdad para POS y
 * para el módulo de Compras. Antes solo existía embebida dentro de
 * POSPage.tsx (POSComprasPanel); el módulo de Órdenes de Compra no la tenía
 * y su "Recibir" solo forzaba estado='recibida' de un tirón, sin verificar
 * cantidades ni permitir recepción parcial — aunque el backend
 * (ComprasService.recibir) ya lo soporta por línea desde hace tiempo.
 *
 * Cantidad editable por línea: lo que falte queda pendiente y la orden pasa
 * a 'recibida_parcial' — el stock solo se mueve por lo que de verdad entró.
 */
interface Props {
  open:    boolean;
  compra:  Compra | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RecibirMercanciaModal({ open, compra, onClose, onSuccess }: Props) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [notas,      setNotas]      = useState('');
  const [enviando,   setEnviando]   = useState(false);

  // Al abrir con una compra nueva: precargar cada línea con lo que falta por
  // recibir (pendiente = total pedido − ya recibido). En una recepción
  // completa eso es igual al total pedido.
  useEffect(() => {
    if (!compra) return;
    const init: Record<number, number> = {};
    for (const d of compra.detalles ?? []) {
      const pedido    = Number(d.cantidadTotal ?? d.cantidad);
      const yaRecibido = Number(d.cantidadRecibida ?? 0);
      const pendiente  = Math.max(0, +(pedido - yaRecibido).toFixed(4));
      init[d.id] = pendiente;
    }
    setCantidades(init);
    setNotas(compra.notas ?? '');
  }, [compra?.id]);

  if (!compra) return null;

  const detalles = compra.detalles ?? [];
  const hayParcial = detalles.some(d => {
    const pedido    = Number(d.cantidadTotal ?? d.cantidad);
    const yaRecibido = Number(d.cantidadRecibida ?? 0);
    const pendiente  = Math.max(0, +(pedido - yaRecibido).toFixed(4));
    const aRecibir   = Number(cantidades[d.id] ?? pendiente);
    return aRecibir < pendiente;
  });

  const handleConfirmar = async () => {
    setEnviando(true);
    try {
      const body = {
        detalles: detalles.map(d => ({
          detalleId:        d.id,
          cantidadRecibida: Number(cantidades[d.id] ?? 0),
        })),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      };
      await comprasApi.recibir(compra.id, body);
      onSuccess();
      onClose();
    } catch (e: any) {
      Modal.error({
        title: 'No se pudo recibir la mercancía',
        content: e?.response?.data?.message ?? 'Error al recibir mercancía',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      title={`Recibir Mercancía — ${compra.folio}`}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancelar" onClick={onClose}>Cancelar</Button>,
        <Button key="confirmar" type="primary" loading={enviando} onClick={handleConfirmar}
          style={{ background: '#10b981', borderColor: '#10b981' }}>
          Confirmar Recepción
        </Button>,
      ]}
      width={480}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        Proveedor: <Text strong>{compra.proveedor?.nombre ?? '—'}</Text>
      </Text>

      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text strong style={{ fontSize: 12 }}>Artículos a recibir:</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>Pedido → Recibido</Text>
        </div>

        {detalles.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>Sin artículos registrados</Text>
        )}

        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {detalles.map(d => {
            const pedido     = Number(d.cantidadTotal ?? d.cantidad);
            const yaRecibido = Number(d.cantidadRecibida ?? 0);
            const pendiente  = Math.max(0, +(pedido - yaRecibido).toFixed(4));
            const aRecibir   = Number(cantidades[d.id] ?? pendiente);
            const esParcial  = aRecibir < pendiente;
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                background: '#f8fafc', borderRadius: 6,
                border: `1px solid ${esParcial ? '#fb923c' : '#e2e8f0'}`,
              }}>
                <Text style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.producto?.nombre ?? d.descripcion ?? `Producto #${d.productoId}`}
                </Text>
                {yaRecibido > 0 && (
                  <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                    ({yaRecibido} ya recibido)
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  {pendiente} →
                </Text>
                <InputNumber
                  min={0} max={pendiente} step={1} size="small"
                  value={aRecibir}
                  onChange={v => setCantidades(prev => ({ ...prev, [d.id]: Number(v ?? 0) }))}
                  style={{ width: 72 }}
                />
              </div>
            );
          })}
        </Space>

        {hayParcial && (
          <Alert
            style={{ marginTop: 8 }}
            type="warning" showIcon
            message="Recepción parcial: la orden quedará en estado PARCIAL. El stock se actualizará solo por las cantidades recibidas."
          />
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Notas de recepción</Text>
        <TextArea rows={3} value={notas} onChange={e => setNotas(e.target.value)}
          placeholder="Observaciones sobre la recepción..." />
      </div>

      <Alert
        type="info"
        message="Al confirmar, el stock de cada artículo se actualizará en el almacén destino."
      />
    </Modal>
  );
}
