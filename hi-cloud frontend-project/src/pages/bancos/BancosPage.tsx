import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Typography, Select, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, InputNumber, Tabs,
  Popconfirm, message, Progress, Upload, Divider, Badge, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, CloseOutlined, BankOutlined,
  UploadOutlined, LinkOutlined, DisconnectOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

const bancosApi = {
  cuentas:         ()                          => api.get('/bancos/cuentas').then(r => r.data?.data ?? r.data ?? []),
  crearCuenta:     (b: any)                    => api.post('/bancos/cuentas', b).then(r => r.data?.data ?? r.data),
  actualizarCuenta:(id: number, b: any)        => api.patch(`/bancos/cuentas/${id}`, b).then(r => r.data?.data ?? r.data),
  eliminarCuenta:  (id: number)                => api.delete(`/bancos/cuentas/${id}`).then(r => r.data?.data ?? r.data),
  movimientos:     (cid: number, p = 1, nc = false) =>
    api.get(`/bancos/cuentas/${cid}/movimientos?page=${p}&soloNoConciliados=${nc}`).then(r => r.data?.data ?? r.data),
  agregar:         (b: any)                    => api.post('/bancos/movimientos', b).then(r => r.data?.data ?? r.data),
  conciliar:       (id: number, sistemaId?: number, tipo?: string) =>
    api.patch(`/bancos/movimientos/${id}/conciliar`, { sistemaId, sistemaTipo: tipo }).then(r => r.data?.data ?? r.data),
  desconciliar:    (id: number)                => api.patch(`/bancos/movimientos/${id}/desconciliar`).then(r => r.data?.data ?? r.data),
  eliminarMov:     (id: number)                => api.delete(`/bancos/movimientos/${id}`).then(r => r.data?.data ?? r.data),
  resumen:         (cid: number, m: number, a: number) =>
    api.get(`/bancos/cuentas/${cid}/resumen?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  importarCSV:     (cid: number, csv: string, banco = 'generico') => api.post(`/bancos/cuentas/${cid}/importar-csv`, { csvContent: csv, banco }).then(r => r.data?.data ?? r.data),
};

const TIPO_COLOR: Record<string, string> = { debito: 'red', credito: 'green' };

export default function BancosPage() {
  const { token } = theme.useToken();
  const [cuentaId,    setCuentaId]    = useState<number | null>(null);
  const [mes,         setMes]         = useState(dayjs().month() + 1);
  const [anio,        setAnio]        = useState(dayjs().year());
  const [pageMov,     setPageMov]     = useState(1);
  const [soloNoCon,   setSoloNoCon]   = useState(false);
  const [cuentaModal, setCuentaModal] = useState(false);
  const [movModal,    setMovModal]    = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [bancoCsv,    setBancoCsv]    = useState('generico');
  const [importando,  setImportando]  = useState(false);
  const [formCuenta] = Form.useForm();
  const [formMov]    = Form.useForm();
  const qc = useQueryClient();

  const { data: cuentas }   = useQuery({ queryKey: ['bancos-cuentas'], queryFn: bancosApi.cuentas });
  const { data: movs, isLoading } = useQuery({
    queryKey: ['bancos-movs', cuentaId, pageMov, soloNoCon],
    queryFn:  () => bancosApi.movimientos(cuentaId!, pageMov, soloNoCon),
    enabled:  !!cuentaId,
  });
  const { data: resumen } = useQuery({
    queryKey: ['bancos-resumen', cuentaId, mes, anio],
    queryFn:  () => bancosApi.resumen(cuentaId!, mes, anio),
    enabled:  !!cuentaId,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['bancos-movs'] });
    qc.invalidateQueries({ queryKey: ['bancos-resumen'] });
  };

  const crearCuentaMut = useMutation({
    mutationFn: bancosApi.crearCuenta,
    onSuccess: (c: any) => {
      qc.invalidateQueries({ queryKey: ['bancos-cuentas'] });
      setCuentaModal(false); formCuenta.resetFields();
      setCuentaId(c.id); message.success('Cuenta creada');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al crear cuenta'),
  });

  const agregarMovMut = useMutation({
    mutationFn: bancosApi.agregar,
    onSuccess: () => { inv(); setMovModal(false); formMov.resetFields(); message.success('Movimiento agregado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const conciliarMut = useMutation({
    mutationFn: (id: number) => bancosApi.conciliar(id),
    onSuccess: () => { inv(); message.success('Conciliado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al conciliar'),
  });

  const desconciliarMut = useMutation({
    mutationFn: bancosApi.desconciliar,
    onSuccess: () => { inv(); message.success('Desconciliado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al desconciliar'),
  });

  const importarCSVMut = useMutation({
    mutationFn: ({ csv, banco }: { csv: string; banco: string }) =>
      bancosApi.importarCSV(cuentaId!, csv, banco),
    onSuccess: (res: any) => {
      inv(); setImportModal(false);
      message.success(`✅ ${res?.importados ?? 0} movimientos importados (${res?.banco})`);
      if (res?.errores?.length > 0) {
        message.warning(`${res.errores.length} filas con errores (ver consola)`, 6);
        console.warn('Errores CSV:', res.errores);
      }
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al importar'),
  });

  const eliminarMovMut = useMutation({
    mutationFn: bancosApi.eliminarMov,
    onSuccess: () => { inv(); message.success('Eliminado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al eliminar'),
  });

  const colsMov = [
    { title: 'Fecha',       dataIndex: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Referencia',  dataIndex: 'referencia',  width: 120, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Tipo',        dataIndex: 'tipo',        width: 90,
      render: (v: string) => <Tag color={TIPO_COLOR[v]}>{v === 'credito' ? '↑ Crédito' : '↓ Débito'}</Tag> },
    { title: 'Monto',       dataIndex: 'monto',       width: 130,
      render: (v: number, r: any) => (
        <Text strong style={{ color: r.tipo === 'credito' ? '#10b981' : '#ef4444' }}>
          {r.tipo === 'credito' ? '+' : '-'}{fmt.money(v)}
        </Text>
      )},
    { title: 'Estado', dataIndex: 'conciliado', width: 110,
      render: (v: boolean) => v
        ? <Tag color="green" icon={<CheckOutlined />}>Conciliado</Tag>
        : <Tag color="orange">Pendiente</Tag> },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => {}}
          viewLabel="Ver movimiento"
          items={[
            r.conciliado
              ? { key: 'desconciliar', label: 'Desconciliar', icon: <DisconnectOutlined />, onClick: () => desconciliarMut.mutate(r.id) }
              : { key: 'conciliar', label: 'Marcar conciliado', icon: <LinkOutlined />, onClick: () => conciliarMut.mutate(r.id) },
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar movimiento', icon: <DeleteOutlined />, danger: true,
              onClick: () => { if (window.confirm('¿Eliminar este movimiento?')) eliminarMovMut.mutate(r.id); } },
          ]}
        />
      )},
  ];

  const cuentaActual = (cuentas ?? []).find((c: any) => c.id === cuentaId);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <BankOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Cuentas Bancarias & Conciliación
          </Title>
        </Col>
        <Col>
          <Space>
            {cuentaId && (
              <Button icon={<UploadOutlined />} onClick={() => setImportModal(true)}>
                Importar CSV
              </Button>
            )}
            <RefreshByKeyButton queryKey={['bancos']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCuentaModal(true)}>
              Nueva cuenta
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Selector de cuentas */}
      {(cuentas ?? []).length > 0 ? (
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          {(cuentas ?? []).map((c: any) => (
            <Col xs={24} sm={12} md={8} key={c.id}>
              <div
                onClick={() => setCuentaId(c.id)}
                style={{
                  padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${cuentaId === c.id ? '#1677ff' : '#e2e8f0'}`,
                  background: cuentaId === c.id ? token.colorPrimaryBg : token.colorBgContainer,
                  transition: 'all .15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>{c.nombre}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{c.banco} · {c.numeroCuenta}</Text>
                  </div>
                  <Tag color="blue">{c.tipo}</Tag>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text style={{ color: '#1677ff', fontWeight: 700 }}>
                    Saldo inicial: {fmt.money(c.saldoInicial)}
                  </Text>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      ) : (
        <Card style={{ marginBottom: 20, textAlign: 'center', padding: 40 }}>
          <BankOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 12 }} />
          <br />
          <Text type="secondary">No hay cuentas bancarias registradas.</Text>
          <br />
          <Button type="primary" style={{ marginTop: 12 }} onClick={() => setCuentaModal(true)}>
            Agregar primera cuenta
          </Button>
        </Card>
      )}

      {/* Panel conciliación */}
      {cuentaId && (
        <>
          {/* Resumen del período */}
          {resumen && (
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={16} align="middle">
                <Col xs={24} md={4}>
                  <Select value={mes} onChange={setMes} style={{ width: '100%' }} options={MESES} />
                  <Select value={anio} onChange={setAnio} style={{ width: '100%', marginTop: 8 }}
                    options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic title="Saldo inicial" value={resumen.saldoInicial}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ fontSize: 16 }} />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic title="Total créditos" value={resumen.totalCreditos}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#10b981', fontSize: 16 }} />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic title="Total débitos" value={resumen.totalDebitos}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444', fontSize: 16 }} />
                </Col>
                <Col xs={12} md={4}>
                  <Statistic title="Saldo final" value={resumen.saldoFinal}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#1677ff', fontSize: 18 }} />
                </Col>
                <Col xs={24} md={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Conciliación</Text>
                  <Progress percent={resumen.porcentajeConciliado} size="small"
                    status={resumen.porcentajeConciliado === 100 ? 'success' : 'normal'} />
                  <Text style={{ fontSize: 11 }}>
                    {resumen.conciliados}/{resumen.movimientosPeriodo} movimientos
                  </Text>
                </Col>
              </Row>
            </Card>
          )}

          {/* Tabla movimientos */}
          <Card
            title={`Movimientos — ${cuentaActual?.banco} ${cuentaActual?.numeroCuenta}`}
            extra={
              <Space>
                <Button size="small"
                  type={soloNoCon ? 'primary' : 'default'}
                  onClick={() => { setSoloNoCon(!soloNoCon); setPageMov(1); }}>
                  {soloNoCon ? '⚠️ Solo pendientes' : 'Todos'}
                </Button>
                <Button size="small" icon={<PlusOutlined />}
                  onClick={() => { setMovModal(true); formMov.setFieldsValue({ cuentaId }); }}>
                  Agregar
                </Button>
              </Space>
            }
          >
            <Table columns={colsMov} dataSource={movs?.data ?? []} rowKey="id"
              loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
              rowClassName={(r: any) => r.conciliado ? '' : 'ant-table-row-warning'}
              pagination={{ total: movs?.meta?.total, pageSize: 20, current: pageMov,
                            onChange: setPageMov, showSizeChanger: false }} />
          </Card>
        </>
      )}

      {/* Modal nueva cuenta */}
      <Modal title="Nueva Cuenta Bancaria" open={cuentaModal}
        onCancel={() => setCuentaModal(false)} footer={null} width={500}>
        <Form form={formCuenta} layout="vertical"
          initialValues={{ tipo: 'corriente', moneda: 'DOP', saldoInicial: 0 }}
          onFinish={v => crearCuentaMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={14}><Form.Item name="nombre" label="Nombre de la cuenta" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="banco" label="Banco" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="numeroCuenta" label="Número de cuenta" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo">
              <Select options={[
                { value: 'corriente', label: 'Corriente' },
                { value: 'ahorros',   label: 'Ahorros' },
                { value: 'empresarial', label: 'Empresarial' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="saldoInicial" label="Saldo inicial (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="moneda" label="Moneda">
              <Select options={[{ value: 'DOP', label: '🇩🇴 Pesos (DOP)' }, { value: 'USD', label: '🇺🇸 Dólares (USD)' }]} />
            </Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCuentaModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearCuentaMut.isPending}>Crear cuenta</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal agregar movimiento */}
      <Modal title="Agregar Movimiento" open={movModal}
        onCancel={() => setMovModal(false)} footer={null} width={500}>
        <Form form={formMov} layout="vertical"
          initialValues={{ tipo: 'credito', fecha: dayjs().format('YYYY-MM-DD') }}
          onFinish={v => agregarMovMut.mutate({ ...v, cuentaId })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo">
              <Select options={[{ value: 'credito', label: '↑ Crédito (depósito)' }, { value: 'debito', label: '↓ Débito (retiro)' }]} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="referencia" label="Referencia / Cheque #"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setMovModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={agregarMovMut.isPending}>Agregar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Importar Extracto CSV ────────────────────────────── */}
      <Modal
        title={<><UploadOutlined style={{ marginRight: 8 }} />Importar Extracto Bancario CSV</>}
        open={importModal}
        onCancel={() => setImportModal(false)}
        footer={null}
        width={560}
      >
        <div style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13 }}>Selecciona el banco para detectar el formato automáticamente:</Text>
          <Select
            value={bancoCsv}
            onChange={setBancoCsv}
            style={{ width: '100%', marginTop: 8 }}
            options={[
              { value: 'banreservas', label: '🏦 Banreservas' },
              { value: 'bhd',        label: '🏦 BHD León' },
              { value: 'popular',    label: '🏦 Banco Popular' },
              { value: 'scotiabank', label: '🏦 Scotiabank' },
              { value: 'apap',       label: '🏦 APAP' },
              { value: 'generico',   label: '📄 Genérico (auto-detectar)' },
            ]}
          />
        </div>

        <Upload.Dragger
          accept=".csv,.txt"
          showUploadList={false}
          beforeUpload={(file) => {
            setImportando(true);
            const reader = new FileReader();
            reader.onload = (e) => {
              const csv = e.target?.result as string;
              if (csv) {
                importarCSVMut.mutate({ csv, banco: bancoCsv });
              }
              setImportando(false);
            };
            reader.readAsText(file, 'UTF-8');
            return false;
          }}
          disabled={importarCSVMut.isPending || importando}
          style={{ padding: 20 }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 32, color: '#1677ff' }} /></p>
          <p style={{ fontWeight: 600 }}>Haz clic o arrastra el archivo CSV aquí</p>
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
            Extracto del banco en formato CSV — columnas: Fecha, Descripción, Referencia, Débito, Crédito
          </p>
        </Upload.Dragger>

        <div style={{ marginTop: 16, background: token.colorFillAlter, borderRadius: 8, padding: 12 }}>
          <Text style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
            <strong>Formatos soportados por banco:</strong>
          </Text>
          {[
            { banco: 'Banreservas', sep: ';', cols: 'Fecha;Descripcion;Referencia;Credito;Debito;Balance' },
            { banco: 'BHD León',   sep: ',', cols: 'Fecha,Descripcion,Documento,Debito,Credito,Saldo' },
            { banco: 'Popular',    sep: '|', cols: 'Fecha|Descripcion|Tipo|Monto|Balance' },
          ].map(b => (
            <Text key={b.banco} style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>
              • <strong>{b.banco}</strong>: {b.cols}
            </Text>
          ))}
        </div>
      </Modal>
    </div>
  );
}
