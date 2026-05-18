import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Card, Row, Col, Typography, Statistic, Tag, Space,
         Modal, Form, Input, InputNumber, Select, message, Popconfirm,
         Tabs, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, FileTextOutlined, FilePdfOutlined, LoadingOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const TIPOS_RETENCION = [
  { value: 'profesional',        label: '👨‍💼 Servicios Profesionales — 10%' },
  { value: 'servicios_tecnicos', label: '🔧 Servicios Técnicos — 10%' },
  { value: 'alquileres',         label: '🏠 Alquileres — 10%' },
  { value: 'otros_servicios',    label: '📋 Otros Servicios — 5%' },
  { value: 'dividendos',         label: '💰 Dividendos — 10%' },
  { value: 'intereses',          label: '🏦 Intereses — 10%' },
];

const TASAS: Record<string, number> = {
  profesional: 10, servicios_tecnicos: 10, alquileres: 10,
  otros_servicios: 5, dividendos: 10, intereses: 10,
};

const retencionApi = {
  list:     (p = 1) => api.get(`/retenciones?page=${p}`).then(r => r.data?.data ?? r.data),
  create:   (body: any) => api.post('/retenciones', body).then(r => r.data?.data ?? r.data),
  remove:   (id: number) => api.delete(`/retenciones/${id}`).then(r => r.data?.data ?? r.data),
  ir17:     (mes: number, anio: number) =>
    api.get(`/retenciones/reporte/ir17?mes=${mes}&anio=${anio}`).then(r => r.data?.data ?? r.data),
};

function ListadoTab() {
  const [page,       setPage]       = useState(1);
  const [open,       setOpen]       = useState(false);
  const [pdfPending, setPdfPending] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [tasa, setTasa] = useState(10);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['retenciones', page], queryFn: () => retencionApi.list(page) });

  const createMut = useMutation({
    mutationFn: retencionApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retenciones'] }); setOpen(false); form.resetFields(); message.success('Retención registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });
  const removeMut = useMutation({
    mutationFn: retencionApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['retenciones'] }); message.success('Eliminada'); },
  });

  const descargarPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const token = localStorage.getItem('access_token') ?? '';
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/retenciones/${item.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${`RET-${String(item.id).padStart(6,'0')}`}.pdf`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  const COLS_DEF = [
    { key: 'periodo',            label: 'Período',    defaultVisible: true  },
    { key: 'nombreProveedor',    label: 'Proveedor',  defaultVisible: true  },
    { key: 'rncProveedor',       label: 'RNC',        defaultVisible: false },
    { key: 'tipoServicio',       label: 'Tipo',       defaultVisible: true  },
    { key: 'montoBruto',         label: 'Bruto',      defaultVisible: true  },
    { key: 'porcentajeRetencion',label: '% Ret.',     defaultVisible: false },
    { key: 'montoRetenido',      label: 'Retenido',   defaultVisible: true  },
    { key: 'montoNeto',          label: 'Neto',       defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('retenciones', COLS_DEF);

  const cols = [
    { title: 'Período',    dataIndex: 'periodo',           key: 'periodo',            width: 90 },
    { title: 'Proveedor',  dataIndex: 'nombreProveedor',   key: 'nombreProveedor',    ellipsis: true },
    { title: 'RNC',        dataIndex: 'rncProveedor',      key: 'rncProveedor',       width: 110, render: (v: string) => v ?? '—' },
    { title: 'Tipo',       dataIndex: 'tipoServicio',      key: 'tipoServicio',       width: 150,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v.replace('_', ' ')}</Tag> },
    { title: 'Bruto',      dataIndex: 'montoBruto',        key: 'montoBruto',         width: 120, render: (v: number) => fmt.money(v) },
    { title: '% Ret.',     dataIndex: 'porcentajeRetencion', key: 'porcentajeRetencion', width: 80, render: (v: number) => `${v}%` },
    { title: 'Retenido',   dataIndex: 'montoRetenido',     key: 'montoRetenido',      width: 110,
      render: (v: number) => <Text style={{ color: '#ef4444' }} strong>{fmt.money(v)}</Text> },
    { title: 'Neto',       dataIndex: 'montoNeto',         key: 'montoNeto',          width: 110,
      render: (v: number) => <Text style={{ color: '#10b981' }} strong>{fmt.money(v)}</Text> },
    { title: '', key: 'del', width: 80,
      render: (_: any, r: any) => (
        <Space size={2}>
          <Button size="small" type="text"
            icon={pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />}
            disabled={pdfPending === r.id}
            onClick={() => descargarPDF(r)}
            title="Descargar PDF"
          />
          <Popconfirm title="¿Eliminar?" onConfirm={() => removeMut.mutate(r.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  const handleTipoChange = (v: string) => setTasa(TASAS[v] ?? 10);

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Space size={2}>
          <RefreshByKeyButton queryKey={['retenciones']} />
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>
            Registrar retención
          </Button>
        </Space>
      </Row>
      <Table columns={filterColumns(cols)} dataSource={data?.data ?? []} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />

      <Modal title="Registrar Retención ISR" open={open} onCancel={() => setOpen(false)} footer={null} width={580}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Las retenciones ISR se aplican cuando pagas servicios profesionales. Ley 11-92 Art. 308." />
        <Form form={form} layout="vertical" onFinish={v => createMut.mutate(v)}
          initialValues={{ periodo: dayjs().format('YYYY-MM'), porcentajeRetencion: 10 }}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="periodo" label="Período" rules={[{ required: true }]}><Input placeholder="2026-05" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombreProveedor" label="Nombre del proveedor" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="rncProveedor" label="RNC del proveedor"><Input /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="tipoServicio" label="Tipo de servicio" rules={[{ required: true }]}>
              <Select options={TIPOS_RETENCION} onChange={handleTipoChange} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcionServicio" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="montoBruto" label="Monto Bruto (RD$)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} onChange={v => {
                const retenido = Number(((v ?? 0) * tasa / 100).toFixed(2));
                form.setFieldsValue({ montoRetenido: retenido, montoNeto: Number(((v ?? 0) - retenido).toFixed(2)) });
              }} />
            </Form.Item></Col>
            <Col xs={12} sm={4}><Form.Item name="porcentajeRetencion" label="% Ret."><Input readOnly value={tasa} /></Form.Item></Col>
            <Col xs={12} sm={5}><Form.Item name="montoRetenido" label="Monto Retenido"><InputNumber style={{ width: '100%' }} readOnly /></Form.Item></Col>
            <Col xs={12} sm={5}><Form.Item name="montoNeto" label="Monto Neto"><InputNumber style={{ width: '100%' }} readOnly /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

function IR17Tab() {
  const [mes,  setMes]  = useState(dayjs().month() + 1);
  const [anio, setAnio] = useState(dayjs().year());

  const { data, isLoading } = useQuery({
    queryKey: ['ir17', mes, anio],
    queryFn:  () => retencionApi.ir17(mes, anio),
  });

  const exportar = () => {
    if (!data?.retenciones?.length) return;
    exportarExcel(data.retenciones.map((r: any) => ({
      'Período':        r.periodo,
      'Proveedor':      r.nombreProveedor,
      'RNC':            r.rncProveedor ?? '',
      'Tipo Servicio':  r.tipoServicio,
      'Descripción':    r.descripcionServicio,
      'Monto Bruto':    Number(r.montoBruto),
      'Tasa %':         Number(r.porcentajeRetencion),
      'Monto Retenido': Number(r.montoRetenido),
      'Monto Neto':     Number(r.montoNeto),
    })), `IR-17-${anio}-${String(mes).padStart(2,'0')}`);
  };

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col>
          <Select value={mes} onChange={setMes} style={{ width: 140 }}
            options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }))} />
        </Col>
        <Col>
          <Select value={anio} onChange={setAnio} style={{ width: 100 }}
            options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
        </Col>
        <Col>
          <Button icon={<FileTextOutlined />} onClick={exportar} disabled={!data?.retenciones?.length}>
            Exportar IR-17 Excel
          </Button>
        </Col>
      </Row>

      {data && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Transacciones', value: data.resumen?.cantidadTransacciones, money: false },
              { title: 'Total Bruto',   value: data.resumen?.totalBruto,    color: '#1677ff' },
              { title: 'Total Retenido', value: data.resumen?.totalRetenido, color: '#ef4444' },
              { title: 'Total Neto',    value: data.resumen?.totalNeto,     color: '#10b981' },
            ].map(k => (
              <Col xs={12} sm={6} key={k.title}>
                <Card size="small">
                  <Statistic title={k.title} value={k.value ?? 0}
                    formatter={v => k.money === false ? v : fmt.money(Number(v))}
                    valueStyle={{ color: (k as any).color }} />
                </Card>
              </Col>
            ))}
          </Row>

          <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
            dataSource={data.retenciones ?? []} rowKey="id"
            columns={[
              { title: 'Proveedor',     dataIndex: 'nombreProveedor',    ellipsis: true },
              { title: 'RNC',           dataIndex: 'rncProveedor',       width: 110, render: (v: string) => v ?? '—' },
              { title: 'Tipo',          dataIndex: 'tipoServicio',       width: 130, render: (v: string) => v.replace('_',' ') },
              { title: 'Bruto',         dataIndex: 'montoBruto',         width: 120, render: (v: number) => fmt.money(v) },
              { title: '% Ret.',        dataIndex: 'porcentajeRetencion',width: 80,  render: (v: number) => `${v}%` },
              { title: 'Retenido',      dataIndex: 'montoRetenido',      width: 110,
                render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
            ]} />
        </>
      )}

      {!isLoading && !data?.retenciones?.length && (
        <Text type="secondary">No hay retenciones registradas para {dayjs().month(mes - 1).format('MMMM')} {anio}</Text>
      )}
    </>
  );
}

export default function RetencionesPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 8 }}>Retenciones ISR</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Código Tributario RD — Ley 11-92, Art. 308 · Declaración mensual IR-17 DGII
      </Text>

      <Card>
        <Tabs defaultActiveKey="listado" items={[
          { key: 'listado', label: '📋 Retenciones registradas', children: <ListadoTab /> },
          { key: 'ir17',    label: '📊 Reporte IR-17 DGII',       children: <IR17Tab /> },
        ]} />
      </Card>
    </div>
  );
}
