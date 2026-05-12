import { useState } from 'react';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic,
         Space, Popconfirm, message, Dropdown, Drawer, Descriptions,
         Modal, Input, Form, Tooltip } from 'antd';
import { PlusOutlined, EyeOutlined, DownOutlined,
         SwapOutlined, WarningOutlined, MailOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import api from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cotizacionesApi } from '../../api/cotizaciones.api';
import { fmt } from '../../utils/formatters';
import WhatsAppButton from '../../components/ui/WhatsAppButton';

const { Title, Text } = Typography;

type CotEstado = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida' | 'convertida';

const estadoColor: Record<CotEstado, string> = {
  borrador:   'default',
  enviada:    'blue',
  aceptada:   'green',
  rechazada:  'red',
  vencida:    'orange',
  convertida: 'cyan',
};

const estadoEmoji: Record<CotEstado, string> = {
  borrador:   '📝', enviada:    '📤', aceptada:  '✅',
  rechazada:  '❌', vencida:    '⏰', convertida: '🔄',
};

const TRANSICIONES: Record<CotEstado, string[]> = {
  borrador:   ['enviada', 'rechazada'],
  enviada:    ['aceptada', 'rechazada'],
  aceptada:   [],
  rechazada:  [],
  vencida:    [],
  convertida: [],
};

export default function CotizacionesPage() {
  const [page,        setPage]        = useState(1);
  const [detail,      setDetail]      = useState<any>(null);
  const [detailId,    setDetailId]    = useState<number | null>(null);
  const [emailCot,    setEmailCot]    = useState<any>(null);
  const [emailForm]                   = Form.useForm();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Carga el detalle completo (con detalles/productos) al abrir el drawer
  const { data: detailFull, isLoading: loadingDetail } = useQuery({
    queryKey: ['cotizacion-detail', detailId],
    queryFn:  () => cotizacionesApi.getOne(detailId!),
    enabled:  detailId !== null,
  });

  // Sincronizar: cuando llegan los datos completos, actualizar el drawer
  const drawerData = detailId !== null ? (detailFull ?? detail) : null;

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/cotizacion/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, vars) => {
      setEmailCot(null); emailForm.resetFields();
      message.success(`Cotización enviada a ${vars.email}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al enviar email'),
  });

  const { data, isLoading } = useQuery({
    queryKey:       ['cotizaciones', page],
    queryFn:        () => cotizacionesApi.list(page, 10),
    refetchOnMount: 'always',  // override global false — garantiza datos frescos al volver del form
  });

  const { data: resumen } = useQuery({
    queryKey: ['cotizaciones-resumen'],
    queryFn:  cotizacionesApi.resumen,
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      cotizacionesApi.cambiarEstado(id, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      qc.invalidateQueries({ queryKey: ['cotizaciones-resumen'] });
      message.success('Estado actualizado');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const convertirMut = useMutation({
    mutationFn: cotizacionesApi.convertir,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      message.success(`Cotización convertida a Factura ${data?.factura?.folio ?? ''}`);
      navigate('/facturas');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: cotizacionesApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); message.success('Eliminada'); },
  });

  const kpiColors: Record<string, string> = {
    borrador: '#6b7280', enviada: '#1d4ed8', aceptada: '#059669',
    rechazada: '#dc2626', vencida: '#d97706', convertida: '#0891b2',
  };

  const cols = [
    { title: 'Número',  dataIndex: 'numero',          width: 170,
      render: (v: string) => <Text code>{v}</Text> },
    { title: 'Fecha',   dataIndex: 'fecha',            width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Vence',   dataIndex: 'fechaVencimiento', width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Cliente', key: 'cli',                    ellipsis: true,
      render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Total',   dataIndex: 'total',             width: 130,
      render: (v: number) => <strong>{fmt.money(v)}</strong> },
    { title: 'Estado',  dataIndex: 'estado',            width: 120,
      render: (v: CotEstado) => (
        <Tag color={estadoColor[v]}>
          {estadoEmoji[v]} {v.toUpperCase()}
        </Tag>
      )},
    {
      title: '', key: 'actions', width: 160,
      render: (_: any, r: any) => {
        const estado = r.estado as CotEstado;
        const sigs   = TRANSICIONES[estado];
        return (
          <Space size={4}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => { setDetail(r); setDetailId(r.id); }}>Ver</Button>
            <Tooltip title="Descargar PDF">
              <Button size="small" icon={<FilePdfOutlined />}
                onClick={() => cotizacionesApi.pdf(r.id, r.numero).catch((e: any) => message.error('Error al generar PDF: ' + e.message))}
              />
            </Tooltip>
            <Tooltip title="Enviar por email">
              <Button size="small" type="text" icon={<MailOutlined />}
                onClick={() => {
                  setEmailCot(r);
                  emailForm.setFieldsValue({ email: r.cliente?.email ?? '' });
                }}
              />
            </Tooltip>
            <WhatsAppButton tipo="cotizacion" id={r.id} size="small" onlyIcon />

            {sigs.length > 0 && (
              <Dropdown trigger={['click']} menu={{
                items: sigs.map(s => ({
                  key: s,
                  label: s === 'enviada' ? '📤 Enviar' : s === 'aceptada' ? '✅ Aceptar' : '❌ Rechazar',
                  onClick: () => estadoMut.mutate({ id: r.id, estado: s }),
                })),
              }}>
                <Button size="small" icon={<DownOutlined />} />
              </Dropdown>
            )}

            {estado === 'aceptada' && (
              <Popconfirm
                title="¿Convertir a Factura?"
                description="Se creará una factura en estado BORRADOR con los mismos datos."
                onConfirm={() => convertirMut.mutate(r.id)}
                okText="Sí, convertir"
              >
                <Button size="small" type="primary" icon={<SwapOutlined />}
                  loading={convertirMut.isPending}>
                  → Factura
                </Button>
              </Popconfirm>
            )}

            {estado === 'borrador' && (
              <Popconfirm title="¿Eliminar?" onConfirm={() => deleteMut.mutate(r.id)}>
                <Button size="small" danger>✕</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Cotizaciones</Title></Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (data?.data ?? []).map((c: any) => ({
                'Número':  c.numero ?? '',
                'Fecha':   c.fecha ? new Date(c.fecha).toLocaleDateString('es-DO') : '',
                'Cliente': c.cliente?.nombre ?? '',
                'Total':   Number(c.total ?? 0),
                'Estado':  c.estado ?? '',
                'Vence':   c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString('es-DO') : '',
              }));
              exportarExcel(filas, `Cotizaciones-${new Date().toISOString().split('T')[0]}`);
              message.success(`${filas.length} cotizaciones exportadas`);
            }}>
              Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/cotizaciones/nueva')}>
              Nueva cotización
            </Button>
          </Space>
        </Col>
      </Row>

      {/* KPI cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(Array.isArray(resumen) ? resumen : []).map((r: any, i: number) => (
          <Col xs={12} sm={8} md={4} key={r.estado}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -2 }}
            >
              <Card size="small">
                <Statistic
                  title={<><span style={{ marginRight: 4 }}>{estadoEmoji[r.estado as CotEstado]}</span>{r.estado.toUpperCase()}</>}
                  value={r.cantidad}
                  suffix={<Text type="secondary" style={{ fontSize: 11 }}>  {fmt.money(r.montoTotal)}</Text>}
                  valueStyle={{ color: kpiColors[r.estado], fontSize: 20 }}
                />
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      <Card>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          rowClassName={(r: any) => r.estado === 'vencida' ? 'ant-table-row-warn' : ''}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showTotal: t => `${t} cotizaciones`, showSizeChanger: false }} />
      </Card>

      {/* Drawer de detalle */}
      <Drawer
        title={`Cotización ${detail?.numero}`}
        open={!!detail}
        onClose={() => { setDetail(null); setDetailId(null); }}
        width={700}
        loading={loadingDetail}
      >
        {drawerData && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Número">{drawerData.numero}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={estadoColor[drawerData.estado as CotEstado]}>
                  {estadoEmoji[drawerData.estado as CotEstado]} {drawerData.estado.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Cliente">{drawerData.cliente?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Fecha">{fmt.date(drawerData.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Vence">{fmt.date(drawerData.fechaVencimiento)}</Descriptions.Item>
              <Descriptions.Item label="Validez">{drawerData.validezDias} días</Descriptions.Item>
              {drawerData.condicionesPago && (
                <Descriptions.Item label="Condiciones" span={2}>{drawerData.condicionesPago}</Descriptions.Item>
              )}
              {drawerData.notas && (
                <Descriptions.Item label="Notas" span={2}>{drawerData.notas}</Descriptions.Item>
              )}
            </Descriptions>

            <Table size="small" pagination={false}
              dataSource={drawerData.detalles ?? []} rowKey="id"
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3} align="right"><Text strong>Subtotal:</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}><Text strong>{fmt.money(drawerData.subtotal)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3} align="right"><Text strong>ITBIS:</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}><Text strong>{fmt.money(drawerData.iva)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3} align="right"><Text strong style={{ fontSize: 15 }}>TOTAL:</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}><Text strong style={{ color: '#1677ff', fontSize: 15 }}>{fmt.money(drawerData.total)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
                { title: 'Cant.',  dataIndex: 'cantidad',       width: 60 },
                { title: 'Precio', dataIndex: 'precioUnitario', width: 110, render: (v: number) => fmt.money(v) },
                { title: 'Total',  dataIndex: 'total',          width: 110, render: (v: number) => fmt.money(v) },
              ]} />

            {drawerData.estado === 'convertida' && drawerData.factura && (
              <Card size="small" style={{ marginTop: 16, background: '#f0fdf4', borderColor: '#86efac' }}>
                <Text>✅ Convertida a <Text strong>{drawerData.factura.folio}</Text></Text>
                <Button type="link" size="small" onClick={() => { setDetail(null); setDetailId(null); navigate(`/facturas/${drawerData.facturaId}`); }}>
                  Ver factura →
                </Button>
              </Card>
            )}
          </>
        )}
      </Drawer>

      {/* Modal envío por email */}
      <Modal
        title={<><MailOutlined style={{ color: '#1677ff', marginRight: 8 }} />Enviar cotización por email</>}
        open={!!emailCot}
        onCancel={() => { setEmailCot(null); emailForm.resetFields(); }}
        footer={null}
        destroyOnClose
        width={420}
      >
        {emailCot && (
          <>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
              Cotización <strong>{emailCot.numero}</strong> · Cliente: <strong>{emailCot.cliente?.nombre}</strong>
            </p>
            <Form form={emailForm} layout="vertical"
              onFinish={v => emailMut.mutate({ id: emailCot.id, email: v.email })}>
              <Form.Item name="email" label="Correo del destinatario"
                rules={[{ required: true }, { type: 'email', message: 'Ingresa un email válido' }]}>
                <Input prefix={<MailOutlined />} placeholder="cliente@empresa.com" size="large" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={emailMut.isPending} block icon={<MailOutlined />}>
                Enviar cotización
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}
