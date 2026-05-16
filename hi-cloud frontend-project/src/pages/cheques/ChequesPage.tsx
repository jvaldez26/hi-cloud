import { useState } from 'react';
import {
  Card, Row, Col, Typography, Select, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, InputNumber, Tabs,
  Popconfirm, message, Badge, Alert, Tooltip, Divider,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, StopOutlined, WarningOutlined,
  BankOutlined, FileTextOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

const ESTADO_COLOR: Record<string, string> = {
  en_cartera: 'blue', entregado: 'cyan', cobrado: 'green',
  rechazado: 'red', anulado: 'default', posfechado: 'orange',
};
const ESTADO_LABEL: Record<string, string> = {
  en_cartera: 'En cartera', entregado: 'Entregado', cobrado: 'Cobrado',
  rechazado: 'Rechazado', anulado: 'Anulado', posfechado: '📅 Posfechado',
};

const chequesApi = {
  dashboard:       ()                   => api.get('/cheques/dashboard').then(r => r.data?.data ?? r.data),
  chequeras:       ()                   => api.get('/cheques/chequeras').then(r => r.data?.data ?? r.data ?? []),
  crearChequera:   (b: any)             => api.post('/cheques/chequeras', b).then(r => r.data?.data ?? r.data),
  lista:           (p = 1, e?: string, t?: string, cid?: number) =>
    api.get(`/cheques?page=${p}${e ? `&estado=${e}` : ''}${t ? `&tipo=${t}` : ''}${cid ? `&chequeraId=${cid}` : ''}`).then(r => r.data?.data ?? r.data),
  emitir:          (b: any)             => api.post('/cheques', b).then(r => r.data?.data ?? r.data),
  cambiarEstado:   (id: number, estado: string, fechaCobro?: string) =>
    api.patch(`/cheques/${id}/estado`, { estado, fechaCobro }).then(r => r.data?.data ?? r.data),
  eliminar:        (id: number)         => api.delete(`/cheques/${id}`).then(r => r.data?.data ?? r.data),
  resumen:         (m: number, a: number) => api.get(`/cheques/resumen?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
};

export default function ChequesPage() {
  const [mes,          setMes]          = useState(dayjs().month() + 1);
  const [anio,         setAnio]         = useState(dayjs().year());
  const [estadoF,      setEstadoF]      = useState<string | undefined>();
  const [tipoF,        setTipoF]        = useState<string | undefined>();
  const [chequeraF,    setChequeraF]    = useState<number | undefined>();
  const [pageCheq,     setPageCheq]     = useState(1);
  const [chequeraModal,setChequeraModal]= useState(false);
  const [chequeModal,  setChequeModal]  = useState(false);
  const [cobrarModal,  setCobrarModal]  = useState<any>(null);
  const [formCh]                        = Form.useForm();
  const [formCheq]                      = Form.useForm();
  const [formCobro]                     = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }      = useQuery({ queryKey: ['cheques-dash'],              queryFn: chequesApi.dashboard });
  const { data: chequeras } = useQuery({ queryKey: ['chequeras'],                 queryFn: chequesApi.chequeras });
  const { data: cheques, isLoading } = useQuery({
    queryKey: ['cheques-lista', pageCheq, estadoF, tipoF, chequeraF],
    queryFn:  () => chequesApi.lista(pageCheq, estadoF, tipoF, chequeraF),
  });
  const { data: resumen }   = useQuery({ queryKey: ['cheques-res', mes, anio],    queryFn: () => chequesApi.resumen(mes, anio) });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['cheques-lista'] });
    qc.invalidateQueries({ queryKey: ['cheques-dash'] });
    qc.invalidateQueries({ queryKey: ['cheques-res'] });
  };

  const crearChequeraMut = useMutation({
    mutationFn: chequesApi.crearChequera,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chequeras'] }); setChequeraModal(false); formCh.resetFields(); message.success('Chequera creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const errMsg = (e: any) =>
    e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado';

  const emitirMut = useMutation({
    mutationFn: chequesApi.emitir,
    onSuccess: () => { inv(); setChequeModal(false); formCheq.resetFields(); message.success('Cheque registrado'); },
    onError: (e: any) => message.error(`Error al registrar cheque: ${errMsg(e)}`, 6),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado, fecha }: any) => chequesApi.cambiarEstado(id, estado, fecha),
    onSuccess: () => { inv(); setCobrarModal(null); message.success('Estado actualizado'); },
    onError: (e: any) => message.error(`Error al cambiar estado: ${errMsg(e)}`, 6),
  });

  const eliminarMut = useMutation({
    mutationFn: chequesApi.eliminar,
    onSuccess: () => { inv(); message.success('Eliminado'); },
    onError: (e: any) => message.error(`Error al eliminar: ${errMsg(e)}`, 6),
  });

  const cols = [
    { title: 'Número',      dataIndex: 'numero',       width: 100, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Banco',       key: 'banco',              width: 130, render: (_: any, r: any) => r.chequera?.banco ?? '—' },
    { title: 'Tipo',        dataIndex: 'tipo',         width: 100,
      render: (v: string) => <Tag color={v === 'emitido' ? 'blue' : 'green'}>
        {v === 'emitido' ? '↑ Emitido' : '↓ Recibido'}
      </Tag> },
    { title: 'Beneficiario',dataIndex: 'beneficiario', ellipsis: true },
    { title: 'Fecha',       dataIndex: 'fecha',        width: 100,
      render: (v: string) => (
        <Text type={new Date(v) > new Date() ? 'warning' : undefined}>{fmt.date(v)}</Text>
      )},
    { title: 'Monto',       dataIndex: 'monto',        width: 130,
      render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> },
    { title: 'Estado',      dataIndex: 'estado',       width: 120,
      render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{ESTADO_LABEL[v] ?? v}</Tag> },
    { title: '', key: 'actions', width: 140,
      render: (_: any, r: any) => (
        <Space size={4}>
          {r.estado !== 'cobrado' && r.estado !== 'anulado' && (
            <Tooltip title="Marcar cobrado">
              <Button size="small" type="primary" icon={<CheckOutlined />}
                onClick={() => { setCobrarModal(r); formCobro.setFieldsValue({ fechaCobro: dayjs().format('YYYY-MM-DD') }); }} />
            </Tooltip>
          )}
          {r.estado !== 'anulado' && r.estado !== 'cobrado' && (
            <Popconfirm title="¿Anular cheque?" onConfirm={() => estadoMut.mutate({ id: r.id, estado: 'anulado' })}>
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Gestión de Cheques
          </Title>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (cheques?.data ?? []).map((c: any) => ({
                'Número':      c.numeroCheque ?? '',
                'Fecha':       c.fechaEmision ? dayjs(c.fechaEmision).format('DD/MM/YYYY') : '',
                'Fecha Cobro': c.fechaCobro   ? dayjs(c.fechaCobro).format('DD/MM/YYYY')   : '',
                'Beneficiario':c.beneficiario ?? '',
                'Concepto':    c.concepto ?? '',
                'Monto':       Number(c.monto ?? 0),
                'Tipo':        c.tipo ?? '',
                'Estado':      ESTADO_LABEL[c.estado] ?? c.estado ?? '',
                'Chequera':    c.chequera?.nombre ?? '',
              }));
              exportarExcel(filas, `Cheques-${anio}-${String(mes).padStart(2,'0')}`);
              message.success(`${filas.length} cheques exportados`);
            }}>Excel</Button>
            <Button onClick={() => setChequeraModal(true)}>
              <BankOutlined /> Nueva chequera
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setChequeModal(true)}>
              Registrar cheque
            </Button>
          </Space>
        </Col>
      </Row>

      {/* KPIs */}
      {dash && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={4}>
            <Card size="small">
              <Statistic title="En cartera" value={dash.enCartera}
                valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small">
              <Statistic title="Entregados" value={dash.entregados}
                valueStyle={{ color: '#06b6d4' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small">
              <Statistic title="Cobrados" value={dash.cobrados}
                valueStyle={{ color: '#10b981' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small">
              <Statistic title="Posfechados" value={dash.posfechados}
                valueStyle={{ color: '#f59e0b' }} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" style={{ borderColor: '#1677ff' }}>
              <Statistic title="Monto en cartera / pendiente"
                value={dash.montoEnCartera} formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: '#1677ff', fontSize: 20 }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Alerta cheques posfechados que vencen pronto */}
      {dash?.vencenProximo?.length > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`${dash.vencenProximo.length} cheque(s) posfechado(s) vencen en los próximos 7 días`}
          description={
            <Space wrap>
              {dash.vencenProximo.map((c: any) => (
                <Tag key={c.id} color="orange">
                  #{c.numero} · {c.beneficiario} · {fmt.money(c.monto)} · {fmt.date(c.fecha)}
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      <Tabs items={[
        {
          key: 'lista',
          label: '📋 Registro de cheques',
          children: (
            <Card extra={
              <Space>
                <Select placeholder="Tipo" allowClear style={{ width: 130 }}
                  value={tipoF} onChange={v => { setTipoF(v); setPageCheq(1); }}
                  options={[{ value: 'emitido', label: '↑ Emitido' }, { value: 'recibido', label: '↓ Recibido' }]} />
                <Select placeholder="Estado" allowClear style={{ width: 140 }}
                  value={estadoF} onChange={v => { setEstadoF(v); setPageCheq(1); }}
                  options={Object.entries(ESTADO_LABEL).map(([v, l]) => ({
                    value: v, label: <Tag color={ESTADO_COLOR[v]}>{l}</Tag>,
                  }))} />
                <Select placeholder="Chequera" allowClear style={{ width: 160 }}
                  value={chequeraF} onChange={v => { setChequeraF(v); setPageCheq(1); }}
                  options={(chequeras ?? []).map((c: any) => ({ value: c.id, label: `${c.banco} ${c.numeroCuenta}` }))} />
              </Space>
            }>
              <Table columns={cols} dataSource={cheques?.data ?? []} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: cheques?.meta?.total, pageSize: 15, current: pageCheq,
                              onChange: setPageCheq, showSizeChanger: false }} />
            </Card>
          ),
        },
        {
          key: 'resumen',
          label: '📊 Resumen mensual',
          children: (
            <Card extra={
              <Space>
                <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
                <Select value={anio} onChange={setAnio} style={{ width: 90 }}
                  options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
              </Space>
            }>
              {(resumen ?? []).length === 0 ? (
                <Text type="secondary">Sin movimientos en este período.</Text>
              ) : (
                <Table
                  size="small"
        scroll={{ x: 'max-content' }}
                  dataSource={resumen ?? []}
                  rowKey={(r: any) => `${r.tipo}-${r.estado}`}
                  pagination={false}
                  columns={[
                    { title: 'Tipo', dataIndex: 'tipo', render: (v: string) => <Tag color={v === 'emitido' ? 'blue' : 'green'}>{v === 'emitido' ? '↑ Emitido' : '↓ Recibido'}</Tag> },
                    { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v]}>{ESTADO_LABEL[v]}</Tag> },
                    { title: 'Cantidad', dataIndex: 'cantidad' },
                    { title: 'Monto total', dataIndex: 'monto', render: (v: number) => fmt.money(v) },
                  ]}
                />
              )}
            </Card>
          ),
        },
        {
          key: 'chequeras',
          label: '📒 Chequeras',
          children: (
            <Card>
              <Table
                size="small"
        scroll={{ x: 'max-content' }}
                dataSource={chequeras ?? []}
                rowKey="id"
                pagination={false}
                columns={[
                  { title: 'Banco',       dataIndex: 'banco' },
                  { title: 'N° Cuenta',   dataIndex: 'numeroCuenta', render: (v: string) => <Text code>{v}</Text> },
                  { title: 'Serie',       key: 'serie', render: (_: any, r: any) => `${r.serieDesde} — ${r.serieHasta}` },
                  { title: 'Siguiente',   dataIndex: 'siguienteNumero', render: (v: number) => <Text strong>{String(v).padStart(6,'0')}</Text> },
                  { title: 'Disponibles', key: 'disp', render: (_: any, r: any) => {
                    const disp = r.serieHasta - r.siguienteNumero + 1;
                    return <Tag color={disp < 10 ? 'orange' : 'green'}>{disp} cheques</Tag>;
                  }},
                  { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={v === 'activa' ? 'green' : v === 'agotada' ? 'red' : 'default'}>{v}</Tag> },
                ]}
              />
            </Card>
          ),
        },
      ]} />

      {/* Modal nueva chequera */}
      <Modal title="Nueva Chequera" open={chequeraModal}
        onCancel={() => setChequeraModal(false)} footer={null} width={480}>
        <Form form={formCh} layout="vertical"
          onFinish={v => crearChequeraMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={14}><Form.Item name="banco" label="Banco" rules={[{ required: true }]}><Input placeholder="Banco Popular, Banreservas..." /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="numeroCuenta" label="N° Cuenta" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="nombreCuenta" label="Nombre en la cuenta"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="serieDesde" label="Primer número" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="serieHasta" label="Último número" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setChequeraModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearChequeraMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal registrar cheque */}
      <Modal title="Registrar Cheque" open={chequeModal}
        onCancel={() => setChequeModal(false)} footer={null} width={540}>
        <Form form={formCheq} layout="vertical"
          initialValues={{ tipo: 'emitido', fecha: dayjs().format('YYYY-MM-DD') }}
          onFinish={v => emitirMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="chequeraId" label="Chequera" rules={[{ required: true }]}>
              <Select options={(chequeras ?? []).map((c: any) => ({
                value: c.id, label: `${c.banco} · ${c.numeroCuenta}`,
              }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo">
              <Select options={[{ value: 'emitido', label: '↑ Emitido (pago)' }, { value: 'recibido', label: '↓ Recibido (cobro)' }]} />
            </Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="numero" label="N° Cheque (vacío = auto)"><Input placeholder="Auto" /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="beneficiario" label="Beneficiario / Emisor" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="concepto" label="Concepto"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setChequeModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={emitirMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal marcar cobrado */}
      <Modal title={`Marcar cheque #${cobrarModal?.numero} como cobrado`}
        open={!!cobrarModal} onCancel={() => setCobrarModal(null)} footer={null} width={400}>
        <Form form={formCobro} layout="vertical"
          onFinish={v => estadoMut.mutate({ id: cobrarModal.id, estado: 'cobrado', fecha: v.fechaCobro })}>
          <Form.Item name="fechaCobro" label="Fecha de cobro" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8 }}>
            <Text>Beneficiario: <strong>{cobrarModal?.beneficiario}</strong></Text><br />
            <Text>Monto: <strong style={{ color: '#1677ff' }}>{fmt.money(cobrarModal?.monto)}</strong></Text>
          </div>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCobrarModal(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" icon={<CheckOutlined />} htmlType="submit" loading={estadoMut.isPending}>
              Confirmar cobro
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
