import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Popconfirm,
  message, theme, Tooltip, Drawer, Descriptions, Divider,
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, PrinterOutlined,
  CheckCircleOutlined, MailOutlined, FileExcelOutlined,
  FilePdfOutlined, LoadingOutlined, StopOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { imprimirElemento } from '../../utils/printUtils';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const METODOS = [
  { value: 'efectivo',      label: '💵 Efectivo' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'cheque',        label: '📄 Cheque' },
  { value: 'tarjeta',       label: '💳 Tarjeta' },
  { value: 'deposito',      label: '🏧 Depósito' },
  { value: 'otro',          label: '📦 Otro' },
];

// Recibo imprimible
function ReciboImprimible({ recibo, empresa }: { recibo: any; empresa?: any }) {
  const S: Record<string, React.CSSProperties> = {
    wrap:   { fontFamily: '"Courier New", monospace', fontSize: 12, width: 300, padding: '8px 4px', background: '#fff', color: '#000' },
    center: { textAlign: 'center' },
    row:    { display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
    dash:   { borderTop: '1px dashed #666', margin: '6px 0' },
    bold:   { fontWeight: 700 },
    large:  { fontSize: 18, fontWeight: 900, textAlign: 'center' as const },
  };
  const metodo = METODOS.find(m => m.value === recibo.metodoPago);
  return (
    <div style={S.wrap}>
      <div style={{ ...S.center, marginBottom: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{empresa?.nombre ?? 'HiCloud ERP'}</div>
        {empresa?.rnc && <div style={{ fontSize: 10 }}>RNC: {empresa.rnc}</div>}
        <div style={{ fontSize: 10 }}>RECIBO DE COBRO</div>
      </div>
      <div style={S.dash} />
      <div style={S.row}><span>Recibo No.:</span><span style={S.bold}>{recibo.numero}</span></div>
      <div style={S.row}><span>Fecha:</span><span>{recibo.fecha}</span></div>
      <div style={S.row}><span>Cliente:</span><span style={{ ...S.bold, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recibo.clienteNombre}</span></div>
      <div style={S.dash} />
      <div style={{ marginBottom: 4 }}><span>Concepto: </span><span>{recibo.concepto}</span></div>
      {recibo.facturaFolio && <div style={S.row}><span>Factura ref.:</span><span>{recibo.facturaFolio}</span></div>}
      {recibo.referencia   && <div style={S.row}><span>Referencia:</span><span>{recibo.referencia}</span></div>}
      <div style={S.dash} />
      <div style={S.large}>{fmt(recibo.monto)}</div>
      <div style={{ ...S.center, fontSize: 11, marginTop: 2 }}>Forma de pago: {metodo?.label ?? recibo.metodoPago}</div>
      <div style={S.dash} />
      <div style={{ ...S.center, fontSize: 10, marginTop: 6 }}>
        <div>Recibido por: {recibo.nombreUsuario ?? '___________'}</div>
        <div style={{ marginTop: 16, borderTop: '1px solid #666', paddingTop: 4 }}>Firma y sello</div>
        <div style={{ marginTop: 12 }}>{dayjs().format('DD/MM/YYYY HH:mm')} · HiCloud ERP</div>
      </div>
    </div>
  );
}

const RECIBO_PRINT_ID = 'hc-recibo-cobro-print';

export default function RecibosCobrosPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const COLS_DEF = [
    { key: 'n',   label: 'Número',   defaultVisible: true  },
    { key: 'f',   label: 'Fecha',    defaultVisible: true  },
    { key: 'c',   label: 'Cliente',  defaultVisible: true  },
    { key: 'm',   label: 'Método',   defaultVisible: true  },
    { key: 'co',  label: 'Concepto', defaultVisible: false },
    { key: 'mo',  label: 'Monto',    defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('recibos-cobro', COLS_DEF);
  const [modalCrear,       setModalCrear]       = useState(false);
  const [reciboImprimir,   setReciboImprimir]   = useState<any>(null);
  const [emailRecibo,      setEmailRecibo]       = useState<any>(null);
  const [emailDestino,     setEmailDestino]      = useState('');
  const [pdfPending,       setPdfPending]        = useState<number | null>(null);
  const [detalleRecibo,    setDetalleRecibo]     = useState<any>(null);
  const [motivoAnulacion,     setMotivoAnulacion]     = useState('');
  const [pendienteExcedente,  setPendienteExcedente]  = useState<{ dto: any; excedente: number; pendiente: number } | null>(null);
  const [form] = Form.useForm();

  const anularMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.delete(`/recibos-cobro/${id}`, { data: { motivo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recibos-cobro'] });
      qc.invalidateQueries({ queryKey: ['recibos-resumen'] });
      setDetalleRecibo(null);
      message.success('Recibo anulado correctamente');
    },
    onError: (e: any) => message.error(errMsg(e), 5),
  });

  const confirmarAnulacion = (r: any) => {
    setMotivoAnulacion('');
    let motivo = '';
    Modal.confirm({
      title: '¿Anular este recibo?',
      icon: <StopOutlined style={{ color: '#EF4444' }} />,
      content: (
        <div>
          <p style={{ margin: '0 0 4px' }}>Recibo: <strong>{r.numero}</strong></p>
          <p style={{ margin: '0 0 8px' }}>Monto: <strong>{fmt(Number(r.monto))}</strong></p>
          <p style={{ color: '#EF4444', fontSize: 12, margin: '0 0 8px' }}>
            Esta acción revertirá el pago registrado
            {r.facturaId ? ' y actualizará el saldo pendiente de la factura.' : '.'}
          </p>
          <Input.TextArea
            placeholder="Motivo de anulación (obligatorio)"
            rows={2}
            onChange={e => { motivo = e.target.value; setMotivoAnulacion(e.target.value); }}
          />
        </div>
      ),
      okText: 'Anular recibo',
      okButtonProps: { danger: true },
      cancelText: 'Cancelar',
      onOk: () => {
        if (!motivo.trim()) { message.warning('Debes ingresar un motivo'); return Promise.reject(); }
        return anularMut.mutateAsync({ id: r.id, motivo });
      },
    });
  };

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/recibo/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailRecibo(null); setEmailDestino(''); message.success(`Recibo enviado a ${v.email}`); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar'),
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  // Facturas pendientes del cliente seleccionado
  const clienteIdWatch = Form.useWatch('clienteId', form);
  const { data: facturasCliente = [], isFetching: loadingFacturas } = useQuery<any[]>({
    queryKey: ['facturas-pendientes-cliente', clienteIdWatch],
    queryFn:  () =>
      api.get(`/facturas?clienteId=${clienteIdWatch}&limit=200`).then((r: any) => {
        const d   = r.data?.data ?? r.data;
        const arr = Array.isArray(d) ? d : (d?.data ?? []);
        return arr.filter((f: any) => f.estado !== 'pagada' && f.estado !== 'anulada');
      }),
    enabled: !!clienteIdWatch,
    staleTime: 0,
  });

  const { data: resumen } = useQuery<any>({
    queryKey: ['recibos-resumen'],
    queryFn:  () => api.get('/recibos-cobro/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: recibos, isLoading } = useQuery<any>({
    queryKey: ['recibos-cobro'],
    queryFn:  () => api.get('/recibos-cobro?limit=50').then((r: any) => r.data?.data ?? r.data),
  });

  const errMsg = (e: any) => e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado';

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/recibos-cobro', dto),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['recibos-cobro'] });
      qc.invalidateQueries({ queryKey: ['recibos-resumen'] });
      qc.invalidateQueries({ queryKey: ['anticipos'] });
      setModalCrear(false);
      setPendienteExcedente(null);
      form.resetFields();
      const d = res.data?.data ?? res.data;
      const recibo  = d?.recibo ?? d;
      const anticipo = d?.anticipo;
      if (anticipo) {
        message.success(`Recibo ${recibo?.numero ?? ''} y Anticipo ${anticipo.numero} (RD$ ${Number(anticipo.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}) registrados`, 5);
      } else {
        message.success(`Recibo ${recibo?.numero ?? ''} generado`);
      }
      setReciboImprimir(recibo);
    },
    onError: (e: any) => {
      const msg: string = e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? '';
      // Detectar error de excedente: "EXCEDENTE:500.00:1000.00"
      if (msg.startsWith('EXCEDENTE:')) {
        const [, exStr, penStr] = msg.split(':');
        const excedente = Number(exStr);
        const pendiente = Number(penStr);
        const dto = (crear as any).variables;
        setPendienteExcedente({ dto, excedente, pendiente });
      } else {
        message.error(msg || 'Error inesperado', 5);
      }
    },
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/recibos-cobro/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recibos-cobro'] });
      qc.invalidateQueries({ queryKey: ['recibos-resumen'] }); message.success('Recibo eliminado'); },
    onError: (e: any) => message.error(errMsg(e), 5),
  });

  const handleImprimir = (recibo: any) => {
    setReciboImprimir(recibo);
    setTimeout(() => imprimirElemento(RECIBO_PRINT_ID, '80mm auto'), 200);
  };

  const descargarPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/recibos-cobro/${item.id}/pdf`, {
      credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${item.numero ?? item.id}.pdf`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Elemento oculto para impresión */}
      <div id={`${RECIBO_PRINT_ID}-wrapper`} style={{ display: 'none' }}>
        {reciboImprimir && <ReciboImprimible recibo={reciboImprimir} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTextOutlined style={{ fontSize: 28, color: token.colorSuccess }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Recibos de Cobro</Title>
            <Text type="secondary">Comprobante oficial de pago recibido · Impresión directa 80mm</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (recibos?.data ?? []).map((r: any) => ({
              'Número':   r.numero,
              'Fecha':    r.fecha,
              'Cliente':  r.clienteNombre ?? '',
              'Concepto': r.concepto ?? '',
              'Método':   r.metodoPago ?? '',
              'Referencia': r.referencia ?? '',
              'Monto':    Number(r.monto ?? 0),
            }));
            exportarExcel(filas, `Recibos-${dayjs().format('YYYY-MM-DD')}`);
            message.success(`${filas.length} recibos exportados`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['recibos-cobro']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: token.colorSuccess, borderColor: token.colorSuccess }}
            onClick={() => setModalCrear(true)}>
            Nuevo Recibo
          </Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={recibos?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={filterColumns([
            { title: 'Número', dataIndex: 'numero', key: 'n', render: (v: any) => <Text strong style={{ fontFamily: 'monospace', color: token.colorSuccess }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
            { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', render: (v: any) => <Text strong>{v}</Text> },
            {
              title: 'Método', dataIndex: 'metodoPago', key: 'm',
              render: (v: any) => <Tag>{METODOS.find(x => x.value === v)?.label ?? v}</Tag>,
            },
            { title: 'Concepto', dataIndex: 'concepto', key: 'co', ellipsis: true },
            {
              title: 'Monto', dataIndex: 'monto', key: 'mo', align: 'right' as const,
              render: (v: any) => <Text strong style={{ color: token.colorSuccess, fontSize: 14 }}>{fmt(v)}</Text>,
            },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const, fixed: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setDetalleRecibo(r)}
                  viewLabel="Ver detalle"
                  items={[
                    { key: 'imprimir', label: 'Imprimir recibo', icon: <PrinterOutlined />,
                      onClick: () => handleImprimir(r) },
                    { key: 'pdf',      label: pdfPending === r.id ? 'Generando PDF...' : 'Descargar PDF',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />,
                      disabled: pdfPending === r.id,
                      onClick: () => descargarPDF(r) },
                    { key: 'email',    label: 'Enviar por email', icon: <MailOutlined />,
                      onClick: () => { setEmailRecibo(r); setEmailDestino(r.clienteEmail ?? ''); } },
                    { type: 'divider' as const },
                    { key: 'anular',   label: 'Anular recibo', icon: <StopOutlined />, danger: true,
                      disabled: r.isActive === false,
                      onClick: () => confirmarAnulacion(r) },
                  ]}
                />
              ),
            },
          ] as any)}
        />
      </Card>

      {/* Drawer detalle recibo */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: token.colorSuccess }} />
            {detalleRecibo?.numero ?? 'Detalle de Recibo'}
          </Space>
        }
        open={!!detalleRecibo}
        onClose={() => setDetalleRecibo(null)}
        width={420}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button icon={<PrinterOutlined />} onClick={() => detalleRecibo && handleImprimir(detalleRecibo)}>
              Imprimir
            </Button>
            <Button
              icon={pdfPending === detalleRecibo?.id ? <LoadingOutlined /> : <FilePdfOutlined />}
              disabled={pdfPending === detalleRecibo?.id}
              onClick={() => detalleRecibo && descargarPDF(detalleRecibo)}
            >
              PDF
            </Button>
            <Button icon={<MailOutlined />}
              onClick={() => { setEmailRecibo(detalleRecibo); setEmailDestino(detalleRecibo?.clienteEmail ?? ''); setDetalleRecibo(null); }}>
              Email
            </Button>
            <Button danger icon={<StopOutlined />}
              disabled={detalleRecibo?.isActive === false}
              onClick={() => { const r = detalleRecibo; setDetalleRecibo(null); confirmarAnulacion(r); }}>
              Anular
            </Button>
          </Space>
        }
      >
        {detalleRecibo && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Número">
              <Text strong style={{ fontFamily: 'monospace', color: token.colorSuccess }}>
                {detalleRecibo.numero}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Fecha">{detalleRecibo.fecha}</Descriptions.Item>
            <Descriptions.Item label="Cliente">
              <Text strong>{detalleRecibo.clienteNombre ?? '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Método">
              <Tag>{METODOS.find(m => m.value === detalleRecibo.metodoPago)?.label ?? detalleRecibo.metodoPago}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Concepto">{detalleRecibo.concepto ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Referencia">{detalleRecibo.referencia ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Monto">
              <Text strong style={{ color: token.colorSuccess, fontSize: 16 }}>
                {fmt(Number(detalleRecibo.monto))}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Cajero">{detalleRecibo.nombreUsuario ?? '—'}</Descriptions.Item>
            {detalleRecibo.facturaFolio && (
              <Descriptions.Item label="Factura">{detalleRecibo.facturaFolio}</Descriptions.Item>
            )}
            <Descriptions.Item label="Estado">
              <Tag color={detalleRecibo.isActive !== false ? 'success' : 'error'}>
                {detalleRecibo.isActive !== false ? 'Activo' : 'Anulado'}
              </Tag>
            </Descriptions.Item>
            {detalleRecibo.notas && (
              <Descriptions.Item label="Notas">{detalleRecibo.notas}</Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>

      {/* Modal email */}
      <Modal
        title={<><MailOutlined style={{ color: '#1677ff', marginRight: 8 }} />Enviar recibo por email</>}
        open={!!emailRecibo}
        onCancel={() => { setEmailRecibo(null); setEmailDestino(''); }}
        onOk={() => emailRecibo && emailMut.mutate({ id: emailRecibo.id, email: emailDestino })}
        confirmLoading={emailMut.isPending}
        okText="Enviar"
        destroyOnClose
        width={400}
      >
        {emailRecibo && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
              Recibo <strong>{emailRecibo.numero}</strong> · <strong>{emailRecibo.clienteNombre}</strong>
            </p>
            <Input
              prefix={<MailOutlined />}
              placeholder="correo@cliente.com"
              value={emailDestino}
              onChange={e => setEmailDestino(e.target.value)}
              size="large"
            />
          </div>
        )}
      </Modal>

      {/* Modal crear recibo */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: token.colorSuccess }} />Nuevo Recibo de Cobro</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={crear.isPending}
        okText="Emitir Recibo"
        okButtonProps={{ style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical"
          initialValues={{ fecha: dayjs(), metodoPago: 'efectivo' }}
          onFinish={v => crear.mutate({
            ...v,
            fecha:         v.fecha?.format('YYYY-MM-DD'),
            monto:         Number(v.monto),
            clienteNombre: clientes.find((c: any) => c.id === v.clienteId)?.nombre,
            facturaId:     v.facturaId ?? undefined,
            facturaFolio:  v.facturaFolio ?? undefined,
          })}>
          <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="children"
              placeholder="Seleccionar cliente"
              onChange={() => {
                form.setFieldsValue({ facturaId: undefined, facturaFolio: undefined });
              }}
            >
              {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item name="metodoPago" label="Método de Pago" rules={[{ required: true }]}>
                <Select>
                  {METODOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="monto" label="Monto Recibido (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="RD$" size="large" />
          </Form.Item>
          <Form.Item name="concepto" label="Concepto" rules={[{ required: true }]}>
            <Input placeholder="Pago de factura, abono, cuota #1, etc." />
          </Form.Item>
          <Form.Item
            name="facturaId"
            label="Factura de referencia (opcional)"
            help={!clienteIdWatch ? 'Selecciona un cliente para ver sus facturas pendientes' : undefined}
          >
            <Select
              allowClear
              showSearch
              loading={loadingFacturas}
              disabled={!clienteIdWatch}
              placeholder={clienteIdWatch ? 'Seleccionar factura pendiente...' : 'Primero selecciona un cliente'}
              optionFilterProp="label"
              notFoundContent={clienteIdWatch ? 'No hay facturas pendientes para este cliente' : null}
              onChange={(val) => {
                const f = facturasCliente.find((x: any) => x.id === val);
                form.setFieldValue('facturaFolio', f?.numero ?? f?.folio ?? undefined);
              }}
            >
              {facturasCliente.map((f: any) => (
                <Option
                  key={f.id}
                  value={f.id}
                  label={f.numero ?? f.folio}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.numero ?? f.folio}</span>
                    <span style={{ color: '#10B981', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {fmt(Number(f.total ?? 0))}
                    </span>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>
          {/* Campo oculto que almacena el folio para enviarlo al backend */}
          <Form.Item name="facturaFolio" hidden><Input /></Form.Item>
          <Form.Item name="referencia" label="Referencia / Cheque #">
            <Input placeholder="Banco, número de cheque..." />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: excedente sobre CxC → registrar como anticipo ─── */}
      <Modal
        open={!!pendienteExcedente}
        title="Monto superior al saldo pendiente"
        onCancel={() => setPendienteExcedente(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendienteExcedente(null)}>
            Cancelar
          </Button>,
          <Button
            key="no"
            onClick={() => {
              if (pendienteExcedente) {
                crear.mutate({ ...pendienteExcedente.dto, registrarExcedente: false,
                  monto: pendienteExcedente.pendiente });
              }
            }}
            loading={crear.isPending}
          >
            Cobrar solo RD$ {pendienteExcedente?.pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </Button>,
          <Button
            key="yes"
            type="primary"
            onClick={() => {
              if (pendienteExcedente) {
                crear.mutate({ ...pendienteExcedente.dto, registrarExcedente: true });
              }
            }}
            loading={crear.isPending}
          >
            Sí, registrar anticipo
          </Button>,
        ]}
        width={440}
        centered
      >
        {pendienteExcedente && (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
            <p style={{ fontSize: 14, color: token.colorText, marginBottom: 8 }}>
              El monto recibido supera el saldo pendiente de la factura.
            </p>
            <div style={{
              background: token.colorFillSecondary, borderRadius: 10,
              padding: '12px 20px', margin: '0 auto 16px', display: 'inline-block',
            }}>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>Saldo factura</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: token.colorText }}>
                RD$ {pendienteExcedente.pendiente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 8 }}>Excedente</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: token.colorSuccess }}>
                + RD$ {pendienteExcedente.excedente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <p style={{ fontSize: 13, color: token.colorTextSecondary }}>
              ¿Deseas registrar <strong>RD$ {pendienteExcedente.excedente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong> como anticipo del cliente para futuras facturas?
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
