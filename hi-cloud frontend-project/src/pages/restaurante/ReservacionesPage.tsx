import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, Typography, message, Popconfirm,
} from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'default', confirmada: 'blue', sentada: 'green', cancelada: 'error', no_show: 'warning',
};

export default function ReservacionesPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [filtroFecha, setFiltroFecha] = useState<any>(null);

  const { data: reservaciones = [], isLoading } = useQuery({
    queryKey: ['restaurante-reservaciones', filtroFecha?.format('YYYY-MM-DD')],
    queryFn: () => restauranteApi.listarReservaciones({ fecha: filtroFecha?.format('YYYY-MM-DD') }),
  });

  const { data: areas = [] } = useQuery({
    queryKey: ['restaurante-areas'],
    queryFn: restauranteApi.listarAreas,
  });

  const guardar = useMutation({
    mutationFn: (b: any) => editId ? restauranteApi.actualizarReservacion(editId, b) : restauranteApi.crearReservacion(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-reservaciones'] }); setModal(false); form.resetFields(); setEditId(null); message.success('Guardado'); },
    onError: () => message.error('Error'),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: any) => restauranteApi.actualizarReservacion(id, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-reservaciones'] }),
    onError: () => message.error('Error'),
  });

  const sentar = useMutation({
    mutationFn: (id: number) => restauranteApi.sentarReservacion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-reservaciones'] }); message.success('Cliente sentado'); },
    onError: () => message.error('Error'),
  });

  const abrirEditar = (record: any) => {
    setEditId(record.id);
    const fecha = dayjs(record.fecha).format('YYYY-MM-DD');
    const hora = String(record.hora).slice(0, 5);
    form.setFieldsValue({
      ...record,
      fechaHora: dayjs(`${fecha}T${hora}`),
    });
    setModal(true);
  };

  const cols = [
    { title: 'Número', dataIndex: 'numero', width: 100 },
    {
      title: 'Fecha / Hora', key: 'fechaHora', width: 150,
      render: (_: any, r: any) => {
        if (!r.fecha || !r.hora) return '—';
        const fecha = dayjs(r.fecha).format('YYYY-MM-DD');
        const hora = String(r.hora).slice(0, 5);
        const d = dayjs(`${fecha}T${hora}`);
        return d.isValid() ? d.format('DD/MM/YYYY HH:mm') : '—';
      },
    },
    { title: 'Cliente', dataIndex: 'clienteNombre', ellipsis: true },
    { title: 'Teléfono', dataIndex: 'clienteTelefono', width: 120 },
    { title: 'Personas', dataIndex: 'numPersonas', width: 80, align: 'center' as const },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{v.replace(/_/g, ' ')}</Tag>,
    },
    { title: 'Notas', dataIndex: 'notas', ellipsis: true },
    {
      title: 'Acciones', key: 'act', width: 180,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => abrirEditar(r)}>Editar</Button>
          {r.estado === 'pendiente' && (
            <Button size="small" type="primary" onClick={() => cambiarEstado.mutate({ id: r.id, estado: 'confirmada' })}>Confirmar</Button>
          )}
          {r.estado === 'confirmada' && (
            <Button size="small" style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }} icon={<CheckOutlined />} onClick={() => sentar.mutate(r.id)}>Sentar</Button>
          )}
          {(r.estado === 'pendiente' || r.estado === 'confirmada') && (
            <Popconfirm title="¿Cancelar reservación?" onConfirm={() => cambiarEstado.mutate({ id: r.id, estado: 'cancelada' })}>
              <Button size="small" danger icon={<CloseOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>📅 Reservaciones</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModal(true); }}>Nueva Reservación</Button>
      </div>

      <Space style={{ marginBottom: 12 }}>
        <DatePicker
          placeholder="Filtrar por fecha"
          onChange={v => setFiltroFecha(v)}
          allowClear
        />
      </Space>

      <Table
        dataSource={reservaciones as any[]}
        columns={cols}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        open={modal}
        title={editId ? 'Editar Reservación' : 'Nueva Reservación'}
        onCancel={() => { setModal(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(vals => guardar.mutate({ ...vals, fechaHora: vals.fechaHora?.toISOString() }))}
        confirmLoading={guardar.isPending}
        width={500}
        okText="Guardar"
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ numPersonas: 2, estado: 'pendiente' }}>
          <Form.Item name="clienteNombre" label="Nombre del cliente" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="clienteTelefono" label="Teléfono"><Input /></Form.Item>
          <Form.Item name="clienteEmail" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="fechaHora" label="Fecha y hora" rules={[{ required: true }]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} minuteStep={15} />
          </Form.Item>
          <Form.Item name="numPersonas" label="Número de personas" rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="areaId" label="Área preferida">
            <Select allowClear placeholder="Sin preferencia">
              {(areas as any[]).map((a: any) => <Option key={a.id} value={a.id}>{a.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="ocasionEspecial" label="Ocasión">
            <Select allowClear>
              <Option value="cumpleanos">Cumpleaños</Option>
              <Option value="aniversario">Aniversario</Option>
              <Option value="reunion_negocios">Reunión de negocios</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas especiales">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
