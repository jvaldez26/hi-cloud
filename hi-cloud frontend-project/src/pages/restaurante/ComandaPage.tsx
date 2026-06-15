import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Row, Col, Card, Button, Select, Input, InputNumber, Modal, Form,
  Typography, Tag, Space, Divider, message, Spin, Badge, Switch, Popconfirm,
} from 'antd';
import {
  PlusOutlined, MinusOutlined, DeleteOutlined,
  SendOutlined, DollarOutlined, PrinterOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';

const { Title, Text } = Typography;
const { Option } = Select;

const ESTADO_COCINA_COLOR: Record<string, string> = {
  pendiente: 'default', en_preparacion: 'processing', listo: 'success', entregado: 'default',
};

export default function ComandaPage() {
  const { id } = useParams<{ id: string }>();
  const comandaId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [modalCobro, setModalCobro] = useState(false);
  const [formCobro] = Form.useForm();
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);

  const { data: comanda, isLoading: loadingComanda } = useQuery({
    queryKey: ['restaurante-comanda', comandaId],
    queryFn: () => restauranteApi.obtenerComanda(comandaId),
    refetchInterval: 15_000,
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['restaurante-categorias'],
    queryFn: restauranteApi.listarCategorias,
  });

  const { data: menu = [] } = useQuery({
    queryKey: ['restaurante-menu', categoriaActiva],
    queryFn: () => restauranteApi.listarMenu({ categoriaId: categoriaActiva, disponible: true }),
  });

  useEffect(() => {
    if ((categorias as any[]).length > 0 && !categoriaActiva) {
      setCategoriaActiva((categorias as any[])[0]?.id);
    }
  }, [categorias, categoriaActiva]);

  const agregarItem = useMutation({
    mutationFn: (b: any) => restauranteApi.agregarItem(comandaId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-comanda', comandaId] }),
    onError: () => message.error('Error agregando ítem'),
  });

  const cancelarItem = useMutation({
    mutationFn: ({ itemId, motivo }: any) => restauranteApi.cancelarItem(comandaId, itemId, { motivo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-comanda', comandaId] }),
    onError: () => message.error('Error cancelando ítem'),
  });

  const enviarCocina = useMutation({
    mutationFn: () => restauranteApi.enviarACocina(comandaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-comanda', comandaId] }); message.success('Enviado a cocina'); },
    onError: () => message.error('Error enviando a cocina'),
  });

  const cobrar = useMutation({
    mutationFn: (b: any) => restauranteApi.cobrarComanda(comandaId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante-comanda', comandaId] });
      qc.invalidateQueries({ queryKey: ['restaurante-mapa'] });
      setModalCobro(false);
      message.success('Comanda cobrada exitosamente');
      navigate('/restaurante/mesas');
    },
    onError: () => message.error('Error cobrando comanda'),
  });

  const handleAgregarPlato = (item: any) => {
    if (!item.disponible) { message.warning('Este plato está agotado'); return; }
    agregarItem.mutate({ menuItemId: item.id, cantidad: 1, precioUnitario: item.precio });
  };

  if (loadingComanda) return <Spin style={{ margin: '40px auto', display: 'block' }} />;
  if (!comanda) return <div>Comanda no encontrada</div>;

  const items: any[] = (comanda.items ?? []).filter((i: any) => !i.cancelado);
  const subtotal = Number(comanda.subtotal ?? 0);
  const itbis = subtotal * 0.18;

  return (
    <div>
      <Row gutter={[12, 12]}>
        {/* PANEL IZQUIERDO — MENÚ */}
        <Col xs={24} lg={14}>
          <Card
            title={<Space><Tag color="blue">Mesa {comanda.mesaNumero}</Tag><Tag>{comanda.numPersonas} personas</Tag><Tag>{comanda.meseroNombre ?? 'Sin mesero'}</Tag></Space>}
            size="small"
            extra={<Button size="small" onClick={() => navigate('/restaurante/mesas')}>← Mesas</Button>}
          >
            {/* Tabs de categorías */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {(categorias as any[]).map((cat: any) => (
                <Button
                  key={cat.id}
                  size="small"
                  type={categoriaActiva === cat.id ? 'primary' : 'default'}
                  onClick={() => setCategoriaActiva(cat.id)}
                >
                  {cat.icono ? `${cat.icono} ` : ''}{cat.nombre}
                </Button>
              ))}
            </div>

            {/* Grid de platos */}
            <Row gutter={[8, 8]}>
              {(menu as any[]).map((item: any) => (
                <Col xs={12} sm={8} key={item.id}>
                  <Card
                    size="small"
                    hoverable={item.disponible}
                    onClick={() => handleAgregarPlato(item)}
                    style={{
                      opacity: item.disponible ? 1 : 0.5,
                      cursor: item.disponible ? 'pointer' : 'not-allowed',
                      borderColor: item.disponible ? undefined : '#ff4d4f',
                    }}
                    bodyStyle={{ padding: '8px' }}
                  >
                    <Text strong style={{ display: 'block', fontSize: 12 }}>{item.nombre}</Text>
                    <Text style={{ fontSize: 12, color: '#1677ff' }}>RD${Number(item.precio).toFixed(2)}</Text>
                    {!item.disponible && <Tag color="red" style={{ fontSize: 10, marginTop: 2 }}>AGOTADO</Tag>}
                    {item.tiempoPreparacionMin && <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>⏱ {item.tiempoPreparacionMin}min</Text>}
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* PANEL DERECHO — COMANDA */}
        <Col xs={24} lg={10}>
          <Card
            title={`Comanda ${comanda.numero}`}
            size="small"
            extra={<Tag color="blue">{comanda.estado?.replace(/_/g, ' ')}</Tag>}
          >
            {/* Items */}
            <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 8 }}>
              {items.length === 0 ? (
                <Text type="secondary" style={{ textAlign: 'center', display: 'block', padding: '20px 0' }}>Sin ítems aún</Text>
              ) : items.map((item: any, idx: number) => {
                const showRonda = idx === 0 || item.numeroRonda !== items[idx - 1]?.numeroRonda;
                return (
                  <div key={item.id}>
                    {showRonda && (
                      <Divider plain style={{ fontSize: 10, color: '#888', margin: '6px 0' }}>
                        Ronda #{item.numeroRonda}
                      </Divider>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                      <Badge dot color={ESTADO_COCINA_COLOR[item.estadoCocina] as any}>
                        <Text style={{ width: 24, textAlign: 'center', fontWeight: 600 }}>{item.cantidad}</Text>
                      </Badge>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 12 }}>{item.itemNombre}</Text>
                        {(item.modificaciones ?? []).map((m: any, i: number) => (
                          <Text key={i} type="secondary" style={{ fontSize: 10, display: 'block' }}>→ {m.nombre ?? m}</Text>
                        ))}
                        {item.notasEspeciales && <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>* {item.notasEspeciales}</Text>}
                      </div>
                      <Text style={{ fontSize: 12, color: '#1677ff', whiteSpace: 'nowrap' }}>
                        RD${Number(item.total ?? 0).toFixed(2)}
                      </Text>
                      {item.estadoCocina === 'pendiente' ? (
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => cancelarItem.mutate({ itemId: item.id })}
                        />
                      ) : item.estadoCocina !== 'entregado' && (
                        <Popconfirm
                          title="Ítem en cocina"
                          description="Este ítem ya fue enviado a cocina. ¿Cancelarlo de todas formas?"
                          onConfirm={() => cancelarItem.mutate({ itemId: item.id })}
                          okText="Sí, cancelar"
                          okButtonProps={{ danger: true }}
                          cancelText="No"
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Divider style={{ margin: '8px 0' }} />

            {/* Totales */}
            <div style={{ fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Subtotal:</Text><Text>RD${subtotal.toFixed(2)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>ITBIS (18%):</Text><Text>RD${itbis.toFixed(2)}</Text>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 14 }}>TOTAL:</Text>
                <Text strong style={{ fontSize: 14, color: '#52c41a' }}>RD${(subtotal + itbis).toFixed(2)}</Text>
              </div>
            </div>

            <Divider style={{ margin: '8px 0' }} />

            {/* Acciones */}
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {comanda.estado !== 'cobrada' && (
                <>
                  <Button
                    block type="primary" icon={<SendOutlined />}
                    loading={enviarCocina.isPending}
                    onClick={() => enviarCocina.mutate()}
                    disabled={items.filter((i: any) => i.estadoCocina === 'pendiente').length === 0}
                  >
                    🍳 Enviar a Cocina
                  </Button>
                  <Button
                    block type="primary" style={{ background: '#52c41a' }} icon={<DollarOutlined />}
                    onClick={() => setModalCobro(true)}
                  >
                    💳 Cobrar
                  </Button>
                  <Button
                    block icon={<PrinterOutlined />}
                    onClick={() => window.open(restauranteApi.pdfPreCuenta(comandaId), '_blank')}
                  >
                    🖨️ Pre-cuenta
                  </Button>
                </>
              )}
              {comanda.estado === 'cobrada' && (
                <Tag color="success" style={{ display: 'block', textAlign: 'center', padding: '8px' }}>
                  ✅ Comanda cobrada
                </Tag>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Modal Cobro */}
      <Modal
        open={modalCobro}
        title="Cobrar comanda"
        onCancel={() => setModalCobro(false)}
        onOk={() => formCobro.validateFields().then(vals => cobrar.mutate(vals))}
        confirmLoading={cobrar.isPending}
        okText="Confirmar cobro"
      >
        <Form form={formCobro} layout="vertical" size="small" initialValues={{ metodoPago: 'efectivo', propina: 0 }}>
          <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Subtotal:</Text><Text>RD${subtotal.toFixed(2)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>ITBIS (18%):</Text><Text>RD${itbis.toFixed(2)}</Text>
            </div>
          </div>
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true }]}>
            <Select>
              <Option value="efectivo">Efectivo</Option>
              <Option value="tarjeta">Tarjeta</Option>
              <Option value="transferencia">Transferencia</Option>
            </Select>
          </Form.Item>
          <Form.Item name="propina" label="Propina (RD$)">
            <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" />
          </Form.Item>
          <Form.Item name="porcentajePropina" label="Porcentaje propina (%)">
            <InputNumber min={0} max={100} style={{ width: '100%' }} suffix="%" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
