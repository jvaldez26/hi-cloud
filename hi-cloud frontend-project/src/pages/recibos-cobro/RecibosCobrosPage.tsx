import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, theme, Tooltip,
} from 'antd';
import {
  FileTextOutlined, PlusOutlined, PrinterOutlined, DeleteOutlined,
  DollarOutlined, CheckCircleOutlined, MailOutlined, FileExcelOutlined,
  FilePdfOutlined, LoadingOutlined,
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
  const [modalCrear,       setModalCrear]       = useState(false);
  const [reciboImprimir,   setReciboImprimir]   = useState<any>(null);
  const [emailRecibo,      setEmailRecibo]       = useState<any>(null);
  const [emailDestino,     setEmailDestino]      = useState('');
  const [pdfPending,       setPdfPending]        = useState<number | null>(null);
  const [form] = Form.useForm();

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
      setModalCrear(false);
      form.resetFields();
      message.success(`Recibo ${res.data?.numero ?? ''} generado`);
      setReciboImprimir(res.data);
    },
    onError: (e: any) => message.error(errMsg(e), 5),
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
      const token = localStorage.getItem('access_token') ?? '';
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/recibos-cobro/${item.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Empresa-ID': eid },
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
          <Button type="primary" icon={<PlusOutlined />}
            style={{ background: token.colorSuccess, borderColor: token.colorSuccess }}
            onClick={() => setModalCrear(true)}>
            Nuevo Recibo
          </Button>
        </Space>
      </div>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Cobrado Hoy</span>}
              value={resumen?.hoy?.total ?? 0} formatter={v => fmt(Number(v))}
              prefix={<DollarOutlined />} valueStyle={{ color: '#fff', fontSize: 22 }} />
            <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{resumen?.hoy?.cantidad ?? 0} recibo(s)</Text>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Cobrado Este Mes</span>}
              value={resumen?.mes?.total ?? 0} formatter={v => fmt(Number(v))}
              valueStyle={{ color: '#fff', fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }}>
            <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Histórico</span>}
              value={resumen?.total?.total ?? 0} formatter={v => fmt(Number(v))}
              valueStyle={{ color: '#fff', fontSize: 20 }} />
            <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{resumen?.total?.cantidad ?? 0} recibo(s)</Text>
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={recibos?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={[
            { title: 'Número', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'monospace', color: token.colorSuccess }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
            { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', render: v => <Text strong>{v}</Text> },
            {
              title: 'Método', dataIndex: 'metodoPago', key: 'm',
              render: v => <Tag>{METODOS.find(x => x.value === v)?.label ?? v}</Tag>,
            },
            { title: 'Concepto', dataIndex: 'concepto', key: 'co', ellipsis: true },
            {
              title: 'Monto', dataIndex: 'monto', key: 'mo', align: 'right',
              render: v => <Text strong style={{ color: token.colorSuccess, fontSize: 14 }}>{fmt(v)}</Text>,
            },
            {
              title: '', key: 'acc',
              render: (_: any, r: any) => (
                <Space size={4}>
                  <Button size="small" icon={<PrinterOutlined />} onClick={() => handleImprimir(r)}>
                    Imprimir
                  </Button>
                  <Button size="small" type="text"
                    icon={pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />}
                    disabled={pdfPending === r.id}
                    onClick={() => descargarPDF(r)}
                    title="Descargar PDF"
                  />
                  <Tooltip title="Enviar por email">
                    <Button size="small" type="text" icon={<MailOutlined />}
                      onClick={() => { setEmailRecibo(r); setEmailDestino(r.clienteEmail ?? ''); }}
                    />
                  </Tooltip>
                  <Popconfirm title="¿Eliminar recibo?" onConfirm={() => eliminar.mutate(r.id)}
                    okText="Eliminar" okButtonProps={{ danger: true }}>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

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
            fecha: v.fecha?.format('YYYY-MM-DD'),
            monto: Number(v.monto),
            clienteNombre: clientes.find((c: any) => c.id === v.clienteId)?.nombre,
          })}>
          <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente">
              {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={14}>
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
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="facturaFolio" label="Factura de referencia">
                <Input placeholder="FAC-202505-0001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="referencia" label="Referencia / Cheque #">
                <Input placeholder="Banco, número de cheque..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
