import { Button, Card, Descriptions, Table, Tag, Row, Col, Typography,
         Statistic, Space, Spin, Steps, message, Popconfirm, theme, Alert,
         Modal, Form, Input, Select } from 'antd';
import { ArrowLeftOutlined, SendOutlined, CheckCircleOutlined,
         CloseCircleOutlined, PrinterOutlined, LoadingOutlined, AuditOutlined,
         EditOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { comprasApi } from '../../api/compras.api';
import { ecfApi } from '../../api/ecf.api';
import { fmt, estadoColor } from '../../utils/formatters';
import type { CompraEstado } from '../../types';
import EcfSeccion from '../../components/ui/EcfSeccion';
import RecibirMercanciaModal from '../../components/compras/RecibirMercanciaModal';
import { TIPOS_BIENES_606, FORMAS_PAGO_606 } from '../../constants/dgii-606';

/** Estados en los que ya no se puede tocar cabecera/líneas (ver
 *  ComprasService.update) pero sí registrar el NCF que llegó después. */
const ESTADOS_CON_NCF_EDITABLE: CompraEstado[] = ['recibida', 'recibida_parcial', 'pagada'];

const { Title, Text } = Typography;

const ESTADOS_ORDEN: CompraEstado[] = ['borrador', 'enviada', 'recibida', 'pagada'];

/**
 * A qué estados se puede pasar con un botón directo (Popconfirm + PATCH
 * .../estado). 'recibida' se maneja aparte — ver `abreModal` más abajo —:
 * recibir siempre pasa por RecibirMercanciaModal, el mismo que usa el POS,
 * con verificación de cantidades y soporte de recepción parcial.
 */
const TRANSICIONES: Record<CompraEstado, CompraEstado[]> = {
  borrador:         ['enviada', 'recibida', 'cancelada'],
  enviada:          ['recibida', 'cancelada'],
  recibida_parcial: ['recibida', 'cancelada'],
  recibida:         ['pagada',   'cancelada'],
  pagada:           [],
  cancelada:        [],
};

const TRANS_LABEL: Record<string, string> = {
  enviada:   '📤 Marcar enviada',
  recibida:  '📦 Recibir mercancía',
  pagada:    '✅ Marcar pagada',
  cancelada: '✗ Cancelar',
};

/** 'recibida' (y 'recibida_parcial' → 'recibida', o sea "Completar") abren
 *  el modal de recepción en vez de cambiar el estado de un tirón. */
const abreModal = (sig: CompraEstado) => sig === 'recibida';

export default function CompraDetailPage() {
  const { token: themeToken } = theme.useToken();
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showRecibir, setShowRecibir] = useState(false);
  const [showNcfModal, setShowNcfModal] = useState(false);
  const [ncfForm] = Form.useForm();

  const imprimirPDF = async () => {
    setPdfLoading(true);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/compras/${id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { message.warning('El navegador bloqueó la ventana emergente'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch { message.error('No se pudo generar el PDF'); }
    finally { setPdfLoading(false); }
  };

  const { data: compra, isLoading } = useQuery({
    queryKey: ['compra', id],
    queryFn:  () => comprasApi.getOne(Number(id)),
    enabled:  !!id,
  });

  const emitirE41Mut = useMutation({
    mutationFn: () => ecfApi.emitirEcfCompra(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compra', id] }); message.success('E41 emitido correctamente'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al emitir E41'),
  });

  const handleEmitirE41 = async () => {
    const DEFINITIVOS = ['aceptado', 'enviado', 'pendiente_envio', 'observado', 'condicionado'];
    const ecfExistente = await ecfApi.getEcfByDocumento(Number(id), 'COMPRA').catch(() => null);
    if (ecfExistente && DEFINITIVOS.includes(ecfExistente.estadoDGII ?? '')) {
      message.warning(`Ya existe un Comprobante E41 para esta orden: ${ecfExistente.numero}. No se emitirá un duplicado.`);
      return;
    }
    emitirE41Mut.mutate();
  };

  const ncfMut = useMutation({
    mutationFn: (body: { numeroFacturaProveedor?: string; tipoBienes?: string; formaPago?: string }) =>
      comprasApi.actualizarNcfProveedor(Number(id), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compra', id] });
      message.success('Comprobante del proveedor registrado');
      setShowNcfModal(false);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo registrar el comprobante'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ estado }: { estado: CompraEstado }) =>
      comprasApi.cambiarEstado(Number(id), estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compra', id] });
      qc.invalidateQueries({ queryKey: ['compras'] });
      message.success('Estado actualizado');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (!compra)   return <Text type="danger">Compra no encontrada</Text>;

  const estado     = (compra as any).estado as CompraEstado;
  const siguientes = TRANSICIONES[estado] ?? [];
  // recibida_parcial no tiene su propio paso en el Stepper — cuenta como
  // "en Recibida" (a medias) en vez de no resaltar ningún paso.
  const pasoActual = estado === 'cancelada'
    ? -1
    : ESTADOS_ORDEN.indexOf(estado === 'recibida_parcial' ? 'recibida' : estado);

  const detallesCols = [
    { title: '#',            key: 'idx',    width: 40,  render: (_: any, __: any, i: number) => i + 1 },
    { title: 'Descripción',  dataIndex: 'descripcion',  ellipsis: true },
    { title: 'Cant.',        dataIndex: 'cantidad',     width: 70,  render: (v: number) => fmt.number(v) },
    { title: 'Precio Unit.', dataIndex: 'precioUnitario', width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Desc.',        dataIndex: 'descuentoMonto', width: 90,
      render: (v: number) => Number(v) > 0 ? fmt.money(v) : '—' },
    { title: 'ITBIS %',      dataIndex: 'porcentajeItbis', width: 80, render: (v: number) => `${v}%` },
    { title: 'Subtotal',     dataIndex: 'subtotal',     width: 120, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',        dataIndex: 'importeItbis', width: 100, render: (v: number) => fmt.money(v) },
    { title: 'Total',        dataIndex: 'total',        width: 120,
      render: (v: number) => <strong>{fmt.money(v)}</strong> },
  ];

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compras')}>
              Volver
            </Button>
            <Title level={4} style={{ margin: 0 }}>Compra {(compra as any).folio}</Title>
            <Tag color={estadoColor[estado]} style={{ fontSize: 13 }}>{estado.toUpperCase()}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={pdfLoading ? <LoadingOutlined /> : <PrinterOutlined />}
              onClick={imprimirPDF} disabled={pdfLoading}>
              Imprimir
            </Button>
            {siguientes.map(sig => abreModal(sig) ? (
              <Button key={sig} type="primary" icon={<SendOutlined />}
                style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => setShowRecibir(true)}>
                {estado === 'recibida_parcial' ? '📦 Completar recepción' : TRANS_LABEL[sig]}
              </Button>
            ) : (
              <Popconfirm key={sig}
                title={`¿${TRANS_LABEL[sig]}?`}
                onConfirm={() => estadoMut.mutate({ estado: sig })}>
                <Button
                  type={sig === 'cancelada' ? 'default' : 'primary'}
                  danger={sig === 'cancelada'}
                  loading={estadoMut.isPending}
                  icon={sig === 'pagada' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                  {TRANS_LABEL[sig]}
                </Button>
              </Popconfirm>
            ))}
          </Space>
        </Col>
      </Row>

      {/* Timeline */}
      {estado !== 'cancelada' ? (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Steps current={pasoActual} size="small" items={[
            { title: 'Borrador',  description: 'En preparación' },
            { title: 'Recibida',  description: 'Mercancía recibida' },
            { title: 'Pagada',    description: 'Pago completado' },
          ]} />
        </Card>
      ) : (
        <Card size="small" style={{ marginBottom: 16, background: themeToken.colorErrorBg, borderColor: themeToken.colorErrorBorder }}>
          <Text type="danger">✗ Esta compra fue cancelada</Text>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Datos de la orden de compra" style={{ marginBottom: 16 }}>
            <Row gutter={[16, 0]}>
              <Col xs={24} sm={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Folio">
                    <Text strong>{(compra as any).folio}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Fecha">{fmt.date((compra as any).fecha)}</Descriptions.Item>
                  <Descriptions.Item label="Estado">
                    <Tag color={estadoColor[estado]}>{estado.toUpperCase()}</Tag>
                  </Descriptions.Item>
                  {(compra as any).numeroFacturaProveedor && (
                    <Descriptions.Item label="N° Factura Prov.">
                      <Text code>{(compra as any).numeroFacturaProveedor}</Text>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Col>
              <Col xs={24} sm={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Proveedor">{(compra as any).proveedor?.nombre}</Descriptions.Item>
                  <Descriptions.Item label="RNC">{(compra as any).proveedor?.rnc ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Teléfono">{(compra as any).proveedor?.telefono ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Email">{(compra as any).proveedor?.email ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          </Card>

          {/* ── Sección e-CF / NCF Proveedor ─────────────────────────── */}
          {(() => {
            const proveedor = (compra as any).proveedor;
            const esInformal = !proveedor?.rnc ||
                               proveedor.rnc === '000000000' ||
                               proveedor.esInformal === true;
            if (esInformal) {
              const puedeEmitir = estado === 'recibida' || estado === 'pagada';
              return (
                <>
                  <EcfSeccion
                    documentoOrigenId={(compra as any).id}
                    documentoOrigenTipo="COMPRA"
                    queryKeyBase="compras"
                  />
                  {puedeEmitir && (
                    <div style={{ marginBottom: 16 }}>
                      <Button icon={<AuditOutlined />} size="small"
                        loading={emitirE41Mut.isPending} onClick={handleEmitirE41}>
                        Emitir Comprobante E41
                      </Button>
                    </div>
                  )}
                </>
              );
            }
            // Proveedor formal → mostrar NCF que emitió el proveedor
            const puedeEditarNcf = ESTADOS_CON_NCF_EDITABLE.includes(estado);
            return (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  message="Comprobante Fiscal del Proveedor"
                  description={
                    (compra as any).numeroFacturaProveedor
                      ? <>NCF: <strong>{(compra as any).numeroFacturaProveedor}</strong> — emitido por {proveedor?.nombre}</>
                      : puedeEditarNcf
                        ? 'Sin NCF registrado. Ingresa el número de comprobante del proveedor.'
                        : 'Sin NCF registrado. Podrás ingresarlo cuando la orden esté recibida.'
                  }
                  action={puedeEditarNcf && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => {
                      ncfForm.setFieldsValue({
                        numeroFacturaProveedor: (compra as any).numeroFacturaProveedor,
                        tipoBienes: (compra as any).tipoBienes,
                        formaPago: (compra as any).formaPago,
                      });
                      setShowNcfModal(true);
                    }}>
                      {(compra as any).numeroFacturaProveedor ? 'Editar' : 'Registrar NCF'}
                    </Button>
                  )}
                  style={{ marginBottom: 0 }}
                />
              </Card>
            );
          })()}

          <Modal
            title="Comprobante Fiscal del Proveedor"
            open={showNcfModal}
            onCancel={() => setShowNcfModal(false)}
            onOk={() => ncfForm.validateFields().then(v => ncfMut.mutate(v))}
            confirmLoading={ncfMut.isPending}
            okText="Guardar"
          >
            <Form form={ncfForm} layout="vertical">
              <Form.Item name="numeroFacturaProveedor" label="NCF del proveedor"
                rules={[{ required: true, message: 'Ingresa el número de comprobante' }]}>
                <Input placeholder="Ej. B0100000123" maxLength={50} />
              </Form.Item>
              <Form.Item name="tipoBienes" label="Tipo de bienes (606)">
                <Select allowClear placeholder="Sin clasificar" options={TIPOS_BIENES_606}
                  showSearch filterOption={(i, o) => (o?.label ?? '').toString().toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
              <Form.Item name="formaPago" label="Forma de pago (606)">
                <Select allowClear placeholder="Sin clasificar" options={FORMAS_PAGO_606}
                  showSearch filterOption={(i, o) => (o?.label ?? '').toString().toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
            </Form>
          </Modal>

          <Card title="Detalle de productos">
            <Table
              columns={detallesCols}
              dataSource={(compra as any).detalles ?? []}
              rowKey="id"
              size="small"
        scroll={{ x: 'max-content' }}
              pagination={false}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6} align="right">
                      <Text strong>Totales:</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>
                      <Text strong>{fmt.money((compra as any).subtotal)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>
                      <Text strong>{fmt.money((compra as any).itbis)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3}>
                      <Text strong style={{ color: '#1677ff' }}>{fmt.money((compra as any).total)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Resumen financiero" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Statistic title="Subtotal (sin ITBIS)" value={(compra as any).subtotal}
                formatter={v => fmt.money(Number(v))} />
              {Number((compra as any).descuentoTotal ?? 0) > 0 && (
                <Statistic title="Descuento" value={(compra as any).descuentoTotal}
                  formatter={v => fmt.money(Number(v))}
                  valueStyle={{ color: '#d97706' }} />
              )}
              <Statistic title="ITBIS" value={(compra as any).itbis}
                formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: '#fa8c16' }} />
              <Statistic title="TOTAL A PAGAR" value={(compra as any).total}
                formatter={v => fmt.money(Number(v))}
                valueStyle={{ color: '#1677ff', fontSize: 22 }} />
            </Space>
          </Card>

          {(compra as any).notas && (
            <Card title="Notas" size="small">
              <Text>{(compra as any).notas}</Text>
            </Card>
          )}
        </Col>
      </Row>

      <RecibirMercanciaModal
        open={showRecibir}
        compra={compra as any}
        onClose={() => setShowRecibir(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['compra', id] });
          qc.invalidateQueries({ queryKey: ['compras'] });
          message.success('Mercancía recibida y stock actualizado');
        }}
      />
    </div>
  );
}
