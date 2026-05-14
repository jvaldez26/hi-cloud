import { useState } from 'react';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic,
         Space, Popconfirm, message, Dropdown, Drawer, Descriptions,
         Modal, Input, Form, Tooltip } from 'antd';
import { PlusOutlined, EyeOutlined, MoreOutlined,
         MailOutlined, FileExcelOutlined, FilePdfOutlined, CopyOutlined,
         EditOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import api from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cotizacionesApi } from '../../api/cotizaciones.api';
import { fmt } from '../../utils/formatters';

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

  const duplicarMut = useMutation({
    mutationFn: (id: number) => cotizacionesApi.duplicar(id),
    onSuccess: (nueva: any) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      message.success(`Cotización duplicada → ${nueva?.numero ?? 'borrador'}`);
    },
    onError: () => message.error('Error al duplicar'),
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
    { title: 'Número',  dataIndex: 'numero',          width: '10%',
      render: (v: string) => <Text code style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{v}</Text> },
    { title: 'Fecha',   dataIndex: 'fecha',            width: '11%',
      render: (v: string) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt.date(v)}</span> },
    { title: 'Vence',   dataIndex: 'fechaVencimiento', width: '11%',
      render: (v: string) => <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#8c8c8c' }}>{fmt.date(v)}</span> },
    { title: 'Cliente', key: 'cli',
      render: (_: any, r: any) => (
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
          {r.cliente?.nombre ?? '—'}
        </div>
      )},
    { title: 'Total',   dataIndex: 'total',    width: '12%', align: 'right' as const,
      render: (v: number) => <strong style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt.money(v)}</strong> },
    { title: 'Estado',  dataIndex: 'estado',   width: '12%',
      render: (v: CotEstado) => (
        <Tag color={estadoColor[v]} style={{ whiteSpace: 'nowrap', margin: 0 }}>
          {estadoEmoji[v]} {v.toUpperCase()}
        </Tag>
      )},
    {
      title: '', key: 'actions', width: '7%',
      render: (_: any, r: any) => {
        const estado = r.estado as CotEstado;
        const sigs   = TRANSICIONES[estado];

        const menuItems: any[] = [
          ...(estado === 'borrador' ? [{
            key: 'editar',
            label: <><EditOutlined style={{ marginRight: 6 }} />Editar</>,
            onClick: () => navigate(`/cotizaciones/${r.id}/editar`),
          }] : []),
          {
            key: 'pdf',
            label: <><FilePdfOutlined style={{ marginRight: 6 }} />Descargar PDF</>,
            onClick: () => cotizacionesApi.pdf(r.id, r.numero)
              .catch((e: any) => message.error('Error al generar PDF: ' + e.message)),
          },
          {
            key: 'email',
            label: <><MailOutlined style={{ marginRight: 6 }} />Enviar por email</>,
            onClick: () => { setEmailCot(r); emailForm.setFieldsValue({ email: r.cliente?.email ?? '' }); },
          },
          {
            key: 'whatsapp',
            label: <>💬 Enviar por WhatsApp</>,
            onClick: () => {
              const texto = `Cotización ${r.numero} · Total: ${fmt.money(r.total)}`;
              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
            },
          },
          ...(sigs.length > 0 ? [
            { type: 'divider' as const },
            ...sigs.map(s => ({
              key: `estado-${s}`,
              label: s === 'enviada' ? '📤 Marcar enviada' : s === 'aceptada' ? '✅ Aceptar' : '❌ Rechazar',
              onClick: () => estadoMut.mutate({ id: r.id, estado: s }),
            })),
          ] : []),
          ...(estado === 'aceptada' ? [
            { type: 'divider' as const },
            {
              key: 'convertir',
              label: '🔄 Convertir a Factura',
              onClick: () => Modal.confirm({
                title: '¿Convertir a Factura?',
                content: 'Se creará una factura en estado BORRADOR con los mismos datos.',
                okText: 'Sí, convertir',
                onOk: () => convertirMut.mutate(r.id),
              }),
            },
          ] : []),
          { type: 'divider' as const },
          {
            key: 'duplicar',
            label: <><CopyOutlined style={{ marginRight: 6 }} />Duplicar</>,
            onClick: () => duplicarMut.mutate(r.id),
          },
          ...(estado === 'borrador' ? [{
            key: 'eliminar',
            label: '🗑️ Eliminar',
            danger: true,
            onClick: () => Modal.confirm({
              title: '¿Eliminar esta cotización?',
              okText: 'Eliminar',
              okType: 'danger',
              onOk: () => deleteMut.mutate(r.id),
            }),
          }] : []),
        ];

        return (
          <Space size={4}>
            <Tooltip title="Ver detalle">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => { setDetail(r); setDetailId(r.id); }}
              />
            </Tooltip>
            <Dropdown trigger={['click']} menu={{ items: menuItems }}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
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

      {/* KPI Stats */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max((Array.isArray(resumen) ? resumen : []).length, 5)}, minmax(100px, 1fr))`,
          minWidth: 500,
          gap: 1, background: '#E0E0E0',
          border: '1px solid #E0E0E0', borderRadius: 6, overflow: 'hidden',
        }}>
          {(Array.isArray(resumen) ? resumen : []).map((r: any) => (
            <div key={r.estado} style={{
              background: '#fff', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {r.cantidad ?? 0}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: kpiColors[r.estado as CotEstado] ?? '#616161', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {r.estado}
              </span>
              {r.montoTotal > 0 && (
                <span style={{ fontSize: 10, color: '#6B7280' }}>{fmt.money(r.montoTotal)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          tableLayout="fixed"
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
