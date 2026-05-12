import { useState } from 'react';
import {
  Card, Row, Col, Button, Tag, Modal, Form, Select, Input,
  Space, Typography, Statistic, Popconfirm, message, Tooltip,
  Divider, Progress, Alert, theme,
} from 'antd';
import {
  CalendarOutlined, LockOutlined, UnlockOutlined,
  CheckCircleOutlined, PlusOutlined, CloseCircleOutlined,
  DollarOutlined, FileTextOutlined, WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// Los bg/border se calculan con tokens en el componente usando useEstadoConfig()
const ESTADO_CONFIG_COLORS = {
  abierto:   { color: '#1a56db', antColor: 'blue',    label: 'Abierto',   icon: <UnlockOutlined /> },
  cerrado:   { color: '#059669', antColor: 'success',  label: 'Cerrado',   icon: <CheckCircleOutlined /> },
  bloqueado: { color: '#6b7280', antColor: 'default',  label: 'Bloqueado', icon: <LockOutlined /> },
  sincrear:  { color: '#d97706', antColor: 'warning',  label: 'Sin crear', icon: <WarningOutlined /> },
} as const;

// Hook para obtener config con tokens adaptativos
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
  const qc          = useQueryClient();
  const { token }   = theme.useToken();
  const ESTADO_CONFIG = useEstadoConfig();
  const anioActual  = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
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
  });

  const crearPeriodo = useMutation({
    mutationFn: (dto: any) => api.post('/periodo-contable', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      message.success('Período creado');
    },
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
  });

  const reabrirPeriodo = useMutation({
    mutationFn: (id: number) => api.patch(`/periodo-contable/${id}/reabrir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      message.success('Período reabierto');
    },
  });

  const bloquearPeriodo = useMutation({
    mutationFn: (id: number) => api.patch(`/periodo-contable/${id}/bloquear`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periodos-resumen'] });
      message.success('Período bloqueado permanentemente');
    },
  });

  const mesActual = new Date().getMonth() + 1;
  const pctAvance = resumen ? Math.round(((resumen.cerrados + resumen.bloqueados) / 12) * 100) : 0;

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CalendarOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Períodos Contables</Title>
            <Text type="secondary">Control de apertura y cierre de períodos fiscales</Text>
          </div>
        </div>
        <Space>
          <Select
            value={anio}
            onChange={setAnio}
            style={{ width: 110 }}
          >
            {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map(y => (
              <Option key={y} value={y}>{y}</Option>
            ))}
          </Select>
          <Tooltip title="Crear todos los 12 períodos del año de una vez">
            <Button
              icon={<ThunderboltOutlined />}
              onClick={() => generarAnio.mutate()}
              loading={generarAnio.isPending}
            >
              Generar año {anio}
            </Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Período
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Abiertos</span>}
              value={resumen?.abiertos ?? 0}
              prefix={<UnlockOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Cerrados</span>}
              value={resumen?.cerrados ?? 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#6b7280,#9ca3af)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Bloqueados</span>}
              value={resumen?.bloqueados ?? 0}
              prefix={<LockOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Avance del año
            </Text>
            <Progress
              percent={pctAvance}
              strokeColor={{ '0%': '#1a56db', '100%': '#059669' }}
              style={{ marginBottom: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {resumen?.cerrados ?? 0} de 12 meses cerrados
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Grid de 12 meses */}
      <Card bordered={false} style={{ borderRadius: 12 }} loading={isLoading}>
        <Row gutter={[12, 12]}>
          {MESES.map((nombreMes, idx) => {
            const numMes  = idx + 1;
            const periodo = periodosPorMes[numMes];
            const conf    = periodo ? ESTADO_CONFIG[periodo.estado as keyof typeof ESTADO_CONFIG] : ESTADO_CONFIG.sincrear;
            const esActual = numMes === mesActual && anio === anioActual;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={numMes}>
                <div
                  style={{
                    border:       `2px solid ${esActual && !periodo ? '#f59e0b' : conf.border}`,
                    borderRadius: 10,
                    padding:      '14px 16px',
                    background:   conf.bg,
                    position:     'relative',
                    minHeight:    150,
                  }}
                >
                  {/* Mes actual badge */}
                  {esActual && (
                    <div style={{
                      position: 'absolute', top: -10, right: 8,
                      background: '#f59e0b', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10,
                    }}>
                      ACTUAL
                    </div>
                  )}

                  {/* Cabecera */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <Text strong style={{ fontSize: 15, color: token.colorText }}>
                        {nombreMes}
                      </Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>{anio}</Text>
                      </div>
                    </div>
                    <Tag
                      color={conf.color}
                      style={{
                        background: conf.bg,
                        border: `1px solid ${conf.border}`,
                        color:  conf.color,
                        fontSize: 10,
                      }}
                    >
                      {conf.icon} {conf.label}
                    </Tag>
                  </div>

                  {/* Totales (solo si tiene datos) */}
                  {periodo && (
                    <div style={{ marginBottom: 10 }}>
                      {periodo.cantidadAsientos > 0 && (
                        <>
                          <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>
                            <FileTextOutlined /> {periodo.cantidadAsientos} asientos
                          </div>
                          <div style={{ fontSize: 11, color: '#059669' }}>
                            <DollarOutlined /> {fmt(Number(periodo.totalDebitos))}
                          </div>
                        </>
                      )}
                      {periodo.fechaCierre && (
                        <div style={{ fontSize: 10, color: token.colorTextTertiary, marginTop: 2 }}>
                          Cerrado: {new Date(periodo.fechaCierre).toLocaleDateString('es-DO')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {!periodo && (
                      <Button
                        size="small"
                        type="primary"
                        ghost
                        icon={<PlusOutlined />}
                        onClick={() => {
                          formCrear.setFieldsValue({ anio, mes: numMes });
                          setModalCrear(true);
                        }}
                        style={{ fontSize: 11 }}
                      >
                        Crear
                      </Button>
                    )}

                    {periodo?.estado === 'abierto' && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={() => setModalCerrar(periodo)}
                        style={{ fontSize: 11, background: '#059669', borderColor: '#059669' }}
                      >
                        Cerrar
                      </Button>
                    )}

                    {periodo?.estado === 'cerrado' && (
                      <>
                        <Popconfirm
                          title="¿Reabrir este período?"
                          description="Se permitirá registrar nuevos asientos."
                          onConfirm={() => reabrirPeriodo.mutate(periodo.id)}
                        >
                          <Button size="small" icon={<UnlockOutlined />} style={{ fontSize: 11 }}>
                            Reabrir
                          </Button>
                        </Popconfirm>
                        <Popconfirm
                          title="¿Bloquear permanentemente?"
                          description="Esta acción es IRREVERSIBLE. El período no podrá reabrirse."
                          okType="danger"
                          okText="Bloquear"
                          onConfirm={() => bloquearPeriodo.mutate(periodo.id)}
                        >
                          <Button size="small" danger icon={<LockOutlined />} style={{ fontSize: 11 }}>
                            Bloquear
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {periodo?.estado === 'bloqueado' && (
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        <LockOutlined /> Permanente
                      </Text>
                    )}
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* Totales del año */}
      {resumen && (resumen.cerrados + resumen.bloqueados) > 0 && (
        <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }}>
          <Row gutter={24} align="middle">
            <Col>
              <Text type="secondary" style={{ fontSize: 12 }}>TOTALES DEL AÑO {anio}</Text>
            </Col>
            <Col>
              <Statistic
                title="Total Débitos"
                value={resumen.totalDebitos}
                formatter={v => fmt(Number(v))}
                valueStyle={{ fontSize: 18, color: '#1a56db' }}
              />
            </Col>
            <Col>
              <Statistic
                title="Total Créditos"
                value={resumen.totalCreditos}
                formatter={v => fmt(Number(v))}
                valueStyle={{ fontSize: 18, color: '#059669' }}
              />
            </Col>
            <Col>
              <Statistic
                title="Diferencia"
                value={Math.abs(resumen.totalDebitos - resumen.totalCreditos)}
                formatter={v => fmt(Number(v))}
                valueStyle={{
                  fontSize: 18,
                  color: Math.abs(resumen.totalDebitos - resumen.totalCreditos) < 0.01 ? '#059669' : '#ef4444',
                }}
              />
              {Math.abs(resumen.totalDebitos - resumen.totalCreditos) < 0.01 && (
                <Tag color="green" style={{ fontSize: 10 }}>Cuadrado</Tag>
              )}
            </Col>
          </Row>
        </Card>
      )}

      {/* Modal crear período */}
      <Modal
        title={<Space><CalendarOutlined />Crear Período Contable</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crearPeriodo.isPending}
        okText="Crear"
      >
        <Form
          form={formCrear}
          layout="vertical"
          initialValues={{ anio, mes: new Date().getMonth() + 1 }}
          onFinish={v => crearPeriodo.mutate(v)}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="anio" label="Año" rules={[{ required: true }]}>
                <Select>
                  {[anioActual + 1, anioActual, anioActual - 1, anioActual - 2].map(y => (
                    <Option key={y} value={y}>{y}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
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
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8 }}
          message="El período se creará en estado ABIERTO. Puedes registrar asientos contables mientras esté abierto."
        />
      </Modal>

      {/* Modal cerrar período */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#059669' }} />
            Cerrar Período — {modalCerrar?.nombre}
          </Space>
        }
        open={!!modalCerrar}
        onCancel={() => { setModalCerrar(null); formCerrar.resetFields(); }}
        onOk={() => formCerrar.submit()}
        confirmLoading={cerrarPeriodo.isPending}
        okText="Confirmar Cierre"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}
      >
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Al cerrar el período se calcularán los totales de débitos y créditos de los asientos contabilizados del mes."
          style={{ marginBottom: 16 }}
        />
        <Form
          form={formCerrar}
          layout="vertical"
          onFinish={v => cerrarPeriodo.mutate({ id: modalCerrar?.id, dto: v })}
        >
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
