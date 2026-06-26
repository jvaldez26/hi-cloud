import { useState } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select,
  DatePicker, Typography, Popconfirm, message, InputNumber,
  Card, Row, Col, Statistic,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api, { extractList, extractData } from '../../api/client';

const { Title } = Typography;
const { Option } = Select;

type Registro = {
  id: number; fecha: string; vehiculoPlaca?: string; choferNombre?: string;
  tipoCombustible: string; galones?: string; precioGalon?: string;
  total: string; odometro?: string; estacion?: string; notas?: string;
};
type Vehiculo = { id: number; placa: string; marca: string; modelo: string };
type Chofer   = { id: number; nombre: string };

async function fetchCombustible(page: number, vehiculoId?: number) {
  const params: Record<string, any> = { page, limit: 50 };
  if (vehiculoId) params.vehiculoId = vehiculoId;
  const r = await api.get('/transporte/combustible', { params });
  return r.data?.data as { data: Registro[]; total: number; page: number; limit: number };
}
async function fetchStats()   { return api.get('/transporte/combustible/stats').then(extractData); }
async function fetchVehiculos(): Promise<Vehiculo[]> { return api.get('/transporte/vehiculos').then(extractList); }
async function fetchChoferes(): Promise<Chofer[]>    { return api.get('/transporte/choferes').then(extractList); }

const TIPO_COLOR: Record<string, string> = { gasolina: 'orange', diesel: 'blue', gas: 'green' };

export default function CombustiblePage() {
  const qc = useQueryClient();
  const [open,       setOpen]       = useState(false);
  const [page,       setPage]       = useState(1);
  const [filtroVeh,  setFiltroVeh]  = useState<number | undefined>(undefined);
  const [form]                      = Form.useForm();

  const { data: result, isLoading } = useQuery({ queryKey: ['tr-combustible', page, filtroVeh], queryFn: () => fetchCombustible(page, filtroVeh) });
  const { data: stats              } = useQuery({ queryKey: ['tr-combustible-stats'], queryFn: fetchStats });
  const { data: vehiculos = []     } = useQuery({ queryKey: ['tr-vehiculos'],  queryFn: fetchVehiculos });
  const { data: choferes  = []     } = useQuery({ queryKey: ['tr-choferes'],   queryFn: fetchChoferes  });

  const save = useMutation({
    mutationFn: (vals: any) => api.post('/transporte/combustible', vals),
    onSuccess: () => {
      message.success('Registro guardado');
      qc.invalidateQueries({ queryKey: ['tr-combustible'] });
      qc.invalidateQueries({ queryKey: ['tr-combustible-stats'] });
      setOpen(false); form.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/transporte/combustible/${id}`),
    onSuccess: () => {
      message.success('Eliminado');
      qc.invalidateQueries({ queryKey: ['tr-combustible'] });
      qc.invalidateQueries({ queryKey: ['tr-combustible-stats'] });
    },
  });

  function handleSubmit(vals: any) {
    const totalCalc = vals.galones && vals.precioGalon
      ? Math.round(Number(vals.galones) * Number(vals.precioGalon) * 100) / 100
      : vals.total;
    save.mutate({
      ...vals,
      total: totalCalc,
      fecha: vals.fecha ? vals.fecha.format('YYYY-MM-DD') : undefined,
    });
  }

  const columns = [
    { title: 'Fecha',     dataIndex: 'fecha',          key: 'fecha',    width: 100, render: (v: string) => v?.substring(0,10) },
    { title: 'Vehículo',  dataIndex: 'vehiculoPlaca',  key: 'vehiculo', render: (v?: string) => v ?? '—' },
    { title: 'Chofer',    dataIndex: 'choferNombre',   key: 'chofer',   render: (v?: string) => v ?? '—' },
    { title: 'Tipo',      dataIndex: 'tipoCombustible', key: 'tipo',    render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Galones',   dataIndex: 'galones',        key: 'galones',  align: 'right' as const, render: (v?: string) => v ? Number(v).toFixed(3) : '—' },
    { title: 'P/Galón',   dataIndex: 'precioGalon',    key: 'precio',   align: 'right' as const, render: (v?: string) => v ? `RD$${Number(v).toFixed(2)}` : '—' },
    { title: 'Total',     dataIndex: 'total',          key: 'total',    align: 'right' as const, render: (v: string) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
    { title: 'Odómetro',  dataIndex: 'odometro',       key: 'odometro', render: (v?: string) => v ? `${Number(v).toLocaleString()} km` : '—' },
    { title: 'Estación',  dataIndex: 'estacion',       key: 'estacion', render: (v?: string) => v ?? '—' },
    {
      title: '', key: 'actions', width: 60,
      render: (_: any, r: Registro) => (
        <Popconfirm title="¿Eliminar registro?" onConfirm={() => del.mutate(r.id)} okText="Sí">
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Stats del mes */}
      <Row gutter={[16,16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Costo del Mes"   value={stats?.mesActual?.costo   ?? 0} precision={2} prefix="RD$" valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Galones del Mes" value={stats?.mesActual?.galones ?? 0} precision={3} suffix="gal" />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Cargas del Mes"  value={stats?.mesActual?.cargas  ?? 0} />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Title level={3} style={{ margin: 0 }}>Combustible</Title>
        <Select
          allowClear placeholder="Filtrar por vehículo" style={{ width: 200 }}
          value={filtroVeh}
          onChange={v => { setFiltroVeh(v); setPage(1); }}
          showSearch optionFilterProp="children"
        >
          {vehiculos.map(v => <Option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</Option>)}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
          Registrar Carga
        </Button>
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
        title="Registrar Carga de Combustible"
        onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ tipoCombustible: 'gasolina', fecha: dayjs() }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="vehiculoId" label="Vehículo" style={{ flex: 2 }}>
              <Select allowClear showSearch optionFilterProp="children" placeholder="Seleccionar">
                {vehiculos.map(v => <Option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="choferId" label="Chofer" style={{ flex: 2 }}>
              <Select allowClear showSearch optionFilterProp="children" placeholder="Seleccionar">
                {choferes.map(c => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
              </Select>
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="fecha"           label="Fecha"       style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="tipoCombustible" label="Tipo"        style={{ flex: 1 }}>
              <Select>
                <Option value="gasolina">Gasolina</Option>
                <Option value="diesel">Diesel</Option>
                <Option value="gas">Gas</Option>
              </Select>
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="galones"    label="Galones"   style={{ flex: 1 }}><InputNumber min={0} precision={3} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="precioGalon" label="P/Galón"  style={{ flex: 1 }}><InputNumber min={0} precision={2} prefix="RD$" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="total"      label="Total RD$" style={{ flex: 1 }}><InputNumber min={0} precision={2} prefix="RD$" style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="odometro" label="Odómetro (km)" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="estacion" label="Estación"       style={{ flex: 2 }}><Input /></Form.Item>
          </Space.Compact>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
