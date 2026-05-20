import { useState } from 'react';
import { Button, Card, Descriptions, Table, Tag, Row, Col, Typography,
         Statistic, Space, Spin, Steps, message, Popconfirm, Modal, Input, Tooltip, theme } from 'antd';
import { ArrowLeftOutlined, SendOutlined, MailOutlined, WhatsAppOutlined, FilePdfOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import EcfSeccion from '../../components/ui/EcfSeccion';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../../api/facturas.api';
import api from '../../api/client';
import { fmt, estadoColor } from '../../utils/formatters';
import type { FacturaEstado } from '../../types';

const { Title, Text } = Typography;

const ESTADOS: FacturaEstado[] = ['borrador', 'emitida', 'pagada'];
const TRANSICIONES: Record<FacturaEstado, FacturaEstado[]> = {
  borrador: ['emitida', 'cancelada'],
  emitida:  ['pagada',  'cancelada'],
  pagada:   [],
  cancelada:[],
};

export default function FacturaDetailPage() {
  const { token } = theme.useToken();
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const { data: factura, isLoading } = useQuery({
    queryKey: ['factura', id],
    queryFn:  () => facturasApi.getOne(Number(id)),
    enabled:  !!id,
  });

  const estadoMut = useMutation({
    mutationFn: ({ estado }: { estado: FacturaEstado }) =>
      facturasApi.cambiarEstado(Number(id), estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['factura', id] });
      qc.invalidateQueries({ queryKey: ['facturas'] });
      qc.invalidateQueries({ queryKey: ['factura-ecf', Number(id)] });
      message.success('Estado actualizado');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const [emailOpen,    setEmailOpen]    = useState(false);
  const [emailDestino, setEmailDestino] = useState('');
  const [waOpen,       setWaOpen]       = useState(false);
  const [waTelefono,   setWaTelefono]   = useState('');

  const waMut = useMutation({
    mutationFn: () =>
      api.post(`/notificaciones/factura/${id}/whatsapp`, { telefono: waTelefono }).then(r => r.data?.data ?? r.data),
    onSuccess: () => { setWaOpen(false); message.success(`Factura enviada por WhatsApp a ${waTelefono}`); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al enviar WhatsApp'),
  });

  const emailMut = useMutation({
    mutationFn: () =>
      api.post(`/notificaciones/factura/${id}/enviar`, {
        email: emailDestino,
        asunto: `Su factura ${factura?.folio} — HiCloud ERP`,
      }).then(r => r.data?.data ?? r.data),
    onSuccess: () => {
      setEmailOpen(false);
      message.success(`Factura enviada a ${emailDestino}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al enviar email'),
  });

  // handleDescargarPDF removed — replaced by PrintButton component

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!factura)  return <Text type="danger">Factura no encontrada</Text>;

  const estado   = factura.estado as FacturaEstado;
  const pasoActual = estado === 'cancelada' ? -1 : ESTADOS.indexOf(estado);
  const siguientes = TRANSICIONES[estado];

  const detallesCols = [
    { title: '#',          key: 'idx',           width: 40, render: (_: any, __: any, i: number) => i + 1 },
    { title: 'Descripción',dataIndex: 'descripcion', ellipsis: true },
    { title: 'Cant.',      dataIndex: 'cantidad',    width: 70, render: (v: number) => fmt.number(v) },
    { title: 'Precio Unit.',dataIndex: 'precioUnitario', width: 120, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS %',    dataIndex: 'porcentajeIva',  width: 70, render: (v: number) => `${v}%` },
    { title: 'Subtotal',   dataIndex: 'subtotal',    width: 120, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',      dataIndex: 'importeIva',  width: 100, render: (v: number) => fmt.money(v) },
    { title: 'Total',      dataIndex: 'total',       width: 120,
      render: (v: number) => <strong>{fmt.money(v)}</strong> },
  ];

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/facturas')}>
              Volver
            </Button>
            <Title level={4} style={{ margin: 0 }}>Factura {factura.folio}</Title>
            <Tag color={estadoColor[estado]} style={{ fontSize: 13 }}>{estado.toUpperCase()}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            {/* ── Botón Descargar PDF (backend puppeteer) ── */}
            <Button
              type="primary"
              icon={<FilePdfOutlined />}
              style={{ background: '#1E40AF', border: 'none' }}
              onClick={() => {
                const empresaId = localStorage.getItem('empresaId');
                // Abrir en nueva pestaña — el browser descarga el PDF
                const url = `/api/v1/facturas/${id}/pdf`;
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                // Header via fetch para pasar auth
                fetch(url, { headers: { 'X-Empresa-ID': empresaId || '' } })
                  .then(r => r.blob())
                  .then(blob => {
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `${(factura as any).folio}.pdf`;
                    link.click();
                    URL.revokeObjectURL(link.href);
                  })
                  .catch(() => message.error('Error al generar PDF'));
              }}
            >
              Descargar PDF
            </Button>

            {/* ── Botón Vista Previa HTML ── */}
            <Button
              icon={<EyeOutlined />}
              onClick={() => {
                const empresaId = localStorage.getItem('empresaId');
                fetch(`/api/v1/facturas/${id}/preview`, {
                  headers: { 'X-Empresa-ID': empresaId || '' }
                })
                  .then(r => r.text())
                  .then(html => {
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const win = window.open(url, '_blank');
                    win?.addEventListener('load', () => URL.revokeObjectURL(url));
                  })
                  .catch(() => message.error('Error al cargar preview'));
              }}
            >
              Vista Previa
            </Button>
            <Button
              icon={<MailOutlined />}
              onClick={() => {
                setEmailDestino((factura as any).cliente?.email ?? '');
                setEmailOpen(true);
              }}
            >
              Email
            </Button>
            <Button
              icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
              onClick={() => {
                setWaTelefono((factura as any).cliente?.telefono ?? '');
                setWaOpen(true);
              }}
            >
              WhatsApp
            </Button>
            {siguientes.map(sig => (
              <Popconfirm key={sig}
                title={`¿Cambiar estado a "${sig.toUpperCase()}"?`}
                onConfirm={() => estadoMut.mutate({ estado: sig })}>
                <Button
                  type={sig === 'cancelada' ? 'default' : 'primary'}
                  danger={sig === 'cancelada'}
                  loading={estadoMut.isPending}
                  icon={sig === 'emitida' ? <SendOutlined /> : undefined}>
                  {sig === 'emitida' ? 'Emitir factura' : sig === 'pagada' ? '✓ Marcar pagada' : '✗ Cancelar'}
                </Button>
              </Popconfirm>
            ))}
          </Space>
        </Col>
      </Row>

      {/* Timeline de estados */}
      {estado !== 'cancelada' ? (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Steps current={pasoActual} size="small"
            items={[
              { title: 'Borrador',  description: 'En preparación' },
              { title: 'Emitida',   description: 'Enviada al cliente' },
              { title: 'Pagada',    description: 'Cobro completado' },
            ]} />
        </Card>
      ) : (
        <Card size="small" style={{ marginBottom: 16, background: token.colorErrorBg, borderColor: token.colorErrorBorder }}>
          <Text type="danger">✗ Esta factura fue cancelada</Text>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {/* Datos principales */}
        <Col xs={24} lg={16}>
          <Card title="Datos de la factura" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 0]}>
              <Col xs={24} sm={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Folio"><Text strong>{factura.folio}</Text></Descriptions.Item>
                  <Descriptions.Item label="Fecha">{fmt.date(factura.fecha)}</Descriptions.Item>
                  <Descriptions.Item label="Estado">
                    <Tag color={estadoColor[estado]}>{estado.toUpperCase()}</Tag>
                  </Descriptions.Item>
                  {(factura as any).tipoNcf && (
                    <Descriptions.Item label="Tipo e-CF">
                      <Tag style={{ fontFamily: 'monospace' }}>{(factura as any).tipoNcf}</Tag>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Col>
              <Col xs={24} sm={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Cliente">{factura.cliente?.nombre}</Descriptions.Item>
                  <Descriptions.Item label="RFC/RNC">{factura.cliente?.rfc}</Descriptions.Item>
                  <Descriptions.Item label="Email">{factura.cliente?.email ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Teléfono">{factura.cliente?.telefono ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          </Card>

          {/* ── Sección e-CF ───────────────────────────────────────────────── */}
          <EcfSeccion facturaId={factura.id} queryKeyBase="facturas" />

          {/* Líneas de detalle */}
          <Card title="Detalle de productos / servicios">
            <Table
              columns={detallesCols}
              dataSource={(factura as any).detalles ?? []}
              rowKey="id"
              size="small"
        scroll={{ x: 'max-content' }}
              pagination={false}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={5} align="right"><Text strong>Totales:</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}><Text strong>{fmt.money(factura.subtotal)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={2}><Text strong>{fmt.money(factura.iva)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={3}><Text strong style={{ color: '#1677ff' }}>{fmt.money(factura.total)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )} />
          </Card>
        </Col>

        {/* Resumen financiero */}
        <Col xs={24} lg={8}>
          <Card title="Resumen financiero" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Statistic title="Subtotal (sin ITBIS)" value={factura.subtotal} formatter={v => fmt.money(Number(v))} />
              <Statistic title="ITBIS" value={factura.iva} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#fa8c16' }} />
              <Statistic title="TOTAL A PAGAR" value={factura.total}
                formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: '#1677ff', fontSize: 22 }} />
            </Space>
          </Card>

          {factura.notas && (
            <Card title="Notas" size="small">
              <Text>{factura.notas}</Text>
            </Card>
          )}
        </Col>
      </Row>

      {/* Modal enviar por email */}
      <Modal
        title={<><MailOutlined style={{ marginRight: 8 }} />Enviar factura por email</>}
        open={emailOpen}
        onCancel={() => setEmailOpen(false)}
        footer={null}
        width={420}
      >
        <p>Se enviará la factura <strong>{factura.folio}</strong> al correo electrónico indicado.</p>
        <Input
          prefix={<MailOutlined />}
          placeholder="destinatario@email.com"
          value={emailDestino}
          onChange={e => setEmailDestino(e.target.value)}
          size="large"
          style={{ marginBottom: 16 }}
          type="email"
        />
        <Row justify="end" gutter={8}>
          <Col><Button onClick={() => setEmailOpen(false)}>Cancelar</Button></Col>
          <Col>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={emailMut.isPending}
              disabled={!emailDestino.includes('@')}
              onClick={() => emailMut.mutate()}
            >
              Enviar ahora
            </Button>
          </Col>
        </Row>
      </Modal>

      {/* Modal WhatsApp */}
      <Modal
        title={<><WhatsAppOutlined style={{ color: '#25D366', marginRight: 8 }} />Enviar por WhatsApp</>}
        open={waOpen}
        onCancel={() => setWaOpen(false)}
        footer={null}
        width={420}
      >
        <p>Se enviará el resumen de <strong>{factura.folio}</strong> al número de WhatsApp indicado.</p>
        <Input
          placeholder="+1 829-555-0000"
          value={waTelefono}
          onChange={e => setWaTelefono(e.target.value)}
          size="large"
          style={{ marginBottom: 16 }}
        />
        <Row justify="end" gutter={8}>
          <Col><Button onClick={() => setWaOpen(false)}>Cancelar</Button></Col>
          <Col>
            <Button
              style={{ background: '#25D366', border: 'none', color: '#fff' }}
              icon={<WhatsAppOutlined />}
              loading={waMut.isPending}
              disabled={waTelefono.length < 8}
              onClick={() => waMut.mutate()}
            >
              Enviar WhatsApp
            </Button>
          </Col>
        </Row>
      </Modal>
    </div>
  );
}
