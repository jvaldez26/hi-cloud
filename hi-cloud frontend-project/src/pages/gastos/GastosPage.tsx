import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Card, Row, Col, Typography, Statistic, Tag,
         Modal, Form, Input, InputNumber, Select, DatePicker, message,
         Tabs, Popconfirm, Space, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, FileExcelOutlined, AuditOutlined, FilePdfOutlined, LoadingOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../api/client';
import { ecfApi } from '../../api/ecf.api';
import EcfResultModal from '../../components/ui/EcfResultModal';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const gastosApi = {
  categorias: ()           => api.get('/gastos/categorias').then(r => r.data?.data ?? r.data),
  resumen:    (m: number, a: number) => api.get(`/gastos/resumen?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  anual:      (a: number)  => api.get(`/gastos/anual?anio=${a}`).then(r => r.data?.data ?? r.data),
  list:       (p = 1, m?: number, a?: number, cat?: string) =>
    api.get(`/gastos?page=${p}${m ? `&mes=${m}&anio=${a}` : ''}${cat ? `&categoria=${cat}` : ''}`).then(r => r.data?.data ?? r.data),
  crear:      (body: any)  => api.post('/gastos', body).then(r => r.data?.data ?? r.data),
  eliminar:   (id: number) => api.delete(`/gastos/${id}`).then(r => r.data?.data ?? r.data),
};

const COLORES = ['#1677ff','#10b981','#f59e0b','#ef4444','#7c3aed','#0891b2','#f97316','#84cc16','#ec4899','#6b7280'];

export default function GastosPage() {
  const [page,       setPage]       = useState(1);
  const [mes,        setMes]        = useState(dayjs().month() + 1);
  const [anio,       setAnio]       = useState(dayjs().year());
  const [catFilt,    setCatFilt]    = useState<string | undefined>();
  const [open,       setOpen]       = useState(false);
  const [ecfEncf,    setEcfEncf]    = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState<number | null>(null);
  const [form]                      = Form.useForm();
  const qc = useQueryClient();

  const { data: categorias } = useQuery({ queryKey: ['gasto-cats'], queryFn: gastosApi.categorias });

  // Categoría seleccionada en el form — para comportamiento dinámico
  const categoriaWatch = Form.useWatch('categoria', form);
  const categoriaInfo  = (categorias as any[])?.find((c: any) => c.value === categoriaWatch);
  const generaE43      = categoriaInfo?.generaE43 === true;
  const { data: resumen }    = useQuery({ queryKey: ['gasto-res', mes, anio], queryFn: () => gastosApi.resumen(mes, anio) });
  const { data: anual }      = useQuery({ queryKey: ['gasto-anual', anio], queryFn: () => gastosApi.anual(anio) });
  const { data: lista, isLoading } = useQuery({
    queryKey: ['gastos', page, mes, anio, catFilt],
    queryFn:  () => gastosApi.list(page, mes, anio, catFilt),
  });

  const crearMut   = useMutation({
    mutationFn: gastosApi.crear,
    onSuccess: (_data, vars: any) => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      qc.invalidateQueries({ queryKey: ['gasto-res'] });
      setOpen(false);
      form.resetFields();
      const esE43 = (categorias as any[])?.find((c: any) => c.value === vars.categoria)?.generaE43;
      message.success(esE43
        ? 'Gasto registrado — E43 enviado a DGII automáticamente'
        : 'Gasto registrado con asiento contable');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: gastosApi.eliminar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); message.success('Eliminado'); },
  });

  const descargarPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const token = localStorage.getItem('access_token') ?? '';
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/gastos/${item.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${`GAS-${String(item.id).padStart(6,'0')}`}.pdf`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  const emitirEcfE43 = useMutation({
    mutationFn: (id: number) => ecfApi.emitirEcfGasto(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      if (res?.encf) setEcfEncf(res.encf);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al emitir e-CF E43',
    ),
  });

  const COLS_DEF = [
    { key: 'fecha',       label: 'Fecha',       defaultVisible: true  },
    { key: 'categoria',   label: 'Categoría',   defaultVisible: true  },
    { key: 'descripcion', label: 'Descripción', defaultVisible: true  },
    { key: 'proveedor',   label: 'Proveedor',   defaultVisible: false },
    { key: 'comprobante', label: 'Comprobante', defaultVisible: false },
    { key: 'monto',       label: 'Monto',       defaultVisible: true  },
    { key: 'itbis',       label: 'ITBIS',       defaultVisible: false },
    { key: 'total',       label: 'Total',       defaultVisible: true  },
    { key: 'ecf',         label: 'e-CF',        defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcGastos } = useColumnVisibility('gastos', COLS_DEF);

  const cols = [
    { title: 'Fecha',    key: 'fecha',       dataIndex: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Categoría',key: 'categoria',   dataIndex: 'categoria',   width: 170,
      render: (v: string) => {
        const cat = categorias?.find((c: any) => c.value === v);
        return <Tag style={{ fontSize: 11 }}>{cat?.label ?? v}</Tag>;
      }},
    { title: 'Descripción', key: 'descripcion', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Proveedor',   key: 'proveedor',   dataIndex: 'proveedor',   width: 130, render: (v: string) => v ?? '—' },
    { title: 'Comprobante', key: 'comprobante', dataIndex: 'comprobante', width: 110, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Monto',   key: 'monto',  dataIndex: 'monto',  width: 110, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',   key: 'itbis',  dataIndex: 'itbis',  width: 90, render: (v: number) => v > 0 ? fmt.money(v) : '—' },
    { title: 'Total',   key: 'total',  dataIndex: 'total',  width: 120, render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
    {
      title: 'e-CF', key: 'ecf', width: 130,
      render: (_: any, r: any) => {
        if (r.ecfNumero) return <Tag color="green" style={{ fontSize: 10, fontFamily: 'monospace' }}>✅ {r.ecfNumero}</Tag>;
        if (r.categoria === 'gasto_menor') {
          return (
            <Popconfirm
              title="¿Emitir e-CF E43 (Gasto Menor)?"
              description="Se enviará a la DGII. Todo el monto va como exento."
              onConfirm={() => emitirEcfE43.mutate(r.id)}
              okText="Emitir E43"
            >
              <Button type="dashed" size="small" icon={<AuditOutlined />}
                loading={emitirEcfE43.isPending}
                style={{ color: '#7c3aed', borderColor: '#7c3aed', fontSize: 11 }}>
                Emitir E43
              </Button>
            </Popconfirm>
          );
        }
        return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
      },
    },
    { title: '', key: 'del', width: 70,
      render: (_: any, r: any) => (
        <Space size={2}>
          <Button size="small" type="text"
            icon={pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />}
            disabled={pdfPending === r.id}
            onClick={() => descargarPDF(r)}
            title="Descargar PDF"
          />
          <Popconfirm title="¿Eliminar gasto?" onConfirm={() => eliminarMut.mutate(r.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Gastos Operativos</Title></Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 100 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>
              Registrar gasto
            </Button>
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="resumen" items={[
        {
          key: 'resumen', label: '📊 Resumen',
          children: (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="Total del mes" value={resumen?.totalGastos ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="Monto sin ITBIS" value={resumen?.totalMonto ?? 0} formatter={v => fmt.money(Number(v))} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="ITBIS Crédito Fiscal" value={resumen?.totalItbis ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#10b981' }} /></Card>
                </Col>
              </Row>

              {/* Gráfica por categoría */}
              {resumen?.porCategoria?.length > 0 && (
                <Card title="Distribución por categoría" style={{ marginBottom: 16 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={resumen.porCategoria} layout="vertical">
                      <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmt.money(v)} />
                      <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                        {resumen.porCategoria.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORES[i % COLORES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          ),
        },
        {
          key: 'anual', label: '📅 Tendencia Anual',
          children: (
            <Card title={`Gastos mensuales ${anio}`}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={anual ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt.money(v)} />
                  <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          ),
        },
        {
          key: 'listado', label: '📋 Detalle',
          children: (
            <>
              <Row justify="space-between" style={{ marginBottom: 12 }}>
                <Col>
                  <Select placeholder="Filtrar categoría" allowClear style={{ width: 220 }}
                    value={catFilt} onChange={setCatFilt}
                    options={categorias?.map((c: any) => ({ value: c.value, label: c.label }))} />
                </Col>
                <Col>
                  <Button icon={<FileExcelOutlined />} onClick={() => {
                    const filas = (lista?.data ?? []).map((g: any) => ({
                      'Fecha':       g.fecha ? dayjs(g.fecha).format('DD/MM/YYYY') : '',
                      'Categoría':   g.categoria ?? '',
                      'Descripción': g.descripcion ?? '',
                      'Proveedor':   g.proveedor ?? '',
                      'Comprobante': g.comprobante ?? '',
                      'Monto':       Number(g.monto ?? 0),
                      'ITBIS':       Number(g.itbis ?? 0),
                      'Total':       Number(g.total ?? 0),
                    }));
                    exportarExcel(filas, `Gastos-${anio}-${String(mes).padStart(2,'0')}`);
                    message.success(`${filas.length} gastos exportados`);
                  }}>
                    Excel
                  </Button>
                  <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
                </Col>
              </Row>
              <Table columns={fcGastos(cols as any)} dataSource={lista?.data ?? []} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: lista?.meta?.total, pageSize: 10, current: page,
                              onChange: setPage, showSizeChanger: false }} />
            </>
          ),
        },
      ]} />

      {/* Modal crear gasto */}
      <Modal
        title="Registrar Gasto"
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        footer={null}
        width={620}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={v => crearMut.mutate({
            ...v,
            fecha: v.fecha.format('YYYY-MM-DD'),
            itbis: generaE43 ? 0 : (v.itbis ?? 0),
          })}
          initialValues={{ fecha: dayjs() }}
        >
          {/* Fila 1: Fecha + Categoría */}
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="categoria" label="Categoría" rules={[{ required: true }]}>
                <Select
                  placeholder="Seleccionar categoría"
                  options={categorias?.map((c: any) => ({ value: c.value, label: c.label }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Badge informativo según categoría */}
          {generaE43 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14, fontSize: 12 }}
              message={<><strong>📋 Este gasto generará un E43 automáticamente</strong> — Todo el monto va como exento (sin ITBIS). El E43 se enviará a la DGII al registrar.</>}
            />
          )}
          {!generaE43 && categoriaWatch && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 14, fontSize: 12 }}
              message="Ingresa el NCF que te emitió el proveedor en «No. Comprobante»."
            />
          )}

          {/* Descripción */}
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input placeholder={generaE43 ? 'Ej: Compra de materiales de limpieza' : 'Descripción del gasto'} />
          </Form.Item>

          {/* Montos */}
          <Row gutter={12}>
            <Col span={generaE43 ? 12 : 9}>
              <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            {!generaE43 && (
              <Col xs={24} sm={7}>
                <Form.Item name="itbis" label="ITBIS (RD$)" tooltip="Si aplica crédito fiscal">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
            )}
            {generaE43 && (
              <Col xs={24} sm={12}>
                <Form.Item label="ITBIS">
                  <InputNumber style={{ width: '100%' }} value={0} disabled
                    placeholder="0.00 (exento — E43 no aplica ITBIS)" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* Campos según tipo */}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="proveedor"
                label={generaE43 ? 'Proveedor (opcional)' : 'Proveedor'}
                rules={generaE43 ? [] : []}
              >
                <Input placeholder={generaE43 ? 'Nombre del vendedor informal' : 'Nombre del proveedor'} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              {generaE43 ? (
                <Form.Item name="comprobante" label="Referencia (opcional)">
                  <Input placeholder="Descripción o referencia interna" />
                </Form.Item>
              ) : (
                <Form.Item name="rncProveedor" label="RNC Proveedor">
                  <Input placeholder="9 dígitos" maxLength={9} />
                </Form.Item>
              )}
            </Col>
            {!generaE43 && (
              <Col xs={24} sm={12}>
                <Form.Item name="comprobante" label="No. Comprobante (NCF recibido)">
                  <Input placeholder="E310000000001 o referencia" />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Row justify="end" gutter={8} style={{ marginTop: 4 }}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                loading={crearMut.isPending}
                style={generaE43 ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}
              >
                {generaE43 ? '📋 Registrar y emitir E43' : 'Registrar gasto'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      <EcfResultModal encf={ecfEncf} onClose={() => setEcfEncf(null)} />
    </div>
  );
}
