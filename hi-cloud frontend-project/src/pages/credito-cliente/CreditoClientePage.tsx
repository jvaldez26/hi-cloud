import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Modal, Form, Input, Select,
  InputNumber, Space, Typography, Statistic, message, theme,
  Progress, Alert, Tag, Divider,
} from 'antd';
import {
  CreditCardOutlined, PlusOutlined, WarningOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

export default function CreditoClientePage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalVisible, setModalVisible] = useState(false);
  const [clienteSel, setClienteSel] = useState<any>(null);
  const [form] = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['credito-resumen'],
    queryFn: () => api.get('/credito-cliente/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: creditos = [], isLoading } = useQuery<any[]>({
    queryKey: ['creditos-clientes'],
    queryFn: () => api.get('/credito-cliente').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn: () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const setCredito = useMutation({
    mutationFn: ({ clienteId, dto }: { clienteId: number; dto: any }) =>
      api.post(`/credito-cliente/${clienteId}`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditos-clientes'] });
      qc.invalidateQueries({ queryKey: ['credito-resumen'] });
      setModalVisible(false);
      form.resetFields();
      message.success('Límite de crédito actualizado');
    },
  });

  const abrirConfiguracion = (credito?: any) => {
    if (credito) {
      setClienteSel(credito);
      form.setFieldsValue({ clienteId: credito.clienteId, limiteCredito: Number(credito.limiteCredito), diasPlazo: credito.diasPlazo, notas: credito.notas });
    } else {
      setClienteSel(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditCardOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Crédito al Cliente</Title>
            <Text type="secondary">Límites de crédito · Saldos en tiempo real · Alertas de exceso</Text>
          </div>
        </div>
        <Button icon={<FileExcelOutlined />} onClick={() => {
          const filas = creditos.map((c: any) => ({
            'Cliente':        c.cliente?.nombre ?? '',
            'RNC':            c.cliente?.rncReceptor ?? c.cliente?.rfc ?? '',
            'Límite':         Number(c.limiteCredito ?? 0),
            'Usado':          Number(c.creditoUsado ?? 0),
            'Disponible':     Number((c.limiteCredito ?? 0) - (c.creditoUsado ?? 0)),
            'Días Crédito':   c.diasCredito ?? 0,
            'Estado':         c.estado ?? (c.activo ? 'Activo' : 'Inactivo'),
          }));
          exportarExcel(filas, `Credito-Clientes-${dayjs().format('YYYY-MM-DD')}`);
        }}>Excel</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirConfiguracion()}>
          Configurar Crédito
        </Button>
      </div>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Límite</span>}
              value={resumen?.totalLimite ?? 0} formatter={v => fmt(Number(v))} valueStyle={{ color: '#fff', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Utilizado</span>}
              value={resumen?.totalUtilizado ?? 0} formatter={v => fmt(Number(v))} valueStyle={{ color: '#fff', fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>En Riesgo (≥90%)</span>}
              value={resumen?.enRiesgo ?? 0} prefix={<WarningOutlined />} valueStyle={{ color: '#fff', fontSize: 28 }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Excedidos</span>}
              value={resumen?.excedidos ?? 0} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#fff', fontSize: 28 }} />
          </Card>
        </Col>
      </Row>

      {resumen?.excedidos > 0 && (
        <Alert type="error" showIcon icon={<CloseCircleOutlined />}
          message={`${resumen.excedidos} cliente(s) han excedido su límite de crédito. Revisa antes de emitir nuevas facturas.`}
          style={{ marginBottom: 16, borderRadius: 8 }} />
      )}

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={creditos}
          rowKey="clienteId"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={[
            {
              title: 'Cliente', dataIndex: 'clienteNombre', key: 'c',
              render: v => <Text strong>{v}</Text>,
            },
            {
              title: 'Límite', dataIndex: 'limiteCredito', key: 'l', align: 'right',
              render: v => <Text strong>{fmt(v)}</Text>,
            },
            {
              title: 'Utilizado', dataIndex: 'saldoUtilizado', key: 'u', align: 'right',
              render: v => <Text style={{ color: Number(v) > 0 ? token.colorWarning : token.colorSuccess }}>{fmt(Number(v))}</Text>,
            },
            {
              title: 'Disponible', dataIndex: 'disponible', key: 'd', align: 'right',
              render: v => <Text style={{ color: Number(v) > 0 ? token.colorSuccess : token.colorError }}>{fmt(Number(v))}</Text>,
            },
            {
              title: 'Utilización', key: 'pct', width: 160,
              render: (_, r: any) => (
                <div>
                  <Progress
                    percent={Math.min(r.pctUtilizado, 100)}
                    size="small"
                    strokeColor={r.excedido ? token.colorError : r.enRiesgo ? token.colorWarning : token.colorSuccess}
                    format={() => `${r.pctUtilizado}%`}
                  />
                  {r.excedido && <Tag color="red" style={{ fontSize: 10 }}>Excedido</Tag>}
                  {r.enRiesgo && !r.excedido && <Tag color="orange" style={{ fontSize: 10 }}>En Riesgo</Tag>}
                </div>
              ),
            },
            { title: 'Días Plazo', dataIndex: 'diasPlazo', key: 'dp', align: 'center', render: v => <Tag>{v} días</Tag> },
            {
              title: '', key: 'acc',
              render: (_, r: any) => (
                <Button size="small" onClick={() => abrirConfiguracion(r)}>Editar</Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal */}
      <Modal
        title={<Space><CreditCardOutlined />Configurar Límite de Crédito</Space>}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={setCredito.isPending}
        okText="Guardar"
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical"
          initialValues={{ diasPlazo: 30 }}
          onFinish={v => setCredito.mutate({ clienteId: v.clienteId, dto: { limiteCredito: v.limiteCredito, diasPlazo: v.diasPlazo, notas: v.notas } })}>
          {!clienteSel && (
            <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente">
                {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
              </Select>
            </Form.Item>
          )}
          {clienteSel && (
            <div style={{ padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6, marginBottom: 16 }}>
              <Text strong>{clienteSel.clienteNombre}</Text>
              <div><Text type="secondary" style={{ fontSize: 11 }}>Saldo actual: {fmt(clienteSel.saldoUtilizado)}</Text></div>
            </div>
          )}
          <Form.Item name="limiteCredito" label="Límite de Crédito (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" size="large"
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          </Form.Item>
          <Form.Item name="diasPlazo" label="Días de Plazo">
            <Select>
              {[15, 30, 45, 60, 90].map(d => <Option key={d} value={d}>{d} días</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas internas">
            <Input.TextArea rows={2} placeholder="Condiciones especiales, historial..." />
          </Form.Item>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 11 }}>
          El saldo utilizado se calcula automáticamente desde las cuentas por cobrar pendientes del cliente.
        </Text>
      </Modal>
    </div>
  );
}
