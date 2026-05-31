import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { Table, Tag, Button, Card, Row, Col, Typography, Statistic,
         Space, Modal, Form, Input, InputNumber, Select, DatePicker, message,
         Descriptions, Collapse, Drawer, theme } from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import { contabilidadApi, type AsientoPayload, type AsientoLineaPayload } from '../../api/contabilidad.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Panel } = Collapse;

const tipoColor: Record<string, string> = {
  activo: '#1677ff', pasivo: '#fa8c16', patrimonio: '#722ed1',
  ingreso: '#52c41a', costo: '#ff4d4f', gasto: '#ff7a45',
};

// ── Plan de Cuentas ────────────────────────────────────────────────────────────
function PlanCuentas() {
  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentas'],
    queryFn: () => contabilidadApi.cuentas(),
  });

  const cols = [
    { title: 'Código',  dataIndex: 'codigo',    width: 110 },
    { title: 'Nombre',  dataIndex: 'nombre',    ellipsis: true,
      render: (v: string, r: any) => <span style={{ paddingLeft: (r.nivel - 1) * 16 }}>{v}</span> },
    { title: 'Tipo',    dataIndex: 'tipo',      width: 100,
      render: (v: string) => <Tag color={tipoColor[v]} style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Naturaleza', dataIndex: 'naturaleza', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Nivel',   dataIndex: 'nivel',     width: 60 },
    { title: 'Movim.',  dataIndex: 'permiteMovimientos', width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
  ];

  return (
    <Table columns={cols} dataSource={cuentas ?? []} rowKey="id" loading={isLoading}
      size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 50, showSizeChanger: false }}
      rowClassName={(r: any) => r.nivel <= 2 ? 'ant-table-row-level-header' : ''} />
  );
}

// ── Asientos Contables ─────────────────────────────────────────────────────────
function Asientos() {
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [open,       setOpen]       = useState(false);
  const [detail,     setDetail]     = useState<any>(null);
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [estadoFilt, setEstadoFilt] = useState<string | undefined>();
  const [tipoFilt,   setTipoFilt]   = useState<string | undefined>();
  const [lineas, setLineas] = useState<AsientoLineaPayload[]>([
    { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 },
    { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 },
  ]);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: asientos, isLoading } = useQuery({
    queryKey: ['asientos', page, desde, hasta, estadoFilt, tipoFilt],
    queryFn: () => contabilidadApi.asientos(page, 15, estadoFilt, desde || undefined, hasta || undefined, tipoFilt),
  });
  const { data: cuentas } = useQuery({ queryKey: ['cuentas-sel'], queryFn: () => contabilidadApi.cuentas(true) });

  const createMut = useMutation({
    mutationFn: contabilidadApi.createAsiento,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); setOpen(false); form.resetFields(); message.success('Asiento creado'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error — verifica que cuadre'),
  });

  const contabilizarMut = useMutation({
    mutationFn: contabilidadApi.contabilizar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); message.success('Asiento contabilizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al contabilizar'),
  });

  const anularMut = useMutation({
    mutationFn: contabilidadApi.anularAsiento,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); setDetail(null); message.success('Asiento anulado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  const estadoColor: Record<string, string> = { borrador: 'default', contabilizado: 'green', anulado: 'red' };
  const totalDebe  = lineas.reduce((s, l) => s + (l.debe  || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  const cuadra = Math.abs(totalDebe - totalHaber) < 0.01;

  const COLS_DEF = [
    { key: 'numero',      label: 'Número',      defaultVisible: true  },
    { key: 'fecha',       label: 'Fecha',       defaultVisible: true  },
    { key: 'descripcion', label: 'Descripción', defaultVisible: true  },
    { key: 'tipoOrigen',  label: 'Tipo',        defaultVisible: false },
    { key: 'totalDebe',   label: 'Debe',        defaultVisible: true  },
    { key: 'totalHaber',  label: 'Haber',       defaultVisible: true  },
    { key: 'estado',      label: 'Estado',      defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('asientos', COLS_DEF);

  const cols = filterColumns([
    { title: 'Número',      dataIndex: 'numero',       key: 'numero',      width: 170 },
    { title: 'Fecha',       dataIndex: 'fecha',        key: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Descripción', dataIndex: 'descripcion',  key: 'descripcion', ellipsis: true },
    { title: 'Tipo',        dataIndex: 'tipoOrigen',   key: 'tipoOrigen',  width: 100,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Debe',        dataIndex: 'totalDebe',    key: 'totalDebe',   width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Haber',       dataIndex: 'totalHaber',   key: 'totalHaber',  width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Estado',      dataIndex: 'estado',       key: 'estado',      width: 110,
      render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetail(r)}
          viewLabel="Ver detalle"
          items={r.estado === 'borrador' ? [
            { key: 'contabilizar', label: 'Contabilizar', icon: <CheckOutlined />, onClick: () => contabilizarMut.mutate(r.id) },
          ] : []}
        />
      ),
    },
  ]);

  const handleSubmit = (values: { fecha: dayjs.Dayjs; descripcion: string }) => {
    const payload: AsientoPayload = {
      fecha: values.fecha.format('YYYY-MM-DD'),
      descripcion: values.descripcion,
      lineas: lineas.filter(l => l.cuentaContableId > 0),
    };
    createMut.mutate(payload);
  };

  return (
    <>
      <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} md={6}>
          <Input
            placeholder="Buscar por número o descripción..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Input type="date" value={desde} style={{ width: '100%' }}
            onChange={e => { setDesde(e.target.value); setPage(1); }} />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Input type="date" value={hasta} style={{ width: '100%' }}
            onChange={e => { setHasta(e.target.value); setPage(1); }} />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Select style={{ width: '100%' }} placeholder="Estado" allowClear
            value={estadoFilt} onChange={v => { setEstadoFilt(v); setPage(1); }}>
            <Select.Option value="borrador">Borrador</Select.Option>
            <Select.Option value="contabilizado">Contabilizado</Select.Option>
            <Select.Option value="anulado">Anulado</Select.Option>
          </Select>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Select style={{ width: '100%' }} placeholder="Tipo" allowClear
            value={tipoFilt} onChange={v => { setTipoFilt(v); setPage(1); }}>
            <Select.Option value="manual">Manual</Select.Option>
            <Select.Option value="factura">Factura</Select.Option>
            <Select.Option value="compra">Compra</Select.Option>
            <Select.Option value="nomina">Nómina</Select.Option>
            <Select.Option value="ajuste">Ajuste</Select.Option>
          </Select>
        </Col>
        <Col xs={24} sm="auto" style={{ marginLeft: 'auto' }}>
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (asientos?.data ?? []).map((a: any) => ({
                'Número':      a.numero ?? '',
                'Fecha':       a.fecha ? fmt.date(a.fecha) : '',
                'Descripción': a.descripcion ?? '',
                'Tipo':        a.tipoOrigen ?? '',
                'Debe':        Number(a.totalDebe ?? 0),
                'Haber':       Number(a.totalHaber ?? 0),
                'Estado':      a.estado ?? '',
              }));
              exportarExcel(filas, `Asientos-${new Date().toISOString().split('T')[0]}`);
              message.success(`${filas.length} asientos exportados`);
            }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['asientos']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nuevo asiento manual</Button>
          </Space>
        </Col>
      </Row>
      <Table columns={cols}
        dataSource={(asientos?.data ?? []).filter((a: any) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return a.numero?.toLowerCase().includes(s) || a.descripcion?.toLowerCase().includes(s);
        })}
        rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: asientos?.meta?.total, pageSize: 15, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* Crear asiento */}
      <Modal title="Nuevo Asiento Contable" open={open} onCancel={() => setOpen(false)} footer={null} width={820}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ fecha: dayjs() }}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
            dataSource={lineas.map((l, i) => ({ ...l, key: i }))}
            columns={[
              { title: 'Cuenta', key: 'cuenta', width: 220,
                render: (_: any, _r: any, idx: number) => (
                  <Select style={{ width: '100%' }} showSearch
                    filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                    options={cuentas?.map((c: any) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
                    onChange={(v) => { const u = [...lineas]; u[idx].cuentaContableId = v; setLineas(u); }} />
                )},
              { title: 'Descripción', key: 'desc', width: 170,
                render: (_: any, r: any, idx: number) => (
                  <Input value={r.descripcion} onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
                )},
              { title: 'Debe', key: 'debe', width: 110,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber min={0} precision={2} value={r.debe} style={{ width:'100%' }}
                    onChange={v => { const u=[...lineas]; u[idx].debe=v??0; u[idx].haber=0; setLineas(u); }} />
                )},
              { title: 'Haber', key: 'haber', width: 110,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber min={0} precision={2} value={r.haber} style={{ width:'100%' }}
                    onChange={v => { const u=[...lineas]; u[idx].haber=v??0; u[idx].debe=0; setLineas(u); }} />
                )},
              { title: '', key: 'del', width: 40,
                render: (_: any, _r: any, idx: number) => (
                  <Button type="text" danger size="small" onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}>×</Button>
                )},
            ]} />
          <Row justify="space-between" align="middle" style={{ marginTop: 8 }}>
            <Button onClick={() => setLineas([...lineas, { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 }])}>
              + Línea
            </Button>
            <Space>
              <Text>Debe: {fmt.money(totalDebe)}</Text>
              <Text>Haber: {fmt.money(totalHaber)}</Text>
              <Tag color={cuadra ? 'green' : 'red'}>{cuadra ? '✓ Cuadra' : '✗ No cuadra'}</Tag>
            </Space>
            <Button type="primary" htmlType="submit" disabled={!cuadra} loading={createMut.isPending}>Guardar</Button>
          </Row>
        </Form>
      </Modal>

      {/* Detalle asiento */}
      <Drawer
        title={`Asiento ${detail?.numero}`}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={700}
        extra={
          detail && (
            <Space>
              {detail.referenciaFolio && (
                <Tag color="blue">Ref: {detail.referenciaFolio}</Tag>
              )}
              {detail.estado === 'contabilizado' && (
                <Button danger size="small" loading={anularMut.isPending}
                  onClick={() => anularMut.mutate(detail.id)}>
                  Anular
                </Button>
              )}
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Fecha">{fmt.date(detail.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Estado"><Tag color={estadoColor[detail.estado]}>{detail.estado?.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Descripción" span={2}>{detail.descripcion}</Descriptions.Item>
              <Descriptions.Item label="Total Debe">{fmt.money(detail.totalDebe)}</Descriptions.Item>
              <Descriptions.Item label="Total Haber">{fmt.money(detail.totalHaber)}</Descriptions.Item>
              {detail.referenciaFolio && (
                <Descriptions.Item label="Documento origen" span={2}>
                  <Text code>{detail.referenciaFolio}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            <Table size="small"
              scroll={{ x: 'max-content' }} pagination={false}
              dataSource={detail.lineas ?? []} rowKey="id"
              columns={[
                { title: 'Cuenta', key: 'cta', ellipsis: true, render: (_: any, r: any) => `${r.cuentaContable?.codigo} — ${r.cuentaContable?.nombre}` },
                { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
                { title: 'Debe',  dataIndex: 'debe',  width: 120, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
                { title: 'Haber', dataIndex: 'haber', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
              ]} />
          </>
        )}
      </Drawer>
    </>
  );
}

// ── Estados Financieros ────────────────────────────────────────────────────────
function EstadosFinancieros() {
  const { token } = theme.useToken();
  const [hasta,  setHasta]  = useState(dayjs().format('YYYY-MM-DD'));
  const [rDesde, setRDesde] = useState(dayjs().startOf('year').format('YYYY-MM-DD'));
  const [rHasta, setRHasta] = useState(dayjs().format('YYYY-MM-DD'));

  const { data: balance }    = useQuery({ queryKey: ['balance', hasta],              queryFn: () => contabilidadApi.balanceGeneral(hasta) });
  const { data: resultados } = useQuery({ queryKey: ['resultados', rDesde, rHasta], queryFn: () => contabilidadApi.estadoResultados(rDesde, rHasta) });

  // Cuentas bancarias en USD para nota de conversión
  const { data: bancosRaw } = useQuery<any[]>({
    queryKey: ['bancos-contab'],
    queryFn: () => import('../../api/client').then(({ default: api }) =>
      api.get('/bancos').then((r: any) => r.data?.data ?? r.data)
    ),
    select: (d) => (Array.isArray(d) ? d : (d as any)?.data ?? []).filter((b: any) => b.moneda && b.moneda !== 'DOP'),
    staleTime: 300_000,
  });

  const chartData = resultados ? [
    { name: 'Ingresos', value: resultados.ingresos?.total ?? 0, fill: '#52c41a' },
    { name: 'Costos',   value: resultados.totalGastos ?? 0,     fill: '#ff7a45' },
    { name: 'Utilidad', value: Math.abs(resultados.utilidadNeta ?? 0), fill: resultados.utilidadNeta >= 0 ? '#1677ff' : '#ff4d4f' },
  ] : [];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card title="Balance General" extra={<Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 160 }} />}>
          {balance && (
            <>
              <Row gutter={[16, 8]}>
                <Col xs={24} sm={12}>
                  <Title level={5} style={{ color: '#1677ff' }}>ACTIVOS</Title>
                  {balance.activos?.detalle?.slice(0, 8).map((c: any) => (
                    <Row justify="space-between" key={c.codigo} style={{ padding: '2px 0' }}>
                      <Text ellipsis style={{ maxWidth: 180 }}>{c.nombre}</Text>
                      <Text strong>{fmt.money(c.saldo)}</Text>
                    </Row>
                  ))}
                  <Row justify="space-between" style={{ borderTop: '2px solid #1677ff', marginTop: 8, paddingTop: 4 }}>
                    <Text strong>TOTAL ACTIVOS</Text>
                    <Text strong style={{ color: '#1677ff' }}>{fmt.money(balance.activos?.total ?? 0)}</Text>
                  </Row>
                </Col>
                <Col xs={24} sm={12}>
                  <Title level={5} style={{ color: '#fa8c16' }}>PASIVOS</Title>
                  {balance.pasivos?.detalle?.slice(0, 5).map((c: any) => (
                    <Row justify="space-between" key={c.codigo} style={{ padding: '2px 0' }}>
                      <Text ellipsis style={{ maxWidth: 180 }}>{c.nombre}</Text>
                      <Text strong>{fmt.money(c.saldo)}</Text>
                    </Row>
                  ))}
                  <Row justify="space-between" style={{ borderTop: '1px solid #fa8c16', marginTop: 4, paddingTop: 4 }}>
                    <Text>Total Pasivos</Text><Text>{fmt.money(balance.pasivos?.total ?? 0)}</Text>
                  </Row>
                  <Title level={5} style={{ color: '#722ed1', marginTop: 8 }}>PATRIMONIO</Title>
                  {balance.patrimonio?.detalle?.slice(0, 3).map((c: any) => (
                    <Row justify="space-between" key={c.codigo} style={{ padding: '2px 0' }}>
                      <Text ellipsis style={{ maxWidth: 180 }}>{c.nombre}</Text>
                      <Text strong>{fmt.money(c.saldo)}</Text>
                    </Row>
                  ))}
                  <Row justify="space-between" style={{ borderTop: '2px solid #fa8c16', marginTop: 8, paddingTop: 4 }}>
                    <Text strong>TOTAL PAS + PAT</Text>
                    <Text strong style={{ color: '#fa8c16' }}>{fmt.money((balance.pasivos?.total ?? 0) + (balance.patrimonio?.total ?? 0))}</Text>
                  </Row>
                </Col>
              </Row>
              <Card size="small" style={{
                marginTop: 12,
                background:   balance.ecuacion?.cuadra ? token.colorSuccessBg  : token.colorErrorBg,
                borderColor:  balance.ecuacion?.cuadra ? token.colorSuccessBorder : token.colorErrorBorder,
              }}>
                <Tag color={balance.ecuacion?.cuadra ? 'success' : 'error'} style={{ marginRight: 8 }}>
                  {balance.ecuacion?.cuadra ? '✓ ECUACIÓN CUADRA' : '✗ NO CUADRA'}
                </Tag>
                Activos: {fmt.money(balance.ecuacion?.activos ?? 0)} = Pasivos + Patrimonio: {fmt.money(balance.ecuacion?.pasivosYPatrimonio ?? 0)}
              </Card>
              {/* Nota de moneda funcional */}
              <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 8, padding: '6px 8px', background: token.colorFillAlter, borderRadius: 6 }}>
                <strong>Moneda funcional:</strong> Todos los importes en Pesos Dominicanos (DOP). Los saldos en moneda extranjera fueron convertidos a DOP al tipo de cambio vigente en la fecha de cada transacción.
              </div>
              {/* Cuentas bancarias en USD */}
              {bancosRaw && bancosRaw.length > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8 }}>
                  <Typography.Text strong style={{ fontSize: 12 }}>Cuentas en Divisas</Typography.Text>
                  {bancosRaw.map((b: any) => (
                    <Row justify="space-between" key={b.id} style={{ marginTop: 4 }}>
                      <Typography.Text style={{ fontSize: 12 }}>{b.banco} — {b.numeroCuenta}</Typography.Text>
                      <Typography.Text strong style={{ fontSize: 12, color: '#b45309' }}>
                        {b.moneda} {Number(b.saldo).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </Typography.Text>
                    </Row>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card title="Estado de Resultados"
          extra={
            <Space size={4}>
              <Input type="date" value={rDesde} onChange={e => setRDesde(e.target.value)} style={{ width: 130 }} />
              <span>→</span>
              <Input type="date" value={rHasta} onChange={e => setRHasta(e.target.value)} style={{ width: 130 }} />
            </Space>
          }>
          {resultados && (
            <>
              <Row gutter={[8, 8]}>
                <Col xs={24} sm={12}><Statistic title="Ingresos" value={resultados.ingresos?.total ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#52c41a' }} /></Col>
                <Col xs={24} sm={12}><Statistic title="Costos" value={resultados.costos?.total ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ff7a45' }} /></Col>
                <Col xs={24} sm={12}><Statistic title="Utilidad Bruta" value={resultados.utilidadBruta ?? 0} formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={24} sm={12}><Statistic title="Gastos Operacionales" value={resultados.totalGastos ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ff4d4f' }} /></Col>
                <Col span={24}>
                  <Card size="small" style={{
                    background:  (resultados.utilidadNeta ?? 0) >= 0 ? token.colorSuccessBg  : token.colorErrorBg,
                    borderColor: (resultados.utilidadNeta ?? 0) >= 0 ? token.colorSuccessBorder : token.colorErrorBorder,
                  }}>
                    <Statistic
                      title={resultados.situacion === 'UTILIDAD' ? '✅ Utilidad Neta' : '❌ Pérdida Neta'}
                      value={Math.abs(resultados.utilidadNeta ?? 0)}
                      formatter={v => fmt.money(Number(v))}
                      valueStyle={{ color: (resultados.utilidadNeta ?? 0) >= 0 ? token.colorSuccess : token.colorError, fontSize: 22 }} />
                  </Card>
                </Col>
              </Row>
              <ResponsiveContainer width="100%" height={160} style={{ marginTop: 16 }}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => fmt.money(Number(v))} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── Balance de Comprobación ────────────────────────────────────────────────────
function BalanceComprobacion() {
  const [desde, setDesde] = useState(dayjs().startOf('year').format('YYYY-MM-DD'));
  const [hasta, setHasta] = useState(dayjs().format('YYYY-MM-DD'));

  const { data, isLoading } = useQuery({
    queryKey: ['balance-comp', desde, hasta],
    queryFn:  () => contabilidadApi.balanceComprobacion(desde, hasta),
  });

  const totalDebe  = data?.totales?.debe  ?? 0;
  const totalHaber = data?.totales?.haber ?? 0;
  const cuadra = Math.abs(totalDebe - totalHaber) < 0.01;

  const cols = [
    { title: 'Código',  dataIndex: 'codigo',     width: 120 },
    { title: 'Nombre',  dataIndex: 'nombre',      ellipsis: true,
      render: (v: string, r: any) => <span style={{ paddingLeft: (r.nivel - 1) * 12 }}>{v}</span> },
    { title: 'Tipo',    dataIndex: 'tipo',         width: 100,
      render: (v: string) => <Tag color={tipoColor[v] ?? 'default'} style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Debe',    dataIndex: 'totalDebe',    width: 130, align: 'right' as const,
      render: (v: number) => v > 0 ? fmt.money(v) : '' },
    { title: 'Haber',   dataIndex: 'totalHaber',   width: 130, align: 'right' as const,
      render: (v: number) => v > 0 ? fmt.money(v) : '' },
    { title: 'Saldo',   dataIndex: 'saldo',        width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ color: v < 0 ? '#ff4d4f' : undefined, fontWeight: 500 }}>{fmt.money(v)}</span> },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Space size={4}>
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 145 }} />
          <span>→</span>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 145 }} />
        </Space>
        <Space size={4}>
          {data && (
            <>
              <Tag>Debe: {fmt.money(totalDebe)}</Tag>
              <Tag color={cuadra ? 'green' : 'red'}>{cuadra ? '✓ Cuadra' : '✗ No cuadra'}</Tag>
              <Tag>Haber: {fmt.money(totalHaber)}</Tag>
            </>
          )}
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.cuentas ?? []).map((c: any) => ({
              'Código': c.codigo, 'Nombre': c.nombre, 'Tipo': c.tipo,
              'Debe': Number(c.totalDebe ?? 0), 'Haber': Number(c.totalHaber ?? 0), 'Saldo': Number(c.saldo ?? 0),
            }));
            exportarExcel(filas, `BalanceComprobacion-${hasta}`);
            message.success(`${filas.length} cuentas exportadas`);
          }}>Excel</Button>
        </Space>
      </Row>
      <Table columns={cols} dataSource={data?.cuentas ?? []} rowKey="codigo"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        summary={() => data ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><Text strong>TOTALES</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right"><Text strong>{fmt.money(totalDebe)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><Text strong>{fmt.money(totalHaber)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={5} />
          </Table.Summary.Row>
        ) : undefined} />
    </>
  );
}

// ── Libro Mayor ────────────────────────────────────────────────────────────────
function LibroMayor() {
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [desde, setDesde] = useState(dayjs().startOf('year').format('YYYY-MM-DD'));
  const [hasta, setHasta] = useState(dayjs().format('YYYY-MM-DD'));

  const { data: cuentas } = useQuery({ queryKey: ['cuentas-sel'], queryFn: () => contabilidadApi.cuentas(true) });
  const { data: mayor, isLoading } = useQuery({
    queryKey: ['libro-mayor', cuentaId, desde, hasta],
    queryFn:  () => contabilidadApi.libroMayor(cuentaId!, desde, hasta),
    enabled:  !!cuentaId,
  });

  const cols = [
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Debe',  dataIndex: 'debe',  width: 130, align: 'right' as const,
      render: (v: number) => v > 0 ? fmt.money(v) : '' },
    { title: 'Haber', dataIndex: 'haber', width: 130, align: 'right' as const,
      render: (v: number) => v > 0 ? fmt.money(v) : '' },
    { title: 'Saldo', dataIndex: 'saldo', width: 140, align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt.money(v)}</span> },
  ];

  return (
    <>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
        <Col xs={24} sm={10}>
          <Select style={{ width: '100%' }} showSearch allowClear placeholder="Seleccionar cuenta..."
            filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
            options={cuentas?.map((c: any) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
            onChange={(v) => setCuentaId(v ?? null)} />
        </Col>
        <Col>
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 145 }} />
        </Col>
        <Col><Text type="secondary">→</Text></Col>
        <Col>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 145 }} />
        </Col>
      </Row>

      {mayor && (
        <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={10}><Statistic title="Cuenta" value={`${mayor.cuenta?.codigo} — ${mayor.cuenta?.nombre}`} valueStyle={{ fontSize: 13 }} /></Col>
          <Col xs={12} sm={6}><Statistic title="Tipo" value={(mayor.cuenta?.tipo ?? '').toUpperCase()} /></Col>
          <Col xs={24} sm={8}>
            <Statistic title="Saldo Final" value={mayor.saldoFinal ?? 0} formatter={v => fmt.money(Number(v))}
              valueStyle={{ color: (mayor.saldoFinal ?? 0) >= 0 ? '#52c41a' : '#ff4d4f' }} />
          </Col>
        </Row>
      )}

      <Table columns={cols} dataSource={mayor?.movimientos ?? []} rowKey={(_, i) => String(i)}
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: cuentaId ? 'Sin movimientos en el período' : 'Selecciona una cuenta para ver su libro mayor' }} />
    </>
  );
}

export default function ContabilidadPage() {
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Contabilidad General" planMinimo={config.planMinimo} planActual={plan} />;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Asientos Contables</Title>
      <Asientos />
    </div>
  );
}
