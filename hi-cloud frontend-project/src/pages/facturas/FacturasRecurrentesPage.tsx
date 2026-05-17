import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Space,
         Modal, Form, Input, InputNumber, Select, Popconfirm, message,
         Descriptions, Switch } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseCircleOutlined,
         ThunderboltOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const frecuenciaLabel: Record<string, string> = {
  diaria: '📅 Diaria', semanal: '📆 Semanal',
  mensual: '🗓️ Mensual', anual: '📅 Anual',
};

const recurrenteApi = {
  list:    (p = 1) => api.get(`/facturas-recurrentes?page=${p}`).then(r => r.data?.data ?? r.data),
  create:  (body: any) => api.post('/facturas-recurrentes', body).then(r => r.data?.data ?? r.data),
  toggle:  (id: number) => api.patch(`/facturas-recurrentes/${id}/toggle`).then(r => r.data?.data ?? r.data),
  ejecutar:(id: number) => api.post(`/facturas-recurrentes/${id}/ejecutar-ahora`).then(r => r.data?.data ?? r.data),
  remove:  (id: number) => api.delete(`/facturas-recurrentes/${id}`).then(r => r.data?.data ?? r.data),
};

export default function FacturasRecurrentesPage() {
  const [page,  setPage]  = useState(1);
  const [open,  setOpen]  = useState(false);
  const [form]            = Form.useForm();
  const [lineas, setLineas] = useState([{ descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }]);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['recurrentes', page], queryFn: () => recurrenteApi.list(page) });
  const { data: clientes }  = useQuery({ queryKey: ['clientes-rec'], queryFn: () => clientesApi.list(1, 100) });

  const createMut  = useMutation({ mutationFn: recurrenteApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); setOpen(false); form.resetFields(); setLineas([{ descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }]); message.success('Factura recurrente creada'); }, onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error') });
  const toggleMut  = useMutation({ mutationFn: recurrenteApi.toggle,  onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Estado actualizado'); } });
  const ejecutMut  = useMutation({ mutationFn: recurrenteApi.ejecutar, onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Factura generada'); } });
  const removeMut  = useMutation({ mutationFn: recurrenteApi.remove,   onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurrentes'] }); message.success('Eliminada'); } });

  const handleSubmit = (values: any) => {
    createMut.mutate({
      ...values,
      detalles: lineas.map(l => ({ ...l, porcentajeIva: l.porcentajeIva ?? 18 })),
    });
  };

  const cols = [
    { title: 'Nombre',       dataIndex: 'nombre',            ellipsis: true },
    { title: 'Cliente',      key: 'cli', width: 180, ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Frecuencia',   dataIndex: 'frecuencia',        width: 120,
      render: (v: string) => <Tag>{frecuenciaLabel[v]}</Tag> },
    { title: 'Próxima',      dataIndex: 'proximaEjecucion',  width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Generadas',    dataIndex: 'totalGeneradas',    width: 90 },
    { title: 'Activa',       dataIndex: 'activa',            width: 80,
      render: (v: boolean, r: any) => (
        <Switch checked={v} size="small" loading={toggleMut.isPending}
          onChange={() => toggleMut.mutate(r.id)} />
      )},
    { title: '', key: 'actions', width: 130,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Popconfirm title="¿Generar factura ahora?" onConfirm={() => ejecutMut.mutate(r.id)}>
            <Button size="small" icon={<ThunderboltOutlined />} loading={ejecutMut.isPending} />
          </Popconfirm>
          <Popconfirm title="¿Eliminar?" onConfirm={() => removeMut.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Facturas Recurrentes</Title>
      <Card extra={
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((r: any) => ({
              'Cliente':   r.cliente?.nombre ?? '',
              'Concepto':  r.concepto ?? r.descripcion ?? '',
              'Frecuencia':r.frecuencia ?? r.periodo ?? '',
              'Monto':     Number(r.montoBase ?? r.monto ?? 0),
              'Activa':    r.activa ? 'Sí' : 'No',
              'Próxima':   r.proximaEmision ?? r.proximaFecha ?? '',
              'Generadas': r.totalGeneradas ?? 0,
            }));
            exportarExcel(filas, 'Facturas-Recurrentes');
          }}>Excel</Button>
          <RefreshByKeyButton queryKey={['recurrentes']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>
            Nueva recurrente
          </Button>
        </Space>
      }>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />
      </Card>

      <Modal title="Nueva Factura Recurrente" open={open} onCancel={() => setOpen(false)} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ frecuencia: 'mensual', diaEjecucion: 1, fechaInicio: dayjs().format('YYYY-MM-DD') }}>
          <Row gutter={12}>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre descriptivo" rules={[{ required: true }]}><Input placeholder="Servicio mensual de contabilidad" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={clientes?.data.map((c: any) => ({ value: c.id, label: c.nombre }))} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="frecuencia" label="Frecuencia"><Select options={Object.keys(frecuenciaLabel).map(k => ({ value: k, label: frecuenciaLabel[k] }))} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="diaEjecucion" label="Día del mes"><InputNumber style={{ width: '100%' }} min={1} max={28} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaInicio" label="Primera ejecución"><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaFin" label="Fecha fin (opcional)"><Input type="date" /></Form.Item></Col>
          </Row>

          <Title level={5}>Ítems de la factura</Title>
          {lineas.map((l, i) => (
            <Row key={i} gutter={8} style={{ marginBottom: 8 }}>
              <Col xs={24} sm={10}><Input placeholder="Descripción" value={l.descripcion} onChange={e => { const u=[...lineas]; u[i].descripcion=e.target.value; setLineas(u); }} /></Col>
              <Col xs={12} sm={3}><InputNumber placeholder="Cant." min={1} value={l.cantidad} style={{ width:'100%' }} onChange={v => { const u=[...lineas]; u[i].cantidad=v??1; setLineas(u); }} /></Col>
              <Col xs={12} sm={5}><InputNumber placeholder="Precio" min={0} precision={2} value={l.precioUnitario} style={{ width:'100%' }} onChange={v => { const u=[...lineas]; u[i].precioUnitario=v??0; setLineas(u); }} /></Col>
              <Col xs={12} sm={4}><InputNumber placeholder="ITBIS%" min={0} max={100} value={l.porcentajeIva} style={{ width:'100%' }} onChange={v => { const u=[...lineas]; u[i].porcentajeIva=v??18; setLineas(u); }} /></Col>
              <Col xs={12} sm={2}><Button danger size="small" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>×</Button></Col>
            </Row>
          ))}
          <Button size="small" onClick={() => setLineas([...lineas, { descripcion: '', cantidad: 1, precioUnitario: 0, porcentajeIva: 18 }])}>
            + Agregar ítem
          </Button>

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
