import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Tag, message, Space, Dropdown } from 'antd';
import { PlusOutlined, EllipsisOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { serviciosProApi } from '../../api/servicios-pro.api';
import api from '../../api/client';

const TIPOS = ['caso_legal','proyecto','consultoria','auditoria','diseno','ingenieria','otro'];
const ESTADOS = ['borrador','activo','pausado','completado','cancelado'];
const TIPOS_FACTURACION = ['por_hora','precio_fijo','retainer_mensual','exito'];
const PRIORIDADES = ['baja','normal','alta','urgente'];

const ESTADO_COLOR: Record<string, string> = {
  activo: 'green', borrador: 'default', pausado: 'orange', completado: 'blue', cancelado: 'red',
};

export default function ExpedientesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data = [], isLoading } = useQuery({
    queryKey: ['sp-expedientes', filtroEstado],
    queryFn: () => serviciosProApi.getExpedientes({ estado: filtroEstado }),
  });

  const { data: profesionalesData = [] } = useQuery({
    queryKey: ['sp-profesionales-sel'],
    queryFn: serviciosProApi.getProfesionales,
  });

  const { data: clientesData } = useQuery({
    queryKey: ['clientes-sel-sp'],
    queryFn: () => api.get('/clientes?limit=500').then(r => r.data?.data ?? r.data ?? []),
  });
  const clientes: any[] = Array.isArray(clientesData) ? clientesData : clientesData?.data ?? [];

  const crearMut = useMutation({
    mutationFn: (body: any) => editId ? serviciosProApi.actualizarExpediente(editId, body) : serviciosProApi.crearExpediente(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-expedientes'] });
      message.success(editId ? 'Expediente actualizado' : 'Expediente creado');
      setModalOpen(false); form.resetFields(); setEditId(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (exp: any) => {
    setEditId(exp.id);
    form.setFieldsValue({
      ...exp,
      fechaInicio: exp.fechaInicio ? require('dayjs')(exp.fechaInicio) : null,
      fechaEstimadaFin: exp.fechaEstimadaFin ? require('dayjs')(exp.fechaEstimadaFin) : null,
    });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Número', dataIndex: 'numero', width: 100 },
    { title: 'Nombre', dataIndex: 'nombre', render: (v: string, row: any) => (
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', fontWeight: 600, textAlign: 'left', fontSize: 13 }}
        onClick={() => navigate(`/servicios-pro/expedientes/${row.id}`)}>{v}</button>
    )},
    { title: 'Cliente', dataIndex: 'clienteNombre' },
    { title: 'Responsable', dataIndex: 'profesionalNombre', render: (v: string, row: any) => v ? `${v} ${row.profesionalApellidos ?? ''}`.trim() : '—' },
    { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Tipo Facturación', dataIndex: 'tipoFacturacion', render: (v: string) => v?.replace(/_/g, ' ') ?? '—' },
    { title: 'Inicio', dataIndex: 'fechaInicio', render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '' },
    { title: 'Horas', dataIndex: 'totalHorasRegistradas', render: (v: number) => v != null ? `${Number(v).toFixed(1)}h` : '' },
    {
      title: '', key: 'acciones', width: 50,
      render: (_: any, row: any) => (
        <Dropdown menu={{ items: [
          { key: 'ver',    label: 'Ver ficha',  onClick: () => navigate(`/servicios-pro/expedientes/${row.id}`) },
          { key: 'editar', label: 'Editar',     onClick: () => openEditar(row) },
        ]}} trigger={['click']}>
          <Button size="small" icon={<EllipsisOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📁 Expedientes</h2>
        <Space>
          <Select placeholder="Filtrar por estado" allowClear style={{ width: 160 }} value={filtroEstado} onChange={v => setFiltroEstado(v)}>
            {ESTADOS.map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>
            Nuevo Expediente
          </Button>
        </Space>
      </div>

      <Table dataSource={Array.isArray(data) ? data : []} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal open={modalOpen} title={editId ? 'Editar Expediente' : 'Nuevo Expediente'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({
          ...v,
          fechaInicio: v.fechaInicio?.format('YYYY-MM-DD'),
          fechaEstimadaFin: v.fechaEstimadaFin?.format('YYYY-MM-DD'),
        }))}
        confirmLoading={crearMut.isPending} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente">
              {clientes.map((c: any) => <Select.Option key={c.id} value={c.id}>{c.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tipo" label="Tipo">
            <Select placeholder="Tipo de caso">{TIPOS.map(t => <Select.Option key={t} value={t}>{t.replace(/_/g,' ')}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="profesionalId" label="Profesional responsable">
            <Select allowClear showSearch optionFilterProp="children">
              {profesionalesData.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tipoFacturacion" label="Tipo de facturación">
            <Select>{TIPOS_FACTURACION.map(t => <Select.Option key={t} value={t}>{t.replace(/_/g,' ')}</Select.Option>)}</Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="fechaInicio" label="Fecha inicio" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fechaEstimadaFin" label="Fecha estimada fin"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="presupuestoTotal" label="Presupuesto"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="tarifaHoraProyecto" label="Tarifa/hora"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </div>
          <Form.Item name="estado" label="Estado">
            <Select>{ESTADOS.map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="prioridad" label="Prioridad">
            <Select>{PRIORIDADES.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
