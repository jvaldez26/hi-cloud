import { useState } from 'react';
import {
  Card, Col, Row, Tag, Button, Modal, Form, Input, InputNumber, Select,
  Typography, Divider, message, Space, Badge,
} from 'antd';
import { PlusOutlined, CarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';

const { Title, Text } = Typography;
const { Option } = Select;

const ESTADOS = ['recibido', 'en_preparacion', 'listo_entrega', 'en_camino', 'entregado', 'cancelado'] as const;
const ESTADO_COLOR: Record<string, string> = {
  recibido: 'default', en_preparacion: 'processing', listo_entrega: 'warning',
  en_camino: 'blue', entregado: 'success', cancelado: 'error',
};
const ESTADO_LABEL: Record<string, string> = {
  recibido: 'Recibido', en_preparacion: 'En preparación', listo_entrega: 'Listo',
  en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
};
const SIGUIENTE: Record<string, string> = {
  recibido: 'en_preparacion', en_preparacion: 'listo_entrega',
  listo_entrega: 'en_camino', en_camino: 'entregado',
};

export default function DeliveryPage() {
  const qc = useQueryClient();
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalRepartidor, setModalRepartidor] = useState<any>(null);
  const [form] = Form.useForm();
  const [formRepartidor] = Form.useForm();

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['restaurante-delivery'],
    queryFn: () => restauranteApi.listarDelivery({ activo: true }),
    refetchInterval: 20_000,
  });

  const { data: menu = [] } = useQuery({
    queryKey: ['restaurante-menu', null],
    queryFn: () => restauranteApi.listarMenu({ disponible: true }),
  });

  const crearPedido = useMutation({
    mutationFn: (b: any) => restauranteApi.crearDelivery(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-delivery'] }); setModalNuevo(false); form.resetFields(); message.success('Pedido de delivery creado'); },
    onError: () => message.error('Error creando pedido'),
  });

  const avanzarEstado = useMutation({
    mutationFn: ({ id, estado }: any) => restauranteApi.actualizarEstadoDelivery(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-delivery'] }),
    onError: () => message.error('Error'),
  });

  const asignarRepartidor = useMutation({
    mutationFn: ({ id, ...b }: any) => restauranteApi.asignarRepartidor(id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-delivery'] }); setModalRepartidor(null); formRepartidor.resetFields(); message.success('Repartidor asignado'); },
    onError: () => message.error('Error'),
  });

  const pedidosLista = pedidos as any[];
  const columnas = ESTADOS.filter(e => e !== 'cancelado');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>🛵 Delivery — Tablero Kanban</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalNuevo(true)}>Nuevo Pedido</Button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <Row gutter={[8, 8]} style={{ flexWrap: 'nowrap', minWidth: 900 }}>
          {columnas.map(estado => {
            const cols = pedidosLista.filter(p => p.estado === estado);
            return (
              <Col key={estado} style={{ width: 220, minWidth: 220 }}>
                <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 8, minHeight: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Tag color={ESTADO_COLOR[estado]} style={{ fontSize: 12, fontWeight: 600 }}>
                      {ESTADO_LABEL[estado]}
                    </Tag>
                    <Badge count={cols.length} showZero color="#8c8c8c" />
                  </div>

                  {cols.map((p: any) => (
                    <Card key={p.id} size="small" style={{ marginBottom: 8, borderLeft: `3px solid ${ESTADO_COLOR[p.estado] === 'default' ? '#d9d9d9' : ESTADO_COLOR[p.estado]}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text strong style={{ fontSize: 12 }}>{p.numero}</Text>
                        <Text style={{ fontSize: 11, color: '#888' }}>{new Date(p.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </div>
                      <Text style={{ fontSize: 12, display: 'block' }}>{p.clienteNombre}</Text>
                      {p.telefono && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{p.telefono}</Text>}
                      {p.direccionEntrega && (
                        <Text type="secondary" style={{ fontSize: 10, display: 'block' }} ellipsis>📍 {p.direccionEntrega}</Text>
                      )}
                      {p.repartidorNombre && (
                        <Text style={{ fontSize: 10, color: '#52c41a', display: 'block' }}>🏍️ {p.repartidorNombre}</Text>
                      )}
                      <Text style={{ fontSize: 12, fontWeight: 600, color: '#52c41a' }}>RD${Number(p.total ?? 0).toFixed(2)}</Text>

                      <Space style={{ marginTop: 6 }} size="small" wrap>
                        {SIGUIENTE[p.estado] && (
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => avanzarEstado.mutate({ id: p.id, estado: SIGUIENTE[p.estado] })}
                            loading={avanzarEstado.isPending}
                          >
                            → {ESTADO_LABEL[SIGUIENTE[p.estado]]}
                          </Button>
                        )}
                        {p.estado === 'listo_entrega' && !p.repartidorNombre && (
                          <Button
                            size="small"
                            icon={<CarOutlined />}
                            onClick={() => { setModalRepartidor(p); formRepartidor.resetFields(); }}
                          >
                            Asignar
                          </Button>
                        )}
                      </Space>
                    </Card>
                  ))}
                </div>
              </Col>
            );
          })}
        </Row>
      </div>

      {/* Modal nuevo pedido */}
      <Modal
        open={modalNuevo}
        title="Nuevo Pedido Delivery"
        onCancel={() => { setModalNuevo(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(vals => crearPedido.mutate(vals))}
        confirmLoading={crearPedido.isPending}
        width={520}
        okText="Crear pedido"
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="clienteNombre" label="Cliente" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
          <Form.Item name="direccionEntrega" label="Dirección" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="referencias" label="Referencias"><Input placeholder="Casa azul, frente al parque..." /></Form.Item>
          <Form.Item name="instruccionesEspeciales" label="Instrucciones especiales"><Input.TextArea rows={2} /></Form.Item>
          <Divider style={{ margin: '8px 0' }} />
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true }]}>
            <Select>
              <Option value="efectivo">Efectivo</Option>
              <Option value="tarjeta">Tarjeta</Option>
              <Option value="transferencia">Transferencia</Option>
            </Select>
          </Form.Item>
          <Form.Item name="total" label="Total (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal asignar repartidor */}
      <Modal
        open={!!modalRepartidor}
        title={`Asignar repartidor — ${modalRepartidor?.numero}`}
        onCancel={() => setModalRepartidor(null)}
        onOk={() => formRepartidor.validateFields().then(vals => asignarRepartidor.mutate({ id: modalRepartidor.id, ...vals }))}
        confirmLoading={asignarRepartidor.isPending}
        okText="Asignar"
      >
        <Form form={formRepartidor} layout="vertical" size="small">
          <Form.Item name="repartidorNombre" label="Nombre del repartidor" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="repartidorTelefono" label="Teléfono repartidor"><Input /></Form.Item>
          <Form.Item name="tiempoEstimadoMin" label="Tiempo estimado (min)">
            <InputNumber min={5} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
