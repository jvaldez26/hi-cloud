import { useState, useMemo } from 'react';
import {
  Card, Row, Col, Button, Tag, Modal, Form, Select, Input,
  Space, Typography, Statistic, Popconfirm, message, Tooltip,
  Divider, Alert, theme, Table,
} from 'antd';
import {
  CalendarOutlined, LockOutlined, UnlockOutlined,
  CheckCircleOutlined, PlusOutlined,
  WarningOutlined, ThunderboltOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const ESTADO_CONFIG_COLORS = {
  abierto:   { color: '#1a56db', antColor: 'blue',    label: 'Abierto',   icon: <UnlockOutlined /> },
  cerrado:   { color: '#059669', antColor: 'success',  label: 'Cerrado',   icon: <CheckCircleOutlined /> },
  bloqueado: { color: '#6b7280', antColor: 'default',  label: 'Bloqueado', icon: <LockOutlined /> },
  sincrear:  { color: '#d97706', antColor: 'warning',  label: 'Sin crear', icon: <WarningOutlined /> },
} as const;

function useEstadoConfig() {
  const { token } = theme.useToken();
  return {
    abierto:   { ...ESTADO_CONFIG_COLORS.abierto,   bg: token.colorInfoBg,    border: token.colorInfoBorder },
    cerrado:   { ...ESTADO_CONFIG_COLORS.cerrado,   bg: token.colorSuccessBg, border: token.colorSuccessBorder },
    bloqueado: { ...ESTADO_CONFIG_COLORS.bloqueado, bg: token.colorFillAlter, border: token.colorBorderSecondary },
    sincrear:  { ...ESTADO_CONFIG_COLORS.sincrear,  bg: token.colorWarningBg, border: token.colorWarningBorder },
  };
}

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

export default function PeriodoContablePage() {
  const qc            = useQueryClient();
  const { token }     = theme.useToken();
  const ESTADO_CONFIG = useEstadoConfig();
  const anioActual    = new Date().getFullYear();
  const [search,      setSearch]      = useState('');
  const [anio,        setAnio]        = useState(anioActual);
  const [modalCrear,  setModalCrear]  = useState(false);
  const [modalCerrar, setModalCerrar] = useState<any>(null);
  const [formCrear]  = Form.useForm();
  const [formCerrar] = Form.useForm();

  const { data: resumen, isLoading } = useQuery<any>({
    queryKey: ['periodos-resumen', anio],
    queryFn: () => api.get(`/periodo-contable/resumen?anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
  });

  const periodosPorMes: Record<number, any> = {};
  (resumen?.periodos ?? []).forEach((p: any) => { periodosPorMes[p.mes] = p; });

  const generarAnio = useMutation({
    mutationFn: () => api.post('/periodo-contable/generar-anio', { anio }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      message.success(res.data?.mensaje ?? 'Períodos generados');
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const crearPeriodo = useMutation({
    mutationFn: (dto: any) => api.post('/periodo-contable', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      message.success('Período creado');
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const cerrarPeriodo = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      api.patch(`/periodo-contable/${id}/cerrar`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      setModalCerrar(null);
      formCerrar.resetFields();
      message.success('Período cerrado correctamente');
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const reabrirPeriodo = useMutation({
    mutationFn: (id: number) => api.patch(`/periodo-contable/${id}/reabrir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      message.success('Período reabierto');
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const bloquearPeriodo = useMutation({
    mutationFn: (id: number) => api.patch(`/periodo-contable/${id}/bloquear`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      message.success('Período bloqueado permanentemente');
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const mesActual = new Date().getMonth() + 1;

  const dataSource = useMemo(() =>
    MESES
      .map((nombre, idx) => ({ nombre, numMes: idx + 1 }))
      .filter(({ nombre }) => nombre.toLowerCase().includes(search.toLowerCase()))
      .map(({ nombre, numMes }) => ({
        key:      numMes,
        numMes,
        nombre,
        periodo:  periodosPorMes[numMes],
        esActual: numMes === mesActual && anio === anioActual,
      })),
    [search, periodosPorMes, mesActual, anio, anioActual],
  );

  const columns = [
    {
      title: 'Mes',
      key: 'mes',
      render: (_: any, row: any) => (
        <Space size={6}>
          <Text strong>{row.nombre} {anio}</Text>
          {row.esActual && <Tag color="orange" style={{ fontSize: 10, lineHeight: '18px' }}>ACTUAL</Tag>}
        </Space>
      ),
    },
    {
      title: 'Estado',
      key: 'estado',
      width: 130,
      render: (_: any, row: any) => {
        const conf = row.periodo
          ? ESTADO_CONFIG[row.periodo.estado as keyof typeof ESTADO_CONFIG]
          : ESTADO_CONFIG.sincrear;
        return <Tag color={conf.antColor}>{conf.icon} {conf.label}</Tag>;
      },
    },
    {
      title: 'Asientos',
      key: 'asientos',
      width: 100,
      align: 'right' as const,
      render: (_: any, row: any) =>
        row.periodo?.cantidadAsientos > 0
          ? <Text>{row.periodo.cantidadAsientos}</Text>
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Total Débitos',
      key: 'debitos',
      width: 180,
      align: 'right' as const,
      render: (_: any, row: any) =>
        row.periodo?.totalDebitos > 0
          ? <Text style={{ color: '#1a56db', fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(row.periodo.totalDebitos))}</Text>
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Fecha Cierre',
      key: 'fechaCierre',
      width: 130,
      render: (_: any, row: any) =>
        row.periodo?.fechaCierre
          ? new Date(row.periodo.fechaCierre).toLocaleDateString('es-DO')
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Acciones',
      key: 'acciones',
      width: 220,
      render: (_: any, row: any) => {
        const { periodo, numMes } = row;
        return (
          <Space size={4}>
            {!periodo && (
              <Button size="small" type="primary" ghost icon={<PlusOutlined />}
                onClick={() => { formCrear.setFieldsValue({ anio, mes: numMes }); setModalCrear(true); }}>
                Crear
              </Button>
            )}
            {periodo?.estado === 'abierto' && (
              <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                style={{ background: '#059669', borderColor: '#059669' }}
                onClick={() => setModalCerrar(periodo)}>
                Cerrar
              </Button>
            )}
            {periodo?.estado === 'cerrado' && (
              <>
                <Popconfirm title="¿Reabrir este período?"
                  description="Se permitirá registrar nuevos asientos."
                  onConfirm={() => reabrirPeriodo.mutate(periodo.id)}>
                  <Button size="small" icon={<UnlockOutlined />}>Reabrir</Button>
                </Popconfirm>
                <Popconfirm title="¿Bloquear permanentemente?"
                  description="Esta acción es IRREVERSIBLE. El período no podrá reabrirse."
                  okType="danger" okText="Bloquear"
                  onConfirm={() => bloquearPeriodo.mutate(periodo.id)}>
                  <Button size="small" danger icon={<LockOutlined />}>Bloquear</Button>
                </Popconfirm>
              </>
            )}
            {periodo?.estado === 'bloqueado' && (
              <Text type="secondary" style={{ fontSize: 11 }}><LockOutlined /> Permanente</Text>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CalendarOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Períodos Contables</Title>
            <Text type="secondary">Control de apertura y cierre de períodos fiscales</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por período..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select value={anio} onChange={setAnio} style={{ width: 110 }}>
            {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map(y => (
              <Option key={y} value={y}>{y}</Option>
            ))}
          </Select>
          <Tooltip title="Crear todos los 12 períodos del año de una vez">
            <Button icon={<ThunderboltOutlined />}
              onClick={() => generarAnio.mutate()}
              loading={generarAnio.isPending}>
              Generar año {anio}
            </Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Período
          </Button>
        </Space>
      </div>

      {/* Tabla de períodos */}
      <Table
        dataSource={dataSource}
        columns={columns}
        loading={isLoading}
        pagination={false}
        size="small"
        rowKey="numMes"
        scroll={{ x: 'max-content' }}
      />

      {/* Totales del año */}
      {resumen && (resumen.cerrados + resumen.bloqueados) > 0 && (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Row gutter={24} align="middle">
            <Col>
              <Text type="secondary" style={{ fontSize: 12 }}>TOTALES DEL AÑO {anio}</Text>
            </Col>
            <Col>
              <Statistic title="Total Débitos" value={resumen.totalDebitos}
                formatter={v => fmt(Number(v))}
                valueStyle={{ fontSize: 18, color: '#1a56db' }} />
            </Col>
            <Col>
              <Statistic title="Total Créditos" value={resumen.totalCreditos}
                formatter={v => fmt(Number(v))}
                valueStyle={{ fontSize: 18, color: '#059669' }} />
            </Col>
            <Col>
              <Statistic title="Diferencia"
                value={Math.abs(resumen.totalDebitos - resumen.totalCreditos)}
                formatter={v => fmt(Number(v))}
                valueStyle={{ fontSize: 18, color: Math.abs(resumen.totalDebitos - resumen.totalCreditos) < 0.01 ? '#059669' : '#ef4444' }} />
              {Math.abs(resumen.totalDebitos - resumen.totalCreditos) < 0.01 && (
                <Tag color="green" style={{ fontSize: 10 }}>Cuadrado</Tag>
              )}
            </Col>
          </Row>
        </Card>
      )}

      {/* Modal crear período */}
      <Modal title={<Space><CalendarOutlined />Crear Período Contable</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crearPeriodo.isPending}
        okText="Crear">
        <Form form={formCrear} layout="vertical"
          initialValues={{ anio, mes: new Date().getMonth() + 1 }}
          onFinish={v => crearPeriodo.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="anio" label="Año" rules={[{ required: true }]}>
                <Select>
                  {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map(y => (
                    <Option key={y} value={y}>{y}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="mes" label="Mes" rules={[{ required: true }]}>
                <Select>
                  {MESES.map((m, i) => (
                    <Option key={i + 1} value={i + 1}>{m}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={2} placeholder="Observaciones del período..." />
          </Form.Item>
        </Form>
        <Alert type="info" showIcon style={{ marginTop: 8 }}
          message="El período se creará en estado ABIERTO. Puedes registrar asientos contables mientras esté abierto." />
      </Modal>

      {/* Modal cerrar período */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: '#059669' }} />Cerrar Período — {modalCerrar?.nombre}</Space>}
        open={!!modalCerrar}
        onCancel={() => { setModalCerrar(null); formCerrar.resetFields(); }}
        onOk={() => formCerrar.submit()}
        confirmLoading={cerrarPeriodo.isPending}
        okText="Confirmar Cierre"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}>
        <Alert type="warning" showIcon icon={<WarningOutlined />}
          message="Al cerrar el período se calcularán los totales de débitos y créditos de los asientos contabilizados del mes."
          style={{ marginBottom: 16 }} />
        <Form form={formCerrar} layout="vertical"
          onFinish={v => cerrarPeriodo.mutate({ id: modalCerrar?.id, dto: v })}>
          <Form.Item name="notasCierre" label="Notas de cierre (opcional)">
            <Input.TextArea rows={3} placeholder="Observaciones del cierre del período..." />
          </Form.Item>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Podrás reabrir el período si es necesario, pero no podrás registrar asientos mientras esté cerrado.
          Para una clausura definitiva, usa el botón <strong>Bloquear</strong> después del cierre.
        </Text>
      </Modal>
    </div>
  );
}
