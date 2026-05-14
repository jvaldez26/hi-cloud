import { useState } from 'react';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic,
         Modal, Form, Input, InputNumber, Select, DatePicker, Space,
         Popconfirm, message, Drawer, Descriptions } from 'antd';
import { PlusOutlined, FileTextOutlined, PlayCircleOutlined, PauseCircleOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const PERIODOS = [
  { value: 'mensual',    label: '📅 Mensual' },
  { value: 'bimestral',  label: '📅 Bimestral (2 meses)' },
  { value: 'trimestral', label: '📅 Trimestral (3 meses)' },
  { value: 'semestral',  label: '📅 Semestral (6 meses)' },
  { value: 'anual',      label: '📅 Anual' },
];

const estadoColor: Record<string, string> = {
  activo: 'green', vencido: 'red', cancelado: 'default', suspendido: 'orange',
};

const contratosApi = {
  list:     (p = 1, estado?: string) =>
    api.get(`/contratos?page=${p}${estado ? `&estado=${estado}` : ''}`).then(r => r.data?.data ?? r.data),
  crear:    (body: any)   => api.post('/contratos', body).then(r => r.data?.data ?? r.data),
  estado:   (id: number, estado: string) => api.patch(`/contratos/${id}/estado`, { estado }).then(r => r.data?.data ?? r.data),
  facturar: (id: number)  => api.post(`/contratos/${id}/facturar`).then(r => r.data?.data ?? r.data),
};

export default function ContratosPage() {
  const [page,    setPage]    = useState(1);
  const [estadoF, setEstadoF] = useState<string | undefined>();
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [detail,  setDetail]  = useState<any>(null);
  const [form]                = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contratos', page, estadoF],
    queryFn:  () => contratosApi.list(page, estadoF),
  });

  const { data: clientes } = useQuery({ queryKey: ['cli-ctr'], queryFn: () => clientesApi.list(1, 100) });

  const crearMut   = useMutation({
    mutationFn: contratosApi.crear,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contratos'] }); setOpen(false); form.resetFields(); message.success('Contrato creado'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const estadoMut  = useMutation({
    mutationFn: ({ id, estado }: any) => contratosApi.estado(id, estado),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contratos'] }); setDetail(null); message.success('Estado actualizado'); },
  });

  const facturarMut = useMutation({
    mutationFn: contratosApi.facturar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contratos'] }); message.success('Factura generada'); setDetail(null); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const handleCreate = (v: any) => {
    crearMut.mutate({
      ...v,
      fechaInicio: v.fechaInicio.format('YYYY-MM-DD'),
      fechaFin:    v.fechaFin?.format('YYYY-MM-DD'),
    });
  };

  const cols = [
    { title: 'Número',    dataIndex: 'numero',     width: 155, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Cliente',   key: 'cli', ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Nombre',    dataIndex: 'nombre',     ellipsis: true },
    { title: 'Período',   dataIndex: 'periodoFacturacion', width: 110,
      render: (v: string) => PERIODOS.find(p => p.value === v)?.label.replace('📅 ', '') ?? v },
    { title: 'Monto',     dataIndex: 'montoBase',  width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Próxima',   dataIndex: 'proximaFactura', width: 100,
      render: (v: string) => v ? <Text type={new Date(v) < new Date() ? 'danger' : 'secondary'}>{fmt.date(v)}</Text> : '—' },
    { title: 'Estado',    dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 80,
      render: (_: any, r: any) => <Button size="small" onClick={() => setDetail(r)}>Ver</Button> },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Contratos de Servicio</Title>

      <Card extra={
        <Space wrap>
          <Input
            placeholder="Buscar cliente o contrato..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear style={{ width: 200 }}
          />
          <Select placeholder="Estado" allowClear style={{ width: 140 }}
            value={estadoF} onChange={(v) => { setEstadoF(v); setPage(1); }}
            options={['activo','vencido','cancelado','suspendido'].map(v => ({
              value: v, label: <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag>,
            }))} />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((c: any) => ({
              'Número':    c.numero ?? '',
              'Cliente':   c.cliente?.nombre ?? '',
              'Nombre':    c.nombre ?? '',
              'Período':   c.periodoFacturacion ?? '',
              'Monto':     Number(c.montoBase ?? 0),
              'Inicio':    c.fechaInicio ? dayjs(c.fechaInicio).format('DD/MM/YYYY') : '',
              'Fin':       c.fechaFin    ? dayjs(c.fechaFin).format('DD/MM/YYYY')    : '—',
              'Estado':    c.estado ?? '',
              'Facturas':  c.totalFacturasGeneradas ?? 0,
            }));
            exportarExcel(filas, `Contratos-${dayjs().format('YYYY-MM-DD')}`);
            message.success(`${filas.length} contratos exportados`);
          }}>
            Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>
            Nuevo contrato
          </Button>
        </Space>
      }>
        <Table columns={cols} dataSource={(data?.data ?? []).filter((c: any) => {
            if (!search) return true;
            const s = search.toLowerCase();
            return c.cliente?.nombre?.toLowerCase().includes(s) || c.nombre?.toLowerCase().includes(s) || c.numero?.toLowerCase().includes(s);
          })} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Modal crear */}
      <Modal title="Nuevo Contrato de Servicio" open={open} onCancel={() => setOpen(false)} footer={null} width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}
          initialValues={{ periodoFacturacion: 'mensual', porcentajeIva: 18, diaFacturacion: 1, facturaAutomatica: true }}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={clientes?.data.map((c: any) => ({ value: c.id, label: c.nombre }))} />
            </Form.Item></Col>
            <Col span={16}><Form.Item name="nombre" label="Nombre del contrato" rules={[{ required: true }]}><Input placeholder="Mantenimiento mensual, Servicio de limpieza..." /></Form.Item></Col>
            <Col span={8}><Form.Item name="diaFacturacion" label="Día facturación"><InputNumber style={{ width: '100%' }} min={1} max={28} /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcionServicio" label="Descripción del servicio" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="montoBase" label="Monto base (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="porcentajeIva" label="ITBIS %"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
            <Col span={8}><Form.Item name="periodoFacturacion" label="Frecuencia">
              <Select options={PERIODOS} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="fechaInicio" label="Inicio" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={8}><Form.Item name="fechaFin" label="Fin (opcional)"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col span={8}><Form.Item name="facturaAutomatica" label="Factura automática">
              <Select options={[{ value: true, label: '✅ Sí (cron diario)' }, { value: false, label: '⬜ No (manual)' }]} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="terminos" label="Términos y condiciones"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear contrato</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer detalle */}
      <Drawer title={`Contrato ${detail?.numero}`} open={!!detail} onClose={() => setDetail(null)} width={560}
        extra={
          <Space>
            {detail?.estado === 'activo' && (
              <Popconfirm title="¿Generar factura ahora?" onConfirm={() => facturarMut.mutate(detail.id)}>
                <Button type="primary" icon={<FileTextOutlined />} loading={facturarMut.isPending}>Facturar ahora</Button>
              </Popconfirm>
            )}
          </Space>
        }>
        {detail && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Cliente">{detail.cliente?.nombre}</Descriptions.Item>
            <Descriptions.Item label="Nombre">{detail.nombre}</Descriptions.Item>
            <Descriptions.Item label="Servicio">{detail.descripcionServicio}</Descriptions.Item>
            <Descriptions.Item label="Monto base">{fmt.money(detail.montoBase)}</Descriptions.Item>
            <Descriptions.Item label="Período">{PERIODOS.find(p => p.value === detail.periodoFacturacion)?.label}</Descriptions.Item>
            <Descriptions.Item label="Día facturación">Día {detail.diaFacturacion} de cada período</Descriptions.Item>
            <Descriptions.Item label="Inicio">{fmt.date(detail.fechaInicio)}</Descriptions.Item>
            {detail.fechaFin && <Descriptions.Item label="Fin">{fmt.date(detail.fechaFin)}</Descriptions.Item>}
            <Descriptions.Item label="Próxima factura">
              {detail.proximaFactura ? <Text type={new Date(detail.proximaFactura) < new Date() ? 'danger' : undefined}>{fmt.date(detail.proximaFactura)}</Text> : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Facturas generadas">{detail.totalFacturasGeneradas}</Descriptions.Item>
            <Descriptions.Item label="Automática">{detail.facturaAutomatica ? '✅ Sí' : '⬜ No'}</Descriptions.Item>
            <Descriptions.Item label="Estado">
              <Tag color={estadoColor[detail.estado]}>{detail.estado?.toUpperCase()}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
        {detail?.estado === 'activo' && (
          <div style={{ marginTop: 16 }}>
            <Button danger onClick={() => estadoMut.mutate({ id: detail.id, estado: 'cancelado' })}>Cancelar contrato</Button>
            <Button style={{ marginLeft: 8 }} onClick={() => estadoMut.mutate({ id: detail.id, estado: 'suspendido' })}>Suspender</Button>
          </div>
        )}
        {detail?.estado === 'suspendido' && (
          <Button type="primary" icon={<PlayCircleOutlined />} style={{ marginTop: 16 }}
            onClick={() => estadoMut.mutate({ id: detail.id, estado: 'activo' })}>Reactivar</Button>
        )}
      </Drawer>
    </div>
  );
}
