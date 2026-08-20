import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { Card, Row, Col, Table, Button, Tag, Typography,
         Modal, Form, Input, InputNumber, Select, Tabs, message,
         Space, DatePicker, theme } from 'antd';
import { PlusOutlined, UploadOutlined, DownloadOutlined, SwapOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { tesoreriaApi, type CuentaBancariaPayload } from '../../api/tesoreria.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

const tipoMovColor: Record<string, string> = {
  deposito: 'green', retiro: 'red', transferencia_entrada: 'cyan',
  transferencia_salida: 'orange', comision: 'default', nota_credito: 'blue',
};

export default function TesoreriaPage() {
  const { token } = theme.useToken();
  const [openCuenta,    setOpenCuenta]    = useState(false);
  const [openMovim,     setOpenMovim]     = useState<'deposito' | 'retiro' | 'transferencia' | null>(null);
  const [cuentaFiltro,  setCuentaFiltro]  = useState<number | undefined>();
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [mes,           setMes]           = useState(dayjs().month() + 1);
  const [anio,          setAnio]          = useState(dayjs().year());
  const [formCuenta]    = Form.useForm<CuentaBancariaPayload>();
  const [formMovim]     = Form.useForm();
  const qc = useQueryClient();

  const { data: resumen }   = useQuery({ queryKey: ['tesoreria-resumen'],   queryFn: tesoreriaApi.resumen });
  const { data: cuentas }   = useQuery({ queryKey: ['cuentas-bancarias'],   queryFn: tesoreriaApi.cuentas });
  const { data: movims, isLoading: movLoading } = useQuery({
    queryKey: ['movimientos-bancarios', page, cuentaFiltro, search],
    queryFn: () => tesoreriaApi.movimientos(page, 15, cuentaFiltro),
  });
  const { data: flujoDia } = useQuery({
    queryKey: ['flujo-dia', mes, anio],
    queryFn: () => tesoreriaApi.flujoPorDia(mes, anio),
  });

  const crearCuentaMut = useMutation({
    mutationFn: tesoreriaApi.createCuenta,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] }); qc.invalidateQueries({ queryKey: ['tesoreria-resumen'] }); setOpenCuenta(false); formCuenta.resetFields(); message.success('Cuenta registrada'); },
  });

  const depositoMut = useMutation({
    mutationFn: (body: any) => tesoreriaApi.deposito(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimientos-bancarios'] }); qc.invalidateQueries({ queryKey: ['tesoreria-resumen'] }); qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] }); setOpenMovim(null); formMovim.resetFields(); message.success('Depósito registrado'); },
    onError: () => message.error('Error al registrar depósito'),
  });

  const retiroMut = useMutation({
    mutationFn: (body: any) => tesoreriaApi.retiro(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimientos-bancarios'] }); qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] }); setOpenMovim(null); formMovim.resetFields(); message.success('Retiro registrado'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Saldo insuficiente'),
  });

  const transferenciaFn = useMutation({
    mutationFn: (body: any) => tesoreriaApi.transferencia(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimientos-bancarios'] }); qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] }); setOpenMovim(null); formMovim.resetFields(); message.success('Transferencia realizada'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error en transferencia'),
  });

  const handleMovimSubmit = (values: any) => {
    const fecha = (values.fecha as dayjs.Dayjs).format('YYYY-MM-DD');
    if (openMovim === 'deposito')     depositoMut.mutate({ ...values, fecha });
    if (openMovim === 'retiro')       retiroMut.mutate({ ...values, fecha });
    if (openMovim === 'transferencia') transferenciaFn.mutate({ ...values, fecha });
  };

  const chartData = (flujoDia?.grafica ?? []).map((d: any) => ({
    dia: `D${d.dia}`, entradas: d.entradas, salidas: d.salidas,
  }));

  const MOV_COLS_DEF = [
    { key: 'fecha',       label: 'Fecha',       defaultVisible: true  },
    { key: 'tipo',        label: 'Tipo',        defaultVisible: true  },
    { key: 'descripcion', label: 'Descripción', defaultVisible: true  },
    { key: 'referencia',  label: 'Referencia',  defaultVisible: false },
    { key: 'monto',       label: 'Monto',       defaultVisible: true  },
    { key: 'saldoNuevo',  label: 'Saldo',       defaultVisible: false },
    { key: 'cta',         label: 'Cuenta',      defaultVisible: true  },
  ];
  const { visibleColumns: movCols, updateVisibility: setMovCols, filterColumns: filterMovCols } =
    useColumnVisibility('tesoreria-movimientos', MOV_COLS_DEF);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Tesorería y Flujo de Caja</Title>

      <Tabs defaultActiveKey="movimientos" items={[
        {
          key: 'movimientos', label: 'Movimientos',
          children: (
            <>
              <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 12 }}>
                <Col xs={24} md="auto">
                  <Space wrap>
                    <Select placeholder="Filtrar por cuenta" allowClear style={{ width: 220 }}
                      onChange={(v) => { setCuentaFiltro(v); setPage(1); }}
                      options={(cuentas ?? []).map((c: any) => ({ value: c.id, label: `${c.banco} — ${c.numeroCuenta}` }))} />
                    <Input
                      placeholder="Buscar por referencia o descripción..."
                      prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      allowClear
                      style={{ width: '100%', maxWidth: 220, minWidth: 0 }}
                    />
                  </Space>
                </Col>
                <Col xs={24} sm="auto">
                  <Space wrap>
                    <Button icon={<FileExcelOutlined />} onClick={() => {
                      const filas = (movims?.data ?? movims ?? []).map((m: any) => ({
                        'Fecha':    m.fecha ? dayjs(m.fecha).format('DD/MM/YYYY') : '',
                        'Tipo':     m.tipo ?? '',
                        'Concepto': m.concepto ?? m.descripcion ?? '',
                        'Monto':    Number(m.monto ?? 0),
                        'Cuenta':   m.cuenta?.banco ?? m.cuentaBancaria ?? '',
                        'Referencia': m.referencia ?? '',
                      }));
                      exportarExcel(filas, `Tesoreria-Movimientos-${dayjs().format('YYYY-MM')}`);
                    }}>Excel</Button>
            <RefreshByKeyButton queryKey={['movimientos']} />
            <VideoTutorialButton />
                    <ColumnToggle columns={MOV_COLS_DEF} visibleColumns={movCols} onChange={setMovCols} />
                    <Button icon={<UploadOutlined />} type="primary" onClick={() => { setOpenMovim('deposito'); formMovim.resetFields(); }}>Depósito</Button>
                    <Button icon={<DownloadOutlined />} danger onClick={() => { setOpenMovim('retiro'); formMovim.resetFields(); }}>Retiro</Button>
                    <Button icon={<SwapOutlined />} onClick={() => { setOpenMovim('transferencia'); formMovim.resetFields(); }}>Transferencia</Button>
                  </Space>
                </Col>
              </Row>
              <Table
                dataSource={movims?.data ?? []} rowKey="id" loading={movLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: movims?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }}
                columns={filterMovCols([
                  { title: 'Fecha',       dataIndex: 'fecha',       key: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
                  { title: 'Tipo',        dataIndex: 'tipo',        key: 'tipo',        width: 140, render: (v: string) => <Tag color={tipoMovColor[v]}>{v.replace('_',' ').toUpperCase()}</Tag> },
                  { title: 'Descripción', dataIndex: 'descripcion', key: 'descripcion', ellipsis: true },
                  { title: 'Referencia',  dataIndex: 'referencia',  key: 'referencia',  width: 120 },
                  { title: 'Monto',       dataIndex: 'monto',       key: 'monto',       width: 130, render: (v: number, r: any) => <span style={{ color: ['deposito','transferencia_entrada','nota_credito','interes'].includes(r.tipo) ? '#52c41a' : '#ff4d4f' }}>{fmt.money(v)}</span> },
                  { title: 'Saldo',       dataIndex: 'saldoNuevo',  key: 'saldoNuevo',  width: 130, render: (v: number) => <strong>{fmt.money(v)}</strong> },
                  { title: 'Cuenta',      key: 'cta',               width: 140, render: (_: any, r: any) => r.cuentaBancaria?.banco },
                ])} />
            </>
          ),
        },
        {
          key: 'cuentas', label: 'Cuentas Bancarias',
          children: (
            <>
              <Row justify="end" style={{ marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpenCuenta(true); formCuenta.resetFields(); }}>Nueva cuenta</Button>
              </Row>
              <Table dataSource={cuentas ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Banco',   dataIndex: 'banco',        ellipsis: true },
                  { title: 'Número',  dataIndex: 'numeroCuenta', width: 160 },
                  { title: 'Tipo',    dataIndex: 'tipoCuenta',   width: 110, render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
                  { title: 'Moneda',  dataIndex: 'moneda',       width: 80,  render: (v: string) => <Tag color="blue">{v}</Tag> },
                  { title: 'Saldo',   dataIndex: 'saldo',        width: 130, render: (v: number) => <strong style={{ color: '#1677ff' }}>{fmt.money(v)}</strong> },
                  { title: 'Estado',  dataIndex: 'isActiva',     width: 80,  render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
                ]} pagination={false} />
            </>
          ),
        },
        {
          key: 'flujo', label: 'Flujo de Caja',
          children: (
            <Card title="Entradas vs Salidas" extra={
              <Space>
                <Select value={mes} onChange={setMes} style={{ width: 120 }}
                  options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }))} />
                <Select value={anio} onChange={setAnio} style={{ width: 100 }}
                  options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
              </Space>
            }>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => fmt.money(Number(v))} />
                  <Legend />
                  <Bar dataKey="entradas" name="Entradas" fill="#52c41a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="salidas"  name="Salidas"  fill="#ff4d4f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          ),
        },
      ]} />

      {/* Modal: nueva cuenta */}
      <Modal title="Nueva cuenta bancaria" open={openCuenta} onCancel={() => setOpenCuenta(false)} footer={null}>
        <Form form={formCuenta} layout="vertical" onFinish={v => crearCuentaMut.mutate(v)}
          initialValues={{ tipoCuenta: 'corriente', moneda: 'DOP' }}>
          <Form.Item name="banco" label="Banco" rules={[{ required: true }]}><Input placeholder="Banco Popular, BHD, etc." /></Form.Item>
          <Form.Item name="numeroCuenta" label="Número de cuenta" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="tipoCuenta" label="Tipo"><Select options={[{ value: 'corriente', label: 'Corriente' }, { value: 'ahorros', label: 'Ahorros' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="moneda" label="Moneda"><Select options={[{ value: 'DOP', label: 'DOP (Pesos)' }, { value: 'USD', label: 'USD (Dólares)' }]} /></Form.Item></Col>
          </Row>
          <Form.Item name="saldoInicial" label="Saldo inicial (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenCuenta(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearCuentaMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: movimiento */}
      <Modal title={openMovim === 'deposito' ? 'Registrar Depósito' : openMovim === 'retiro' ? 'Registrar Retiro' : 'Transferencia entre cuentas'}
        open={!!openMovim} onCancel={() => setOpenMovim(null)} footer={null}>
        <Form form={formMovim} layout="vertical" onFinish={handleMovimSubmit}
          initialValues={{ fecha: dayjs() }}>
          {openMovim !== 'transferencia' ? (
            <Form.Item name="cuentaBancariaId" label="Cuenta" rules={[{ required: true }]}>
              <Select options={(cuentas ?? []).map((c: any) => ({ value: c.id, label: `${c.banco} — ${c.numeroCuenta} (${fmt.money(c.saldo)})` }))} />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="cuentaOrigenId" label="Cuenta Origen" rules={[{ required: true }]}>
                <Select options={(cuentas ?? []).map((c: any) => ({ value: c.id, label: `${c.banco} — ${c.numeroCuenta}` }))} />
              </Form.Item>
              <Form.Item name="cuentaDestinoId" label="Cuenta Destino" rules={[{ required: true }]}>
                <Select options={(cuentas ?? []).map((c: any) => ({ value: c.id, label: `${c.banco} — ${c.numeroCuenta}` }))} />
              </Form.Item>
            </>
          )}
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0.01} precision={2} /></Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="referencia" label="Referencia"><Input /></Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenMovim(null)}>Cancelar</Button></Col>
            <Col><Button type={openMovim === 'retiro' ? 'default' : 'primary'} danger={openMovim === 'retiro'} htmlType="submit"
              loading={depositoMut.isPending || retiroMut.isPending || transferenciaFn.isPending}>
              {openMovim === 'deposito' ? 'Registrar depósito' : openMovim === 'retiro' ? 'Registrar retiro' : 'Transferir'}
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
