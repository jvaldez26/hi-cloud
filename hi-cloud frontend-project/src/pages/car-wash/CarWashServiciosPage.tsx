import { useMemo, useState } from 'react';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, Switch, Space, Select, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carWashApi } from '../../api/car-wash.api';
import { TIPOS_VEHICULO_CW, LABEL_TIPO_VEHICULO_CW } from './tipos';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { ColumnToggle } from '../../components/ui/ColumnToggle';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  ...TIPOS_VEHICULO_CW.flatMap(t => [
    { key: `precio_${t}`, label: `Precio ${LABEL_TIPO_VEHICULO_CW[t]}`, defaultVisible: true },
    { key: `duracion_${t}`, label: `Minutos ${LABEL_TIPO_VEHICULO_CW[t]}`, defaultVisible: false },
  ]),
  { key: 'activo', label: 'Activo', defaultVisible: true },
  { key: 'acciones', label: '', defaultVisible: true },
];

export default function CarWashServiciosPage() {
  const qc = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [busqueda, setBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState<string | undefined>();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('car-wash-servicios', COLS_DEF);

  const { data: servicios, isLoading } = useQuery({
    queryKey: ['cw-servicios'],
    queryFn: () => carWashApi.getServicios(),
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (servicios ?? []).filter((s: any) => {
      if (q && !s.nombre.toLowerCase().includes(q)) return false;
      if (filtroActivo !== undefined && String(s.activo) !== filtroActivo) return false;
      return true;
    });
  }, [servicios, busqueda, filtroActivo]);

  const crear = useMutation({
    mutationFn: (body: any) => carWashApi.crearServicio(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cw-servicios'] }); message.success('Servicio creado'); cerrar(); },
  });
  const actualizar = useMutation({
    mutationFn: ({ id, body }: any) => carWashApi.actualizarServicio(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cw-servicios'] }); message.success('Servicio actualizado'); cerrar(); },
  });

  function abrirNuevo() {
    setEditando(null);
    form.resetFields();
    form.setFieldsValue({ precios: TIPOS_VEHICULO_CW.map(t => ({ tipoVehiculo: t, duracionMinutos: 20, precio: 0 })) });
    setModalAbierto(true);
  }

  function abrirEditar(servicio: any) {
    setEditando(servicio);
    form.setFieldsValue({
      nombre: servicio.nombre,
      activo: servicio.activo,
      precios: TIPOS_VEHICULO_CW.map(t => {
        const p = servicio.precios.find((x: any) => x.tipoVehiculo === t);
        return {
          tipoVehiculo: t, duracionMinutos: p?.duracionMinutos ?? 20, precio: Number(p?.precio ?? 0),
          tarifaLavador: p?.tarifaLavador != null ? Number(p.tarifaLavador) : undefined,
        };
      }),
    });
    setModalAbierto(true);
  }

  function cerrar() {
    setModalAbierto(false);
    setEditando(null);
    form.resetFields();
  }

  function guardar() {
    form.validateFields().then(valores => {
      if (editando) actualizar.mutate({ id: editando.id, body: valores });
      else crear.mutate(valores);
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Servicios de Car Wash</Title>
        <Space wrap>
          <Input
            placeholder="Buscar servicio" prefix={<SearchOutlined />} allowClear
            value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 180 }}
          />
          <Select
            placeholder="Activo" allowClear style={{ width: 110 }}
            value={filtroActivo} onChange={setFiltroActivo}
            options={[{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]}
          />
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo servicio</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={filtrados}
        pagination={{ pageSize: 10 }}
        columns={filterColumns([
          { key: 'nombre', title: 'Nombre', dataIndex: 'nombre' },
          ...TIPOS_VEHICULO_CW.flatMap(t => [
            {
              key: `precio_${t}`, title: `Precio ${LABEL_TIPO_VEHICULO_CW[t]}`,
              render: (_: any, r: any) => {
                const p = r.precios.find((x: any) => x.tipoVehiculo === t);
                return p ? `RD$${Number(p.precio).toFixed(2)}` : '—';
              },
            },
            {
              key: `duracion_${t}`, title: `Minutos ${LABEL_TIPO_VEHICULO_CW[t]}`,
              render: (_: any, r: any) => {
                const p = r.precios.find((x: any) => x.tipoVehiculo === t);
                return p ? p.duracionMinutos : '—';
              },
            },
          ]),
          { key: 'activo', title: 'Activo', dataIndex: 'activo', render: (v: boolean) => (v ? 'Sí' : 'No') },
          { key: 'acciones', title: '', render: (_: any, r: any) => <Button onClick={() => abrirEditar(r)}>Editar</Button> },
        ] as any)}
      />

      <Modal
        title={editando ? 'Editar servicio' : 'Nuevo servicio'}
        open={modalAbierto}
        onCancel={cerrar}
        onOk={guardar}
        confirmLoading={crear.isPending || actualizar.isPending}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre del servicio" rules={[{ required: true }]}>
            <Input placeholder="Lavado básico" />
          </Form.Item>
          {editando && (
            <Form.Item name="activo" label="Activo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}

          <Form.List name="precios">
            {fields => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field, i) => (
                  <Space key={field.key} style={{ width: '100%' }} align="baseline">
                    <Form.Item name={[field.name, 'tipoVehiculo']} noStyle>
                      <Input disabled style={{ width: 110, textTransform: 'capitalize' }} value={TIPOS_VEHICULO_CW[i]} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'duracionMinutos']} label="Minutos" rules={[{ required: true }]}>
                      <InputNumber min={1} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'precio']} label="Precio RD$" rules={[{ required: true }]}>
                      <InputNumber min={0} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'tarifaLavador']} label="Tarifa lavador (opcional)">
                      <InputNumber min={0} placeholder="Usa la del lavador" />
                    </Form.Item>
                  </Space>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
