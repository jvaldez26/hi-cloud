import { useState, useRef } from 'react';
import {
  Card, Row, Col, Typography, Tag, Progress, Statistic, Table,
  Button, Modal, Form, InputNumber, Input, Space, message,
  Descriptions, Alert, Upload, Divider, Tabs, Badge, Tooltip,
} from 'antd';
import {
  CreditCardOutlined, BankOutlined, HistoryOutlined,
  UploadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, DollarOutlined, ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { pagosApi, PagoSuscripcion } from '../../api/pagos.api';
import { fmtDop } from '../../utils/fmt';

const { Title, Text } = Typography;

const PLAN_COLOR: Record<string, string> = {
  emprendedor: 'blue', pyme: 'green', pro: 'purple', plus: 'gold',
  trial: 'orange', activa: 'green', suspendida: 'red', vencida: 'red', prueba: 'cyan',
};

const TIPO_LABEL: Record<string, string> = {
  TARJETA: '💳 Tarjeta', TRANSFERENCIA: '🏦 Transferencia',
  MANUAL: '📋 Manual', CREDITO: '✅ Crédito', CARGO: '📌 Cargo',
};

const ESTADO_COLOR: Record<string, string> = {
  PENDIENTE: 'orange', CONFIRMADO: 'green', RECHAZADO: 'red',
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-DO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function MiSuscripcionPage() {
  const qc = useQueryClient();
  const [showComprobante, setShowComprobante] = useState(false);
  const [comprobanteForm] = Form.useForm();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: resumen, isLoading: loadingResumen } = useQuery({
    queryKey: ['mi-suscripcion-resumen'],
    queryFn:  pagosApi.resumen,
  });

  const { data: historial = [], isLoading: loadingHist } = useQuery({
    queryKey: ['mi-suscripcion-historial'],
    queryFn:  pagosApi.historial,
  });

  const { data: datosBancarios } = useQuery({
    queryKey: ['config-bancaria-cliente'],
    queryFn:  pagosApi.configuracionBancaria,
  });

  const subirMut = useMutation({
    mutationFn: (vals: any) =>
      pagosApi.subirComprobante(
        selectedFile!,
        vals.monto,
        vals.referencia,
        vals.banco,
        vals.notas,
      ),
    onSuccess: () => {
      message.success('Comprobante enviado. El equipo de HiCloud lo revisará pronto.');
      qc.invalidateQueries({ queryKey: ['mi-suscripcion-historial'] });
      qc.invalidateQueries({ queryKey: ['mi-suscripcion-resumen'] });
      setShowComprobante(false);
      comprobanteForm.resetFields();
      setSelectedFile(null);
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? 'Error al subir el comprobante'),
  });

  const histCols = [
    {
      title: 'Fecha',
      dataIndex: 'creadoEn',
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Descripción',
      dataIndex: 'concepto',
      ellipsis: true,
    },
    {
      title: 'Tipo',
      dataIndex: 'tipo',
      width: 140,
      render: (v: string) => TIPO_LABEL[v] ?? v,
    },
    {
      title: 'Monto',
      dataIndex: 'monto',
      width: 110,
      align: 'right' as const,
      render: (v: number | string, r: PagoSuscripcion) => {
        const monto  = Number(v ?? 0);
        const esCargo = r.tipo === 'CARGO';
        return (
          <Text style={{ color: esCargo ? '#ef4444' : '#10b981', fontWeight: 600 }}>
            {esCargo ? '+' : '−'}{fmtDop(monto)}
          </Text>
        );
      },
    },
    {
      title: 'Estado',
      dataIndex: 'estado',
      width: 120,
      render: (v: string, r: PagoSuscripcion) => (
        <Space direction="vertical" size={0}>
          <Tag color={ESTADO_COLOR[v]}>{v}</Tag>
          {r.motivoRechazo && (
            <Tooltip title={r.motivoRechazo}>
              <Text type="danger" style={{ fontSize: 11 }}>Ver motivo</Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '',
      key: 'ref',
      width: 80,
      render: (_: any, r: PagoSuscripcion) =>
        r.comprobanteUrl ? (
          <Button
            size="small" type="link"
            href={r.comprobanteUrl} target="_blank"
          >
            Ver
          </Button>
        ) : null,
    },
  ];

  const saldo = resumen?.saldo ?? 0;

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          💳 Mi Suscripción y Pagos
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Gestiona tu plan, realiza pagos y consulta tu historial de cobros
        </Text>

        <Tabs
          defaultActiveKey="resumen"
          items={[
            {
              key: 'resumen',
              label: '📊 Resumen',
              children: (
                <Row gutter={[16, 16]}>
                  {/* Card plan actual */}
                  <Col xs={24} md={14}>
                    <Card loading={loadingResumen} title="Plan actual">
                      {resumen && (
                        <>
                          <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
                            <Col>
                              <Tag
                                color={PLAN_COLOR[resumen.plan ?? ''] ?? 'blue'}
                                style={{ fontSize: 16, padding: '4px 16px', borderRadius: 8 }}
                              >
                                {(resumen.plan ?? '').charAt(0).toUpperCase() + (resumen.plan ?? '').slice(1)}
                              </Tag>
                            </Col>
                            <Col>
                              <Tag color={PLAN_COLOR[resumen.estado ?? ''] ?? 'default'}>
                                {(resumen.estado ?? '').toUpperCase()}
                              </Tag>
                            </Col>
                          </Row>

                          <Row gutter={16}>
                            <Col xs={12}>
                              <Statistic
                                title="Precio mensual"
                                value={resumen.precioMensual}
                                prefix="RD$"
                                precision={2}
                                valueStyle={{ color: '#1677ff' }}
                              />
                            </Col>
                            <Col xs={12}>
                              <Statistic
                                title="Días restantes"
                                value={resumen.diasRestantes}
                                suffix="días"
                                valueStyle={{
                                  color: resumen.diasRestantes <= 3
                                    ? '#ef4444'
                                    : resumen.diasRestantes <= 7
                                    ? '#f59e0b' : '#10b981',
                                }}
                              />
                            </Col>
                          </Row>

                          <div style={{ marginTop: 16 }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              marginBottom: 4, fontSize: 12, color: '#6b7280',
                            }}>
                              <span>Período de facturación</span>
                              <span>Vence: {fmtDate(resumen.fechaVencimiento)}</span>
                            </div>
                            <Progress
                              percent={resumen.porcentajeUsado}
                              strokeColor={
                                resumen.porcentajeUsado >= 90 ? '#ef4444'
                                : resumen.porcentajeUsado >= 70 ? '#f59e0b'
                                : '#10b981'
                              }
                              trailColor="#f0f0f0"
                              format={pct => `${100 - (pct ?? 0)}% restante`}
                            />
                          </div>

                          {resumen.diasRestantes <= 7 && resumen.estado === 'activa' && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginTop: 16 }}
                              message={`Tu suscripción vence en ${resumen.diasRestantes} ${resumen.diasRestantes === 1 ? 'día' : 'días'}. Realiza tu pago para evitar interrupciones.`}
                            />
                          )}
                        </>
                      )}
                    </Card>
                  </Col>

                  {/* Saldo */}
                  <Col xs={24} md={10}>
                    <Card title="Balance">
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                          {saldo > 0 ? 'Saldo pendiente' : saldo < 0 ? 'Crédito disponible' : 'Balance'}
                        </div>
                        <div style={{
                          fontSize: 36, fontWeight: 700,
                          color: saldo > 0 ? '#ef4444' : '#10b981',
                        }}>
                          {fmtDop(Math.abs(saldo))}
                        </div>
                        {saldo > 0 ? (
                          <Tag color="red" style={{ marginTop: 8 }}>⚠️ Tienes saldo pendiente</Tag>
                        ) : saldo < 0 ? (
                          <Tag color="green" style={{ marginTop: 8 }}>💳 Crédito disponible: {fmtDop(Math.abs(saldo))}</Tag>
                        ) : (
                          <Tag color="green" style={{ marginTop: 8 }}>✅ Al día</Tag>
                        )}
                      </div>

                      {saldo > 0 && (
                        <Button
                          type="primary"
                          block
                          icon={<BankOutlined />}
                          style={{ marginTop: 8 }}
                          onClick={() => setShowComprobante(true)}
                        >
                          Pagar ahora
                        </Button>
                      )}
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'pagar',
              label: (
                <Badge dot={saldo > 0} offset={[4, 0]}>
                  <span>💸 Realizar pago</span>
                </Badge>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  {/* Transferencia bancaria */}
                  <Col xs={24}>
                    <Card
                      title={<><BankOutlined /> Transferencia bancaria</>}
                      extra={
                        <Button
                          type="primary"
                          icon={<UploadOutlined />}
                          onClick={() => setShowComprobante(true)}
                        >
                          Subir comprobante
                        </Button>
                      }
                    >
                      {datosBancarios ? (
                        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                          <Descriptions.Item label="Banco">{datosBancarios.banco}</Descriptions.Item>
                          <Descriptions.Item label="Tipo de cuenta">
                            {datosBancarios.tipoCuenta
                              ? datosBancarios.tipoCuenta.charAt(0).toUpperCase() + datosBancarios.tipoCuenta.slice(1)
                              : '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Número de cuenta">
                            <Text copyable strong>{datosBancarios.numeroCuenta}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Titular">
                            {datosBancarios.titular}
                          </Descriptions.Item>
                          {datosBancarios.rnc && (
                            <Descriptions.Item label="RNC">
                              <Text copyable>{datosBancarios.rnc}</Text>
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      ) : (
                        <Text type="secondary">
                          Datos bancarios no configurados aún. Contacta a soporte@hicloudrd.com
                        </Text>
                      )}

                      <Alert
                        type="info"
                        showIcon
                        icon={<InfoCircleOutlined />}
                        style={{ marginTop: 16 }}
                        message="Proceso de pago por transferencia"
                        description="1. Realiza la transferencia con el concepto 'HiCloud ERP – [tu empresa]'. 2. Sube la imagen o PDF del comprobante aquí. 3. El equipo HiCloud confirmará tu pago en menos de 24 horas hábiles."
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'historial',
              label: <><HistoryOutlined /> Historial</>,
              children: (
                <Card title="Historial de pagos y cargos">
                  <Table
                    columns={histCols}
                    dataSource={historial}
                    rowKey="id"
                    loading={loadingHist}
                    size="small"
                    pagination={{ pageSize: 15, showSizeChanger: false }}
                    scroll={{ x: 'max-content' }}
                    summary={data => {
                      const pendiente = data.reduce((acc, mov) => {
                        const monto = Number(mov.monto ?? 0);
                        if (mov.tipo === 'CARGO') return acc + monto;
                        if (['TRANSFERENCIA','MANUAL','TARJETA','CREDITO'].includes(mov.tipo) && mov.estado === 'CONFIRMADO')
                          return acc - monto;
                        return acc;
                      }, 0);
                      return (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={3}>
                            <Text strong>
                              {pendiente > 0 ? 'Saldo pendiente' : pendiente < 0 ? 'Crédito disponible' : 'Al día ✓'}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="right">
                            <Text strong style={{ color: pendiente > 0 ? '#ef4444' : '#10b981' }}>
                              {fmtDop(Math.abs(pendiente))}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={4} colSpan={2} />
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </motion.div>

      {/* Modal subir comprobante */}
      <Modal
        title="📎 Subir comprobante de transferencia"
        open={showComprobante}
        onCancel={() => { setShowComprobante(false); setSelectedFile(null); comprobanteForm.resetFields(); }}
        footer={null}
        width={480}
      >
        <Form form={comprobanteForm} layout="vertical"
          onFinish={vals => {
            if (!selectedFile) {
              message.warning('Selecciona el archivo del comprobante');
              return;
            }
            subirMut.mutate(vals);
          }}
        >
          {/* File picker */}
          <Form.Item label="Comprobante (imagen o PDF)" required>
            <div
              style={{
                border: '2px dashed #d9d9d9',
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                cursor: 'pointer',
                background: selectedFile ? '#f6ffed' : '#fafafa',
                borderColor: selectedFile ? '#52c41a' : '#d9d9d9',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setSelectedFile(f);
                }}
              />
              {selectedFile ? (
                <Space direction="vertical" size={4}>
                  <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                  <Text strong style={{ color: '#52c41a' }}>{selectedFile.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {(selectedFile.size / 1024).toFixed(0)} KB — Clic para cambiar
                  </Text>
                </Space>
              ) : (
                <Space direction="vertical" size={4}>
                  <UploadOutlined style={{ fontSize: 28, color: '#bfbfbf' }} />
                  <Text>Arrastra tu comprobante aquí o haz clic</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>JPG, PNG, WEBP o PDF · Máx. 5 MB</Text>
                </Space>
              )}
            </div>
          </Form.Item>

          <Form.Item
            name="monto"
            label="Monto transferido (RD$)"
            rules={[{ required: true, message: 'Ingresa el monto' }]}
            initialValue={resumen?.precioMensual}
          >
            <InputNumber
              prefix="RD$"
              min={1}
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item name="referencia" label="Número de referencia / confirmación">
            <Input placeholder="Ej. 123456789" />
          </Form.Item>

          <Form.Item name="banco" label="Banco origen">
            <Input placeholder="Ej. BHD León" />
          </Form.Item>

          <Form.Item name="notas" label="Notas adicionales">
            <Input.TextArea rows={2} placeholder="Información adicional..." />
          </Form.Item>

          <Row justify="end" gutter={8}>
            <Col>
              <Button onClick={() => setShowComprobante(false)}>Cancelar</Button>
            </Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                loading={subirMut.isPending}
                icon={<UploadOutlined />}
              >
                Enviar comprobante
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
