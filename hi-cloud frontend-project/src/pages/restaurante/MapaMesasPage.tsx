import { useState } from 'react';
import { Card, Tabs, Modal, Form, InputNumber, Input, Select, Button, Typography, Tag, Spin, message, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const ESTADO_COLOR: Record<string, string> = {
  disponible: '#f6ffed', ocupada: '#e6f4ff', reservada: '#f9f0ff',
  limpieza: '#fff7e6', inactiva: '#f0f0f0',
};
const ESTADO_BORDER: Record<string, string> = {
  disponible: '#b7eb8f', ocupada: '#91caff', reservada: '#d3adf7',
  limpieza: '#ffd591', inactiva: '#d9d9d9',
};
const ESTADO_EMOJI: Record<string, string> = {
  disponible: '⬜', ocupada: '🟢', reservada: '🔵', limpieza: '🟡', inactiva: '⬛',
};

export default function MapaMesasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [modalComanda, setModalComanda] = useState<any>(null);
  const [modalNuevaMesa, setModalNuevaMesa] = useState(false);
  const [formMesa] = Form.useForm();
  const [areaActiva, setAreaActiva] = useState<string | undefined>();

  const { data: mapa = [], isLoading } = useQuery({
    queryKey: ['restaurante-mapa'],
    queryFn: restauranteApi.mapaMesas,
    refetchInterval: 15_000,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['restaurante-areas'],
    queryFn: restauranteApi.listarAreas,
  });

  const abrirComanda = useMutation({
    mutationFn: (b: any) => restauranteApi.abrirComanda(b),
    onSuccess: (comanda: any) => {
      qc.invalidateQueries({ queryKey: ['restaurante-mapa'] });
      setModalComanda(null);
      form.resetFields();
      message.success(`Comanda ${comanda.numero} abierta`);
      navigate(`/restaurante/comanda/${comanda.id}`);
    },
    onError: () => message.error('Error abriendo comanda'),
  });

  const crearMesa = useMutation({
    mutationFn: (b: any) => restauranteApi.crearMesa(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-mapa'] }); setModalNuevaMesa(false); formMesa.resetFields(); message.success('Mesa creada'); },
    onError: () => message.error('Error creando mesa'),
  });

  const handleClickMesa = (mesa: any) => {
    if (mesa.estado === 'ocupada' && mesa.comandaActualId) {
      navigate(`/restaurante/comanda/${mesa.comandaActualId}`);
    } else if (mesa.estado === 'disponible' || mesa.estado === 'reservada') {
      setModalComanda(mesa);
      form.setFieldsValue({ mesaId: mesa.id, numPersonas: 1 });
    }
  };

  const tabItems = (mapa as any[]).map((area: any) => ({
    key: String(area.id),
    label: (
      <span>
        <span style={{
          display: 'inline-block', width: 10, height: 10,
          borderRadius: '50%', background: area.color ?? '#3b82f6',
          marginRight: 6, verticalAlign: 'middle',
        }} />
        {area.nombre} ({area.mesas?.length ?? 0})
      </span>
    ),
    children: (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 8 }}>
        {(area.mesas ?? []).map((mesa: any) => (
          <div
            key={mesa.id}
            onClick={() => handleClickMesa(mesa)}
            style={{
              width: 120, minHeight: 100, borderRadius: 10, cursor: 'pointer',
              background: ESTADO_COLOR[mesa.estado] ?? '#fff',
              border: `2px solid ${ESTADO_BORDER[mesa.estado] ?? '#d9d9d9'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: 8, transition: 'transform 0.15s',
              userSelect: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Text strong style={{ fontSize: 15 }}>{mesa.numero}</Text>
            <Text style={{ fontSize: 11, color: '#888' }}>{ESTADO_EMOJI[mesa.estado]} {mesa.capacidad} pax</Text>
            {mesa.estado === 'ocupada' && (
              <>
                <Tag color="blue" style={{ marginTop: 4, fontSize: 10 }}>{mesa.comandaNumero}</Tag>
                {mesa.minutosOcupada !== null && (
                  <Text style={{ fontSize: 10, color: Number(mesa.minutosOcupada) > 60 ? 'red' : '#888' }}>
                    {Math.round(Number(mesa.minutosOcupada))} min
                  </Text>
                )}
              </>
            )}
            {mesa.estado === 'reservada' && (
              <Tag color="purple" style={{ marginTop: 4, fontSize: 10 }}>RESERV.</Tag>
            )}
            {mesa.estado === 'limpieza' && (
              <Tag color="orange" style={{ marginTop: 4, fontSize: 10 }}>LIMPIEZA</Tag>
            )}
          </div>
        ))}
      </div>
    ),
  }));

  if (isLoading) return <Spin style={{ margin: '40px auto', display: 'block' }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>🗺️ Mapa de Mesas</Title>
        <Button icon={<PlusOutlined />} onClick={() => setModalNuevaMesa(true)}>Nueva Mesa</Button>
      </div>

      <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(ESTADO_EMOJI).map(([est, em]) => (
          <Tag key={est} color={ESTADO_BORDER[est]}>{em} {est.charAt(0).toUpperCase() + est.slice(1)}</Tag>
        ))}
      </div>

      <Card size="small">
        <Tabs items={tabItems} onChange={setAreaActiva} />
      </Card>

      {/* Modal: Abrir comanda */}
      <Modal
        open={!!modalComanda}
        title={`Abrir comanda — Mesa ${modalComanda?.numero}`}
        onCancel={() => { setModalComanda(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(vals => abrirComanda.mutate(vals))}
        confirmLoading={abrirComanda.isPending}
        okText="Abrir"
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="mesaId" hidden><Input /></Form.Item>
          <Form.Item name="numPersonas" label="Número de personas" rules={[{ required: true }]}>
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="meseroNombre" label="Mesero">
            <Input placeholder="Nombre del mesero" />
          </Form.Item>
          <Form.Item name="notas" label="Notas iniciales">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Nueva mesa */}
      <Modal
        open={modalNuevaMesa}
        title="Nueva Mesa"
        onCancel={() => setModalNuevaMesa(false)}
        onOk={() => formMesa.validateFields().then(vals => crearMesa.mutate(vals))}
        confirmLoading={crearMesa.isPending}
        okText="Crear"
      >
        <Form form={formMesa} layout="vertical" size="small" initialValues={{ capacidad: 4, forma: 'cuadrada' }}>
          <Form.Item name="areaId" label="Área" rules={[{ required: true }]}>
            {(areas as any[]).length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ fontSize: 12 }}>
                    No hay áreas creadas.{' '}
                    <a onClick={() => { setModalNuevaMesa(false); navigate('/restaurante/panel'); }}>
                      Crear área →
                    </a>
                  </span>
                }
                style={{ margin: '8px 0' }}
              />
            ) : (
              <Select placeholder="Seleccionar área">
                {(areas as any[]).map((a: any) => (
                  <Option key={a.id} value={a.id}>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12,
                      borderRadius: '50%', background: a.color ?? '#3b82f6',
                      marginRight: 8, verticalAlign: 'middle',
                    }} />
                    {a.nombre}
                  </Option>
                ))}
              </Select>
            )}
          </Form.Item>
          <Form.Item name="numero" label="Número/Código" rules={[{ required: true }]}>
            <Input placeholder="M-01, B-05, T-03" />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre descriptivo">
            <Input placeholder="Mesa 1, Barra 5..." />
          </Form.Item>
          <Form.Item name="capacidad" label="Capacidad (personas)">
            <InputNumber min={1} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="forma" label="Forma">
            <Select>
              <Option value="cuadrada">Cuadrada</Option>
              <Option value="redonda">Redonda</Option>
              <Option value="rectangular">Rectangular</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
