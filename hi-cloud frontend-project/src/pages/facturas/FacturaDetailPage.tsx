import { useState, useRef } from 'react';
import { Button, Card, Descriptions, Table, Tag, Row, Col, Typography,
         Statistic, Space, Spin, Steps, message, Popconfirm, Modal, Input, Tooltip, theme, Upload } from 'antd';
import { ArrowLeftOutlined, SendOutlined, MailOutlined, FilePdfOutlined, EyeOutlined,
         PaperClipOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import EcfSeccion from '../../components/ui/EcfSeccion';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facturasApi } from '../../api/facturas.api';
import api from '../../api/client';
import { fmt, estadoColor } from '../../utils/formatters';
import { resolverNombreComprador, resolverRncComprador } from '../../utils/facturaComprador';
import type { FacturaEstado } from '../../types';

const { Title, Text } = Typography;

const ESTADOS: FacturaEstado[] = ['borrador', 'emitida', 'pagada'];
const TRANSICIONES: Record<FacturaEstado, FacturaEstado[]> = {
  borrador: ['emitida'],
  emitida:  ['pagada'],
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
  const [uploadingOC,  setUploadingOC]  = useState(false);
  const ocInputRef = useRef<HTMLInputElement>(null);

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

  const handleUploadOC = async (file: File) => {
    setUploadingOC(true);
    try {
      await facturasApi.uploadOrdenCompra(Number(id), file);
      message.success('Orden de Compra adjuntada correctamente');
      qc.invalidateQueries({ queryKey: ['factura', id] });
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al subir archivo');
    } finally {
      setUploadingOC(false);
    }
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!factura)  return <Text type="danger">Factura no encontrada</Text>;

  const estado   = factura.estado as FacturaEstado;
  const pasoActual = estado === 'cancelada' ? -1 : ESTADOS.indexOf(estado);
  const siguientes = TRANSICIONES[estado];

  const detallesCols = [
    { title: '#',          key: 'idx',           width: 40, render: (_: any, __: any, i: number) => i + 1 },
    { title: 'Descripción',dataIndex: 'descripcion', ellipsis: true },
    { title: 'Cant.',      dataIndex: 'cantidad',    width: 70, render: (v: number) => fmt.number(v) },
    { title: 'Precio Unit.',dataIndex: 'precioUnitario', width: 120, render: (v: number) => fmt.moneyM(v, (factura as any)?.moneda) },
    { title: 'ITBIS %',    dataIndex: 'porcentajeIva',  width: 70, render: (v: number) => `${v}%` },
    { title: 'Subtotal',   dataIndex: 'subtotal',    width: 120, render: (v: number) => fmt.moneyM(v, (factura as any)?.moneda) },
    { title: 'ITBIS',      dataIndex: 'importeIva',  width: 100, render: (v: number) => fmt.moneyM(v, (factura as any)?.moneda) },
    { title: 'Total',      dataIndex: 'total',       width: 120,
      render: (v: number) => <strong>{fmt.moneyM(v, (factura as any)?.moneda)}</strong> },
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

            {/* ── Botón Vista Previa → abre HTML y dispara diálogo de impresión ── */}
            <Button
              icon={<EyeOutlined />}
              onClick={() => {
                const empresaId = localStorage.getItem('empresaId');
                fetch(`/api/v1/facturas/${id}/preview`, {
                  credentials: 'include',
                  headers: { 'X-Empresa-ID': empresaId || '' },
                })
                  .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                  })
                  .then(html => {
                    const blob = new Blob([html], { type: 'text/html' });
                    const url  = URL.createObjectURL(blob);
                    const win  = window.open(url, '_blank');
                    if (!win) {
                      message.warning('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
                      URL.revokeObjectURL(url);
                      return;
                    }
                    win.addEventListener('load', () => {
                      // Disparar diálogo de impresión automáticamente
                      win.print();
                      // Revocar el blob URL al cerrar el diálogo (afterprint)
                      // y como fallback después de 5 min
                      win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
                      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
                    });
                  })
                  .catch(() => message.error('Error al cargar vista previa'));
              }}
            >
              Imprimir
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
            <WhatsAppButton
              tipo="factura"
              id={Number(id)}
              folio={factura.folio}
              sendPdf
            />
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
                  <Descriptions.Item label="Cliente">{resolverNombreComprador(factura)}</Descriptions.Item>
                  <Descriptions.Item label="RNC/Cédula">{resolverRncComprador(factura) ?? '—'}</Descriptions.Item>
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
                    <Table.Summary.Cell index={1}><Text strong>{fmt.moneyM(factura.subtotal, (factura as any)?.moneda)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={2}><Text strong>{fmt.moneyM(factura.iva, (factura as any)?.moneda)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={3}><Text strong style={{ color: '#1677ff' }}>{fmt.moneyM(factura.total, (factura as any)?.moneda)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )} />
          </Card>
        </Col>

        {/* Resumen financiero */}
        <Col xs={24} lg={8}>
          <Card title="Resumen financiero" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Statistic title="Subtotal (sin ITBIS)" value={factura.subtotal} formatter={v => fmt.moneyM(Number(v), (factura as any)?.moneda)} />
              <Statistic title="ITBIS" value={factura.iva} formatter={v => fmt.moneyM(Number(v), (factura as any)?.moneda)} valueStyle={{ color: '#fa8c16' }} />
              <Statistic title="TOTAL A PAGAR" value={factura.total}
                formatter={v => fmt.moneyM(Number(v), (factura as any)?.moneda)}
                valueStyle={{ color: '#1677ff', fontSize: 22 }} />
            </Space>
          </Card>

          {factura.notas && (
            <Card title="Notas" size="small" style={{ marginTop: 16 }}>
              <Text>{factura.notas}</Text>
            </Card>
          )}

          {/* ── Formas de pago ─────────────────────────────────── */}
          {((factura as any).formasPago?.length > 0) && (
            <Card title="Formas de pago" size="small" style={{ marginTop: 16 }}>
              {((factura as any).formasPago as { tipo: number; monto: number; referencia?: string }[]).map((fp, i) => {
                const TIPO_LABEL: Record<number, string> = {
                  1: '💵 Efectivo', 2: '🏦 Cheque/Transfer', 3: '💳 Tarjeta',
                  4: '📋 Crédito', 5: '🔄 Permuta', 6: '📝 Nota de crédito',
                };
                return (
                  <Row key={i} justify="space-between" style={{ marginBottom: 4 }}>
                    <Text type="secondary">{TIPO_LABEL[fp.tipo] ?? `Tipo ${fp.tipo}`}
                      {fp.referencia ? <span style={{ fontSize: 11 }}> · {fp.referencia}</span> : null}
                    </Text>
                    <Text strong>{fmt.money(fp.monto)}</Text>
                  </Row>
                );
              })}
            </Card>
          )}

          {/* ── Orden de Compra ────────────────────────────────── */}
          <Card title="Orden de Compra" size="small" style={{ marginTop: 16 }}>
            {(factura as any).ordenCompraNumero && (
              <Row style={{ marginBottom: 8 }}>
                <PaperClipOutlined style={{ marginRight: 6, color: '#6b7280' }} />
                <Text strong>{(factura as any).ordenCompraNumero}</Text>
              </Row>
            )}
            {(factura as any).ordenCompraUrl ? (
              <Button type="link" icon={<LinkOutlined />} style={{ padding: 0 }}
                href={(factura as any).ordenCompraUrl} target="_blank" rel="noopener">
                Ver documento adjunto
              </Button>
            ) : (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Sin archivo adjunto
                </Text>
                <input ref={ocInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadOC(f); }} />
                <Button size="small" icon={<UploadOutlined />} loading={uploadingOC}
                  onClick={() => ocInputRef.current?.click()}>
                  Adjuntar PDF / Imagen
                </Button>
              </div>
            )}
          </Card>
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

    </div>
  );
}
