import { useState } from 'react';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic, Modal,
         Form, Input, InputNumber, Select, Tabs, message, Space, Drawer, Progress } from 'antd';
import { PlusOutlined, BarChartOutlined, CheckOutlined, FileExcelOutlined, FilePdfOutlined, LoadingOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { presupuestosApi } from '../../api/presupuestos.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

const estadoColor: Record<string, string> = { borrador: 'default', aprobado: 'blue', cerrado: 'green' };
const tipoLabel:  Record<string, string>  = { ventas: 'Ventas', compras: 'Compras', gastos: 'Gastos', caja: 'Caja', general: 'General' };

export default function PresupuestosPage() {
  const [anio,       setAnio]       = useState(dayjs().year());
  const [open,       setOpen]       = useState(false);
  const [openVar,    setOpenVar]    = useState<any>(null);
  const [page,       setPage]       = useState(1);
  const [pdfPending, setPdfPending] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: dashboard } = useQuery({ queryKey: ['pres-dash', anio],  queryFn: () => presupuestosApi.dashboard(anio) });
  const { data: comparativa } = useQuery({ queryKey: ['comparativa', anio], queryFn: () => presupuestosApi.comparativa(anio) });
  const { data: lista, isLoading } = useQuery({ queryKey: ['presupuestos', page, anio], queryFn: () => presupuestosApi.list(page, 10, anio) });
  const { data: variacion } = useQuery({ queryKey: ['variacion', openVar?.id], queryFn: () => presupuestosApi.variacion(openVar.id), enabled: !!openVar });

  const errMsg = (e: any) => e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado';

  const createMut  = useMutation({
    mutationFn: presupuestosApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); setOpen(false); form.resetFields(); message.success('Presupuesto creado'); },
    onError:   (e: any) => message.error(errMsg(e), 5),
  });
  const aprobarMut = useMutation({
    mutationFn: presupuestosApi.aprobar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); message.success('Presupuesto aprobado'); },
    onError:   (e: any) => message.error(errMsg(e), 5),
  });

  const descargarPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/presupuestos/${item.id}/pdf`, {
      credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${`PRES-${String(item.id).padStart(4,'0')}`}.pdf`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  const COLS_DEF = [
    { key: 'anio',              label: 'Año',    defaultVisible: true  },
    { key: 'nombre',            label: 'Nombre', defaultVisible: true  },
    { key: 'tipo',              label: 'Tipo',   defaultVisible: true  },
    { key: 'totalPresupuestado',label: 'Total',  defaultVisible: true  },
    { key: 'estado',            label: 'Estado', defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('presupuestos', COLS_DEF);

  const presCols = [
    { title: 'Año',    dataIndex: 'anio',              key: 'anio',              width: 70 },
    { title: 'Nombre', dataIndex: 'nombre',            key: 'nombre',            ellipsis: true },
    { title: 'Tipo',   dataIndex: 'tipo',              key: 'tipo',              width: 90, render: (v: string) => <Tag>{tipoLabel[v]}</Tag> },
    { title: 'Total',  dataIndex: 'totalPresupuestado',key: 'totalPresupuestado',width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Estado', dataIndex: 'estado',            key: 'estado',            width: 100, render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setOpenVar(r)}
          viewLabel="Ver variación"
          items={[
            {
              key: 'pdf',
              label: pdfPending === r.id ? 'Generando PDF...' : 'Descargar PDF',
              disabled: pdfPending === r.id,
              onClick: () => descargarPDF(r),
            },
            r.estado === 'borrador' ? {
              key: 'aprobar',
              label: 'Aprobar',
              onClick: () => aprobarMut.mutate(r.id),
            } : null,
          ].filter(Boolean)}
        />
      )},
  ];

  const comparChart = (comparativa?.meses ?? []).map((m: any) => ({
    mes: m.etiqueta, ventas: m.ventas, compras: m.compras, gastos: m.gastos,
  }));

  const varChart = (variacion?.meses ?? []).map((m: any) => ({
    mes: m.etiqueta, presupuestado: m.presupuestado, real: m.real,
  }));

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Presupuestos y Planificación</Title>

      <Tabs defaultActiveKey="dashboard" items={[
        {
          key: 'dashboard', label: '📊 Dashboard',
          children: (
            <>
              <Row justify="end" style={{ marginBottom: 12 }}>
                <Select value={anio} onChange={setAnio} style={{ width: 100 }}
                  options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
              </Row>

              {/* Tarjetas de ejecución */}
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                {(dashboard?.tarjetas ?? []).map((t: any) => (
                  <Col xs={24} sm={8} key={t.tipo}>
                    <Card title={<><Tag color={t.alerta ? 'red' : 'blue'}>{tipoLabel[t.tipo]}</Tag></>}>
                      <Row gutter={8}>
                        <Col xs={24} sm={12}><Statistic title="Presupuestado" value={t.presupuestado} formatter={v => fmt.money(Number(v))} /></Col>
                        <Col xs={24} sm={12}><Statistic title="Real" value={t.real} formatter={v => fmt.money(Number(v))} valueStyle={{ color: t.alerta ? '#ff4d4f' : '#52c41a' }} /></Col>
                      </Row>
                      <Progress percent={t.porcentajeEjec ?? 0} status={t.alerta ? 'exception' : t.porcentajeEjec >= 90 ? 'success' : 'normal'} style={{ marginTop: 8 }} />
                      <small>{t.porcentajeEjec?.toFixed(1)}% ejecutado | {t.variacion >= 0 ? '+' : ''}{fmt.money(t.variacion)} variación</small>
                    </Card>
                  </Col>
                ))}
              </Row>

              {/* Comparativa real por mes */}
              <Card title={`Ventas / Compras / Gastos reales — ${anio}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => fmt.money(Number(v))} />
                    <Legend />
                    <Bar dataKey="ventas"  name="Ventas"  fill="#1677ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="compras" name="Compras" fill="#fa8c16" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gastos"  name="Gastos"  fill="#ff4d4f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          ),
        },
        {
          key: 'lista', label: '📋 Presupuestos',
          children: (
            <>
              <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                <Col>
                  <Select value={anio} onChange={(v) => { setAnio(v); setPage(1); }} style={{ width: 100 }}
                    options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
                </Col>
                <Col>
                  <Space>
                    <Button icon={<FileExcelOutlined />} onClick={() => {
                      const filas = (lista?.data ?? []).map((p: any) => ({
                        'Año':    p.anio ?? '',
                        'Nombre': p.nombre ?? '',
                        'Tipo':   tipoLabel[p.tipo] ?? p.tipo ?? '',
                        'Total Presupuestado': Number(p.totalPresupuestado ?? 0),
                        'Estado': p.estado ?? '',
                      }));
                      exportarExcel(filas, `Presupuestos-${anio}`);
                      message.success(`${filas.length} presupuestos exportados`);
                    }}>Excel</Button>
                    <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
                    <RefreshByKeyButton queryKey={['presupuestos']} />
                    <VideoTutorialButton />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>Nuevo presupuesto</Button>
                  </Space>
                </Col>
              </Row>
              <Table dataSource={lista?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: lista?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }}
                columns={filterColumns(presCols)} />
            </>
          ),
        },
      ]} />

      {/* Crear presupuesto */}
      <Modal title="Nuevo Presupuesto" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={v => createMut.mutate(v)} initialValues={{ anio: dayjs().year() }}>
          <Form.Item name="anio" label="Año" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={2020} max={2035} /></Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Presupuesto de Ventas 2026" /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={['ventas','compras','gastos','caja','general'].map(v => ({ value: v, label: tipoLabel[v] }))} />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Drawer variación */}
      <Drawer title={`Variación — ${openVar?.nombre}`} open={!!openVar} onClose={() => setOpenVar(null)} width={820}>
        {variacion && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={8}><Statistic title="Presupuestado" value={variacion.totales?.presupuestado} formatter={v => fmt.money(Number(v))} /></Col>
              <Col xs={24} sm={8}><Statistic title="Real" value={variacion.totales?.real} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#1677ff' }} /></Col>
              <Col xs={24} sm={8}><Statistic title="% Ejecución" value={variacion.totales?.porcentajeEjec ?? 0} suffix="%" valueStyle={{ color: (variacion.totales?.porcentajeEjec ?? 0) > 90 ? '#52c41a' : '#fa8c16' }} /></Col>
            </Row>
            <ResponsiveContainer width="100%" height={220} style={{ marginBottom: 16 }}>
              <BarChart data={varChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => fmt.money(Number(v))} />
                <Legend />
                <Bar dataKey="presupuestado" name="Presupuestado" fill="#d9d9d9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="real"          name="Real"          fill="#1677ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Table dataSource={variacion.meses ?? []} rowKey="mes" size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              columns={[
                { title: 'Mes',          dataIndex: 'etiqueta',       width: 60 },
                { title: 'Presupuestado',dataIndex: 'presupuestado',  render: (v: number) => fmt.money(v) },
                { title: 'Real',         dataIndex: 'real',           render: (v: number) => fmt.money(v) },
                { title: 'Variación',    dataIndex: 'variacion',      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{v >= 0 ? '+' : ''}{fmt.money(v)}</span> },
                { title: '% Ejec.',      dataIndex: 'porcentajeEjec', render: (v: number) => v ? `${v}%` : '—' },
                { title: 'Estado',       dataIndex: 'estado',         render: (v: string) => <Tag color={v === 'EN_META' ? 'green' : v === 'SOBRE_PRESUPUESTO' ? 'orange' : 'default'} style={{ fontSize: 10 }}>{v?.replace('_', ' ')}</Tag> },
              ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
