import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import {
  Card, Row, Col, Statistic, Button, Table, Tag, Modal, Form,
  Input, Select, Space, Tabs, Progress, Typography, Tooltip,
  message, Divider, Rate,
} from 'antd';
import {
  SmileOutlined, PlusOutlined, LinkOutlined, FileExcelOutlined,
  BarChartOutlined, StarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

function NpsGauge({ score }: { score: number | null }) {
  if (score === null) return <Text type="secondary">Sin datos</Text>;
  const color = score >= 50 ? '#52c41a' : score >= 0 ? '#faad14' : '#ff4d4f';
  const label = score >= 50 ? 'Excelente' : score >= 0 ? 'Bueno' : 'Mejorar';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 42, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
      <Tag color={color === '#52c41a' ? 'green' : color === '#faad14' ? 'gold' : 'red'} style={{ marginTop: 4 }}>{label}</Tag>
    </div>
  );
}

export default function EncuestasPage() {
  const qc = useQueryClient();
  const [modalCrear, setModalCrear] = useState(false);
  const [modalMetricas, setModalMetricas] = useState<any>(null);
  const [formCrear] = Form.useForm();

  const { data: encuestas = [] } = useQuery<any[]>({
    queryKey: ['encuestas'],
    queryFn: () => api.get('/encuestas').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: metricas } = useQuery<any>({
    queryKey: ['encuesta-metricas', modalMetricas?.id],
    queryFn: () => api.get(`/encuestas/${modalMetricas.id}/metricas`).then((r: any) => r.data?.data ?? r.data),
    enabled: !!modalMetricas?.id,
  });

  const crearEncuesta = useMutation({
    mutationFn: (data: any) => api.post('/encuestas', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['encuestas'] });
      setModalCrear(false);
      formCrear.resetFields();
      message.success('Encuesta creada');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const activarToggle = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) =>
      api.patch(`/encuestas/${id}`, { activa }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['encuestas'] }),
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const linkEncuesta = (token: string) => {
    const url = `${window.location.origin}/encuesta/${token}`;
    navigator.clipboard.writeText(url);
    message.success('Link copiado al portapapeles');
  };

  const totalRespuestas = encuestas.reduce((s: number, e: any) => s + (e.respuestasCount ?? 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SmileOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Encuestas de Satisfacción</Title>
            <Text type="secondary">NPS · CSAT · Feedback de clientes en tiempo real</Text>
          </div>
        </div>
        <Button icon={<FileExcelOutlined />} onClick={() => {
          const filas = encuestas.map((e: any) => ({
            'Título':    e.titulo ?? '',
            'Tipo':      e.tipo ?? '',
            'Activa':    e.activa ? 'Sí' : 'No',
            'Respuestas':Number(e.totalRespuestas ?? 0),
            'NPS Score': e.npsScore ?? '—',
          }));
          exportarExcel(filas, 'Encuestas');
        }}>Excel</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
          Nueva Encuesta
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 12 }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Encuestas Activas</span>}
              value={encuestas.filter((e: any) => e.activa).length}
              prefix={<StarOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'linear-gradient(135deg,#0891b2,#06b6d4)', borderRadius: 12 }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Respuestas</span>}
              value={totalRespuestas}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', borderRadius: 12 }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Encuestas NPS</span>}
              value={encuestas.filter((e: any) => e.tipo === 'nps').length}
              prefix={<SmileOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {encuestas.map((enc: any) => (
          <Col xs={24} md={12} xl={8} key={enc.id}>
            <Card
              bordered={false}
              style={{ borderRadius: 12, border: enc.activa ? '2px solid #1a56db22' : undefined }}
              title={
                <Space>
                  <Tag color={enc.tipo === 'nps' ? 'blue' : enc.tipo === 'csat' ? 'green' : 'purple'}>
                    {enc.tipo.toUpperCase()}
                  </Tag>
                  <Text strong style={{ fontSize: 14 }}>{enc.titulo}</Text>
                </Space>
              }
              extra={
                <Tag color={enc.activa ? 'green' : 'default'}>
                  {enc.activa ? 'Activa' : 'Inactiva'}
                </Tag>
              }
              actions={[
                <Tooltip title="Ver métricas">
                  <BarChartOutlined onClick={() => setModalMetricas(enc)} />
                </Tooltip>,
                <Tooltip title="Copiar link">
                  <LinkOutlined onClick={() => linkEncuesta(enc.tokenPublico)} />
                </Tooltip>,
                <Tooltip title={enc.activa ? 'Desactivar' : 'Activar'}>
                  <SmileOutlined
                    style={{ color: enc.activa ? '#ff4d4f' : '#52c41a' }}
                    onClick={() => activarToggle.mutate({ id: enc.id, activa: !enc.activa })}
                  />
                </Tooltip>,
              ]}
            >
              {enc.descripcion && (
                <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12 }}>
                  {enc.descripcion}
                </Paragraph>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                Creada: {new Date(enc.createdAt).toLocaleDateString('es-DO')}
              </Text>
            </Card>
          </Col>
        ))}
        {encuestas.length === 0 && (
          <Col span={24}>
            <Card bordered={false} style={{ textAlign: 'center', padding: 48, borderRadius: 12 }}>
              <SmileOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <div><Text type="secondary">No hay encuestas. Crea la primera para empezar a medir la satisfacción.</Text></div>
            </Card>
          </Col>
        )}
      </Row>

      {/* Modal Crear Encuesta */}
      <Modal
        title="Nueva Encuesta"
        open={modalCrear}
        onCancel={() => setModalCrear(false)}
        onOk={() => formCrear.submit()}
        confirmLoading={crearEncuesta.isPending}
        okText="Crear"
        width={520}
      >
        <Form form={formCrear} layout="vertical" onFinish={v => crearEncuesta.mutate(v)}>
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}>
            <Input placeholder="Ej. ¿Recomendarías HiCloud a un amigo?" />
          </Form.Item>
          <Form.Item name="tipo" label="Tipo de Encuesta" initialValue="nps" rules={[{ required: true }]}>
            <Select>
              <Option value="nps">
                <Space>
                  <Tag color="blue">NPS</Tag>
                  Net Promoter Score (0-10) — ¿Recomendarías?
                </Space>
              </Option>
              <Option value="csat">
                <Space>
                  <Tag color="green">CSAT</Tag>
                  Satisfacción (1-5) — ¿Qué tan satisfecho estás?
                </Space>
              </Option>
              <Option value="custom">
                <Space>
                  <Tag color="purple">Custom</Tag>
                  Preguntas personalizadas
                </Space>
              </Option>
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción (opcional)">
            <Input.TextArea rows={3} placeholder="Contexto o instrucciones para el encuestado..." />
          </Form.Item>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Se generará un link público único para compartir con tus clientes por WhatsApp, email o redes sociales.
        </Text>
      </Modal>

      {/* Modal Métricas */}
      <Modal
        title={
          <Space>
            <BarChartOutlined />
            {modalMetricas?.titulo}
            <Tag color="blue">{modalMetricas?.tipo?.toUpperCase()}</Tag>
          </Space>
        }
        open={!!modalMetricas}
        onCancel={() => setModalMetricas(null)}
        footer={null}
        width={600}
      >
        {metricas && (
          <div>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={8}>
                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#1a56db' }}>{metricas.total}</div>
                  <Text type="secondary">Respuestas</Text>
                </Card>
              </Col>
              {metricas.npsScore !== undefined && metricas.npsScore !== null && (
                <>
                  <Col span={8}>
                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                      <NpsGauge score={metricas.npsScore} />
                      <Text type="secondary" style={{ fontSize: 11 }}>NPS Score</Text>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small" style={{ borderRadius: 8 }}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <Tag color="green">Promotores: {metricas.promotores}</Tag>
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        <Tag color="orange">Neutros: {metricas.neutros}</Tag>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <Tag color="red">Detractores: {metricas.detractores}</Tag>
                      </div>
                    </Card>
                  </Col>
                </>
              )}
              {metricas.csatPromedio !== undefined && (
                <Col span={16}>
                  <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                    <Rate disabled defaultValue={metricas.csatPromedio} allowHalf />
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#faad14' }}>{metricas.csatPromedio}/5</div>
                    <Text type="secondary">CSAT Promedio</Text>
                  </Card>
                </Col>
              )}
            </Row>
            {metricas.distribucion && Object.keys(metricas.distribucion).length > 0 && (
              <Card size="small" title="Distribución de Respuestas" style={{ borderRadius: 8 }}>
                {Object.entries(metricas.distribucion).map(([k, v]: any) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ width: 20, textAlign: 'right' }}>{k}</Text>
                    <Progress
                      percent={metricas.total > 0 ? Math.round((v / metricas.total) * 100) : 0}
                      size="small"
                      style={{ flex: 1 }}
                      format={() => v}
                    />
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
        {!metricas && <Text type="secondary">Cargando métricas...</Text>}
      </Modal>
    </div>
  );
}
