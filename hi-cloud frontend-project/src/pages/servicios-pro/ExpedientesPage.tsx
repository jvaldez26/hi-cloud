import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Tag, message, Space, Dropdown } from 'antd';
import { PlusOutlined, EllipsisOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { serviciosProApi } from '../../api/servicios-pro.api';
import api from '../../api/client';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const TIPOS = ['caso_legal','proyecto','consultoria','auditoria','diseno','ingenieria','otro'];
const ESTADOS = ['borrador','activo','pausado','completado','cancelado'];
const TIPOS_FACTURACION = ['por_hora','precio_fijo','retainer_mensual','exito'];
const PRIORIDADES = ['baja','normal','alta','urgente'];

const ESTADO_COLOR: Record<string, string> = {
  activo: 'green', borrador: 'default', pausado: 'orange', completado: 'blue', cancelado: 'red',
};

const COLS_DEF = [
  { key: 'numero', label: 'Número', defaultVisible: true },
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'clienteNombre', label: 'Cliente', defaultVisible: true },
  { key: 'profesionalNombre', label: 'Responsable', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'tipoFacturacion', label: 'Tipo Facturación', defaultVisible: true },
  { key: 'fechaInicio', label: 'Inicio', defaultVisible: true },
  { key: 'totalHorasRegistradas', label: 'Horas', defaultVisible: true },
  { key: 'acciones', label: 'Acciones', defaultVisible: true },
];

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
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('sp-expedientes', COLS_DEF);

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

  const exportar = () => {
    const filas = (Array.isArray(data) ? data : []).map((r: any) => ({
      'Número': r.numero,
      'Nombre': r.nombre,
      'Cliente': r.clienteNombre,
      'Responsable': r.profesionalNombre ? `${r.profesionalNombre} ${r.profesionalApellidos ?? ''}`.trim() : '',
      'Estado': r.estado,
      'Tipo Facturación': r.tipoFacturacion?.replace(/_/g, ' ') ?? '',
      'Inicio': r.fechaInicio ? new Date(r.fechaInicio).toLocaleDateString('es-DO') : '',
      'Horas': r.totalHorasRegistradas,
    }));
    exportarExcel(filas, `Expedientes-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  const columns = [
    { title: 'Número', key: 'numero', dataIndex: 'numero', width: 100 },
    { title: 'Nombre', key: 'nombre', dataIndex: 'nombre', render: (v: string, row: any) => (
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', fontWeight: 600, textAlign: 'left', fontSize: 13 }}
        onClick={() => navigate(`/servicios-pro/expedientes/${row.id}`)}>{v}</button>
    )},
    { title: 'Cliente', key: 'clienteNombre', dataIndex: 'clienteNombre' },
    { title: 'Responsable', key: 'profesionalNombre', dataIndex: 'profesionalNombre', render: (v: string, row: any) => v ? `${v} ${row.profesionalApellidos ?? ''}`.trim() : '—' },
    { title: 'Estado', key: 'estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Tipo Facturación', key: 'tipoFacturacion', dataIndex: 'tipoFacturacion', render: (v: string) => v?.replace(/_/g, ' ') ?? '—' },
    { title: 'Inicio', key: 'fechaInicio', dataIndex: 'fechaInicio', render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '' },
    { title: 'Horas', key: 'totalHorasRegistradas', dataIndex: 'totalHorasRegistradas', render: (v: number) => v != null ? `${Number(v).toFixed(1)}h` : '' },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📁 Expedientes</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['sp-expedientes']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>Nuevo Expediente</Button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar por estado" allowClear style={{ width: 160 }} value={filtroEstado} onChange={v => setFiltroEstado(v)}>
          {ESTADOS.map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
      </div>

      <Table dataSource={Array.isArray(data) ? data : []} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

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
