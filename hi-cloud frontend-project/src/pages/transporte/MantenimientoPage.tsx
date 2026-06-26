import { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Popconfirm, message, InputNumber,
  Alert, List,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ToolOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title } = Typography;
const { Option } = Select;

type Mant = {
  id: number; fecha: string; vehiculoPlaca?: string; vehiculoDescripcion?: string;
  tipo: string; descripcion: string; costo: string; proveedor?: string;
  odometroActual?: string; proximaFecha?: string; proximoKm?: string;
  estado: string; notas?: string;
};
type Vehiculo = { id: number; placa: string; marca: string; modelo: string };

async function fetchMantenimientos(page: number, vehiculoId?: number, estado?: string) {
  const params: Record<string, any> = { page, limit: 50 };
  if (vehiculoId) params.vehiculoId = vehiculoId;
  if (estado)     params.estado     = estado;
  const { data } = await api.get('/transporte/mantenimiento', { params });
  return data as { data: Mant[]; total: number; page: number; limit: number };
}
async function fetchProgramado() { const { data } = await api.get('/transporte/mantenimiento/programado'); return data as Mant[]; }
async function fetchVehiculos(): Promise<Vehiculo[]> { const { data } = await api.get('/transporte/vehiculos'); return data; }

const ESTADO_COLOR: Record<string, string> = {
  programado: 'blue', en_proceso: 'orange', completado: 'green', cancelado: 'red',
};
const TIPO_COLOR: Record<string, string> = {
  preventivo: 'cyan', correctivo: 'orange', emergencia: 'red',
};

export default function MantenimientoPage() {
  const qc = useQueryClient();
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState<Mant | null>(null);
  const [page,       setPage]       = useState(1);
  const [filtroVeh,  setFiltroVeh]  = useState<number | undefined>(undefined);
  const [filtroEst,  setFiltroEst]  = useState<string | undefined>(undefined);
  const [form]                      = Form.useForm();

  const { data: result,      isLoading } = useQuery({ queryKey: ['tr-mantenimiento', page, filtroVeh, filtroEst], queryFn: () => fetchMantenimientos(page, filtroVeh, filtroEst) });
  const { data: programados = []       } = useQuery({ queryKey: ['tr-mantenimiento-prog'], queryFn: fetchProgramado });
  const { data: vehiculos   = []       } = useQuery({ queryKey: ['tr-vehiculos'], queryFn: fetchVehiculos });

  const save = useMutation({
    mutationFn: (vals: any) => editing
      ? api.put(`/transporte/mantenimiento/${editing.id}`, vals)
      : api.post('/transporte/mantenimiento', vals),
    onSuccess: () => {
      message.success('Guardado');
      qc.invalidateQueries({ queryKey: ['tr-mantenimiento'] });
      qc.invalidateQueries({ queryKey: ['tr-mantenimiento-prog'] });
      closeModal();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/transporte/mantenimiento/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tr-mantenimiento'] });
      qc.invalidateQueries({ queryKey: ['tr-mantenimiento-prog'] });
    },
  });

  function openNew()  { setEditing(null); form.resetFields(); setOpen(true); }
  function openEdit(r: Mant) {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      costo:        Number(r.costo),
      odometroActual: r.odometroActual ? Number(r.odometroActual) : undefined,
      proximoKm:    r.proximoKm ? Number(r.proximoKm) : undefined,
      fecha:        r.fecha       ? dayjs(r.fecha)       : undefined,
      proximaFecha: r.proximaFecha ? dayjs(r.proximaFecha) : undefined,
    });
    setOpen(true);
  }
  function closeModal() { setOpen(false); form.resetFields(); }

  function handleSubmit(vals: any) {
    save.mutate({
      ...vals,
      fecha:        vals.fecha        ? vals.fecha.format('YYYY-MM-DD')       : undefined,
      proximaFecha: vals.proximaFecha ? vals.proximaFecha.format('YYYY-MM-DD') : undefined,
    });
  }

  const columns = [
    { title: 'Fecha',     dataIndex: 'fecha',               key: 'fecha',    width: 100, render: (v: string) => v?.substring(0,10) },
    { title: 'Vehículo',  dataIndex: 'vehiculoPlaca',       key: 'vehiculo', render: (v?: string, r?: Mant) => v ? `${v} ${r?.vehiculoDescripcion ?? ''}` : '—' },
    { title: 'Tipo',      dataIndex: 'tipo',                key: 'tipo',     render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{v.toUpperCase()}</Tag> },
    { title: 'Descripción', dataIndex: 'descripcion',       key: 'desc',     ellipsis: true },
    { title: 'Costo',     dataIndex: 'costo',               key: 'costo',    align: 'right' as const, render: (v: string) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
    { title: 'Proveedor', dataIndex: 'proveedor',           key: 'proveedor', render: (v?: string) => v ?? '—' },
    {
      title: 'Próx. Mant.', key: 'proximo', render: (_: any, r: Mant) => {
        if (!r.proximaFecha) return r.proximoKm ? `${Number(r.proximoKm).toLocaleString()} km` : '—';
        const days = Math.ceil((new Date(r.proximaFecha).getTime() - Date.now()) / 86_400_000);
        const color = days < 0 ? 'red' : days <= 7 ? 'orange' : 'default';
        return <Tag color={color}>{r.proximaFecha.substring(0,10)}</Tag>;
      },
    },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v.replace('_',' ').toUpperCase()}</Tag> },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: Mant) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="¿Eliminar?" onConfirm={() => del.mutate(r.id)} okText="Sí">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {programados.length > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 16 }}
          icon={<WarningOutlined />}
          showIcon
          message={`${programados.length} mantenimiento(s) pendiente(s)`}
          description={
            <List
              size="small"
              dataSource={programados.slice(0, 5)}
              renderItem={(m) => (
                <List.Item>
                  <strong>{m.vehiculoPlaca ?? '—'}</strong> — {m.descripcion}
                  {m.proximaFecha && <Tag color="orange" style={{ marginLeft: 8 }}>{m.proximaFecha.substring(0,10)}</Tag>}
                </List.Item>
              )}
            />
          }
        />
      )}

      <Space style={{ marginBottom: 16 }} wrap>
        <Title level={3} style={{ margin: 0 }}><ToolOutlined /> Mantenimiento</Title>
        <Select
          allowClear placeholder="Vehículo" style={{ width: 200 }}
          value={filtroVeh} onChange={v => { setFiltroVeh(v); setPage(1); }}
          showSearch optionFilterProp="children"
        >
          {vehiculos.map(v => <Option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</Option>)}
        </Select>
        <Select
          allowClear placeholder="Estado" style={{ width: 150 }}
          value={filtroEst} onChange={v => { setFiltroEst(v); setPage(1); }}
        >
          {['programado','en_proceso','completado','cancelado'].map(e => (
            <Option key={e} value={e}><Tag color={ESTADO_COLOR[e]}>{e.replace('_',' ').toUpperCase()}</Tag></Option>
          ))}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Mantenimiento</Button>
      </Space>

      <Table
        dataSource={result?.data ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{
          current: page, pageSize: result?.limit ?? 50, total: result?.total ?? 0,
          onChange: setPage, showTotal: t => `${t} registros`,
        }}
      />

      <Modal
        open={open}
        title={editing ? 'Editar Mantenimiento' : 'Nuevo Mantenimiento'}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={620}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ tipo: 'preventivo', estado: 'programado', fecha: dayjs() }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="vehiculoId" label="Vehículo" style={{ flex: 2 }}>
              <Select allowClear showSearch optionFilterProp="children" placeholder="Seleccionar">
                {vehiculos.map(v => <Option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="tipo"   label="Tipo"   style={{ flex: 1 }}>
              <Select>
                <Option value="preventivo">Preventivo</Option>
                <Option value="correctivo">Correctivo</Option>
                <Option value="emergencia">Emergencia</Option>
              </Select>
            </Form.Item>
            <Form.Item name="estado" label="Estado" style={{ flex: 1 }}>
              <Select>
                <Option value="programado">Programado</Option>
                <Option value="en_proceso">En Proceso</Option>
                <Option value="completado">Completado</Option>
                <Option value="cancelado">Cancelado</Option>
              </Select>
            </Form.Item>
          </Space.Compact>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, min: 3 }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="fecha"    label="Fecha Realización" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="costo"    label="Costo RD$"         style={{ flex: 1 }}><InputNumber min={0} precision={2} prefix="RD$" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="proveedor" label="Proveedor/Taller"  style={{ flex: 2 }}><Input /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="odometroActual" label="Odómetro Actual (km)" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="proximaFecha"   label="Próx. Mantenimiento"   style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="proximoKm"      label="Próx. Km"              style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
