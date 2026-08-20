import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Tag, Tabs, Badge,
  Tooltip, DatePicker, Descriptions,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, TableOutlined, AppstoreOutlined,
  DollarOutlined, ClockCircleOutlined, CheckCircleOutlined,
  GiftOutlined, PrinterOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { clientesApi } from '../../api/clientes.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const ESTADOS = ['pendiente', 'en_proceso', 'lista', 'entregada'] as const;
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', lista: 'Lista', entregada: 'Entregada', cancelada: 'Cancelada',
};
const ESTADO_OPS = [
  { value: 'pendiente',  label: 'Pendiente'  },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'lista',      label: 'Lista'      },
  { value: 'entregada',  label: 'Entregada'  },
  { value: 'cancelada',  label: 'Cancelada'  },
];
const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', en_proceso: 'blue', lista: 'cyan',
  entregada: 'green', cancelada: 'red',
};
const KANBAN_HEADER: Record<string, string> = {
  pendiente: '#fa8c16', en_proceso: '#1677ff', lista: '#13c2c2', entregada: '#52c41a',
};
const METODO_PAGO_OPS = [
  { value: 'efectivo',      label: 'Efectivo'      },
  { value: 'tarjeta',       label: 'Tarjeta'       },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque',        label: 'Cheque'        },
];
const TIPO_NCF_OPS = [
  { value: 'B01', label: 'B01 — Crédito fiscal' },
  { value: 'B02', label: 'B02 — Consumidor final' },
  { value: 'B14', label: 'B14 — Régimen especial' },
  { value: 'B15', label: 'B15 — Gubernamental' },
  { value: 'E31', label: 'E31 — Electrónico crédito' },
  { value: 'E32', label: 'E32 — Electrónico consumidor' },
];

const COLS_DEF = [
  { key: 'numero', label: 'N°', defaultVisible: true },
  { key: 'pac', label: 'Paciente', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'tipoLente', label: 'Lente', defaultVisible: true },
  { key: 'laboratorio', label: 'Laboratorio', defaultVisible: false },
  { key: 'total', label: 'Total', defaultVisible: true },
  { key: 'balance', label: 'Saldo', defaultVisible: true },
  { key: 'fechaEntrega', label: 'Entrega', defaultVisible: true },
  { key: 'facturaId', label: 'Factura', defaultVisible: false },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

// ── Imprimir OT ──────────────────────────────────────────────────────────────

function imprimirOT(ot: any) {
  const w = window.open('', '_blank');
  if (!w) return;
  const dt = (v: any) => v ? dayjs(v).format('DD/MM/YYYY') : '—';
  const mn = (v: any) => `RD$${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fila = (l: string, v: any) => (v && v !== '—') ? `<tr><td>${l}</td><td>${v}</td></tr>` : '';

  const itbis    = Number(ot.itbis   ?? 0);
  const subtotal = Number(ot.subtotal ?? 0);
  const total    = Number(ot.total    ?? 0);
  const abono    = Number(ot.abono    ?? 0);
  const balance  = Number(ot.balance  ?? 0);

  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
  <title>OT ${ot.numero}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;padding:28px 32px;max-width:680px;margin:0 auto;font-size:13px;color:#222}
    .hdr{text-align:center;margin-bottom:14px}
    .hdr h1{font-size:20px;margin:0 0 4px;letter-spacing:1px}
    .hdr h2{font-size:14px;margin:0 0 4px;color:#555}
    hr{border:none;border-top:1px solid #ccc;margin:10px 0}
    hr.thick{border-top:2px solid #333}
    .sec{margin:12px 0}
    .sec-t{font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:7px}
    table.d{width:100%;border-collapse:collapse}
    table.d td{padding:3px 0;vertical-align:top}
    table.d td:first-child{color:#666;width:42%}
    table.d td:last-child{font-weight:500}
    table.t{width:100%;border-collapse:collapse;margin-top:4px}
    table.t td{padding:4px 8px}
    table.t td:last-child{text-align:right}
    .tr-tot td{font-weight:bold;font-size:15px;border-top:2px solid #333;padding-top:6px}
    .tr-sal td{color:#c00;font-weight:bold}
    .tr-pag td{color:#1a7a1a}
    .sigs{display:flex;gap:48px;margin-top:48px}
    .sig{flex:1;text-align:center;font-size:12px;color:#555}
    .sig-l{border-top:1px solid #555;margin:30px 16px 6px}
    @media print{@page{margin:18mm 15mm}}
  </style></head><body>

  <div class="hdr">
    <h1>ORDEN DE TRABAJO ÓPTICA</h1>
    <h2>${ot.numero}</h2>
    <div>Fecha: ${dt(ot.fecha)} &nbsp;|&nbsp; Estado: ${ESTADO_LABEL[ot.estado] ?? ot.estado}</div>
  </div>
  <hr class="thick">

  <div class="sec">
    <div class="sec-t">Paciente</div>
    <table class="d">
      ${fila('Paciente:', ot.pacienteNombre)}
      ${fila('Entrega estimada:', dt(ot.fechaEntrega))}
    </table>
  </div>

  <div class="sec">
    <div class="sec-t">Lentes</div>
    <table class="d">
      ${fila('Tipo:', ot.tipoLente)}
      ${fila('Material:', ot.materialLente)}
      ${fila('Tratamiento:', ot.tratamientoLente)}
      ${fila('Laboratorio:', ot.laboratorio)}
    </table>
  </div>

  <div class="sec">
    <div class="sec-t">Montura</div>
    <table class="d">
      ${fila('Tipo:', ot.tipoMontura)}
      ${fila('Marca:', ot.marcaMontura)}
      ${fila('Modelo:', ot.modeloMontura)}
      ${fila('Color:', ot.colorMontura)}
    </table>
  </div>

  ${(ot.observaciones || ot.notas) ? `
  <div class="sec">
    <div class="sec-t">Observaciones / Notas</div>
    ${ot.observaciones ? `<p style="margin:4px 0">${ot.observaciones}</p>` : ''}
    ${ot.notas        ? `<p style="margin:4px 0">${ot.notas}</p>`         : ''}
  </div>` : ''}

  <hr class="thick">

  <div class="sec">
    <div class="sec-t">Resumen financiero</div>
    <table class="t">
      ${subtotal > 0 ? `<tr><td>Subtotal:</td><td>${mn(subtotal)}</td></tr>` : ''}
      <tr><td>ITBIS:</td><td>${itbis > 0 ? mn(itbis) : 'Exento'}</td></tr>
      <tr class="tr-tot"><td>TOTAL:</td><td>${mn(total)}</td></tr>
      ${abono > 0 ? `<tr><td>Anticipo pagado:</td><td>${mn(abono)}</td></tr>` : ''}
      ${balance > 0
        ? `<tr class="tr-sal"><td>Saldo pendiente:</td><td>${mn(balance)}</td></tr>`
        : total > 0 ? `<tr class="tr-pag"><td>Estado de pago:</td><td>&#10003; Pagado</td></tr>` : ''}
    </table>
  </div>

  <div class="sigs">
    <div class="sig"><div class="sig-l"></div>Firma del cliente</div>
    <div class="sig"><div class="sig-l"></div>Técnico / Óptico</div>
  </div>

  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  w.document.close();
}

// ── Modal Recibo de Entrega ───────────────────────────────────────────────────

function ReciboEntregaModal({ open, data, onClose }: { open: boolean; data: any; onClose: () => void }) {
  if (!data) return null;
  const { ot, montoCobrado, metodoPago } = data;
  const abonoAnterior = Number(ot.total ?? 0) - Number(ot.balance ?? 0);

  const handlePrint = () => {
    const content = document.getElementById('recibo-entrega-print');
    if (!content) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Recibo Entrega ${ot.numero}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;max-width:400px;margin:0 auto}
      h2,h3{text-align:center;margin:4px 0}hr{border:1px solid #000}
      table{width:100%;border-collapse:collapse}
      td{padding:4px 0}td:last-child{text-align:right}
      .total{font-weight:bold;font-size:16px}.footer{text-align:center;margin-top:16px;font-size:12px}
      </style></head><body>`);
    w.document.write(content.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  return (
    <Modal
      title="Recibo de Entrega"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="print" icon={<PrinterOutlined />} onClick={handlePrint}>Imprimir</Button>,
        <Button key="close" type="primary" onClick={onClose}>Cerrar</Button>,
      ]}
      width={420}
    >
      <div id="recibo-entrega-print">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: '0 0 4px' }}>RECIBO DE ENTREGA</h2>
          <h3 style={{ margin: 0, color: '#555' }}>{ot.numero}</h3>
          <div style={{ marginTop: 4, color: '#888', fontSize: 13 }}>{dayjs().format('DD/MM/YYYY HH:mm')}</div>
        </div>
        <hr style={{ borderColor: '#ddd' }} />
        <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
          <Descriptions.Item label="Paciente">{ot.pacienteNombre ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Laboratorio">{ot.laboratorio ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Tipo de lente">{ot.tipoLente ?? '—'}</Descriptions.Item>
        </Descriptions>
        <hr style={{ borderColor: '#ddd', margin: '8px 0' }} />
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Total orden">
            <Text strong>{fmt.money(ot.total ?? 0)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Abono anterior">
            {fmt.money(abonoAnterior)}
          </Descriptions.Item>
          <Descriptions.Item label="Cobrado en entrega">
            <Text strong style={{ color: '#1677ff' }}>{fmt.money(montoCobrado)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Método de pago">
            {METODO_PAGO_OPS.find(m => m.value === metodoPago)?.label ?? metodoPago}
          </Descriptions.Item>
          <Descriptions.Item label="Balance final">
            <Text strong style={{ color: '#52c41a' }}>RD$0.00 ✓</Text>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#888' }}>
          ¡Gracias por su preferencia!
        </div>
      </div>
    </Modal>
  );
}

// ── Modal Entregar OT ─────────────────────────────────────────────────────────

function EntregarModal({ open, ot, onClose, onSuccess }: {
  open: boolean; ot: any; onClose: () => void; onSuccess: (result: any) => void;
}) {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const balance    = Number(ot?.balance ?? 0);
  const saldoCero  = balance <= 0;

  const entregarMut = useMutation({
    mutationFn: (v: any) => opticaApi.entregarOrden(ot.id, v),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
      message.success('Entrega registrada');
      form.resetFields();
      onSuccess(result);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al registrar entrega');
    },
  });

  const onOpen = () => {
    form.setFieldsValue({ montoCobrado: balance, metodoPago: 'efectivo' });
  };

  const confirmarSaldoCero = () => {
    entregarMut.mutate({ montoCobrado: 0, metodoPago: 'efectivo' });
  };

  return (
    <Modal
      title={`Registrar Entrega — ${ot?.numero ?? ''}`}
      open={open} onCancel={onClose} footer={null} width={480}
      afterOpenChange={v => v && onOpen()}
    >
      {/* Resumen de la OT */}
      <div style={{
        background: token.colorFillTertiary,
        borderRadius: token.borderRadiusLG,
        padding: '12px 16px',
        marginBottom: 20,
      }}>
        <Row gutter={[8, 4]}>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Paciente</Text>
            <div><Text strong>{ot?.pacienteNombre ?? '—'}</Text></div>
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Total orden</Text>
            <div><Text strong>{fmt.money(ot?.total ?? 0)}</Text></div>
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Adelanto pagado</Text>
            <div><Text>{fmt.money(Number(ot?.total ?? 0) - balance)}</Text></div>
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Saldo pendiente</Text>
            <div>
              <Text strong style={{ color: balance > 0 ? '#f5222d' : '#52c41a', fontSize: 16 }}>
                {balance > 0 ? fmt.money(balance) : <><CheckCircleOutlined /> Pagado</>}
              </Text>
            </div>
          </Col>
        </Row>
      </div>

      {saldoCero ? (
        <>
          <Text type="secondary">Esta orden no tiene saldo pendiente. Al confirmar se marcará como Entregada.</Text>
          <Row justify="end" gutter={8} style={{ marginTop: 20 }}>
            <Col><Button onClick={onClose}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" icon={<GiftOutlined />}
                onClick={confirmarSaldoCero} loading={entregarMut.isPending}>
                Confirmar Entrega
              </Button>
            </Col>
          </Row>
        </>
      ) : (
        <Form form={form} layout="vertical" onFinish={v => entregarMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="montoCobrado" label="Monto a cobrar" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true }]}>
                <Select options={METODO_PAGO_OPS} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas (opcional)">
                <Input.TextArea rows={2} placeholder="Observaciones sobre la entrega..." />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={onClose}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" icon={<GiftOutlined />} loading={entregarMut.isPending}>
                Confirmar Entrega
              </Button>
            </Col>
          </Row>
        </Form>
      )}
    </Modal>
  );
}

// ── Modal Facturar OT ─────────────────────────────────────────────────────────

function FacturarModal({ open, ot, onClose, onSuccess }: {
  open: boolean; ot: any; onClose: () => void; onSuccess: (pf: any) => void;
}) {
  const [form] = Form.useForm();
  const [clienteSearch, setClienteSearch] = useState('');

  const { data: clientesData, isFetching: clientesFetching } = useQuery({
    queryKey: ['clientes-search', clienteSearch],
    queryFn: () => clientesApi.list(1, 50, clienteSearch),
    enabled: open,
    staleTime: 10_000,
  });

  const facturarMut = useMutation({
    mutationFn: (v: any) => opticaApi.facturarOrden(ot.id, v.clienteId, v.tipoNcf),
    onSuccess: (pf) => {
      message.success('Pre-factura generada correctamente');
      form.resetFields();
      onSuccess(pf);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al generar pre-factura');
    },
  });

  const clienteOpts = ((clientesData as any)?.data ?? clientesData ?? []).map((c: any) => ({
    value: c.id, label: `${c.nombre}${c.rncReceptor ? ` — ${c.rncReceptor}` : ''}`,
  }));

  return (
    <Modal
      title={`Generar pre-factura — OT ${ot?.numero ?? ''}`}
      open={open} onCancel={onClose} footer={null} width={460}
    >
      <Form form={form} layout="vertical" onFinish={(v) => facturarMut.mutate(v)}
        initialValues={{ tipoNcf: 'E32' }}
      >
        <Form.Item name="clienteId" label="Cliente ERP" rules={[{ required: true, message: 'Selecciona el cliente' }]}>
          <Select
            showSearch
            filterOption={false}
            onSearch={setClienteSearch}
            loading={clientesFetching}
            options={clienteOpts}
            placeholder="Buscar cliente..."
            notFoundContent={clientesFetching ? 'Buscando...' : 'Sin resultados'}
          />
        </Form.Item>
        <Form.Item name="tipoNcf" label="Tipo NCF">
          <Select options={TIPO_NCF_OPS} />
        </Form.Item>
        <Row justify="end" gutter={8}>
          <Col><Button onClick={onClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={facturarMut.isPending} icon={<DollarOutlined />}>
              Generar pre-factura
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Shared modal de edición ───────────────────────────────────────────────────

function OrdenModal({ open, editing, form, pacienteOpts, saveMut, onClose, onPrint }: any) {
  return (
    <Modal
      title={editing ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
      open={open} onCancel={onClose} footer={null} width={680}
    >
      <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={pacienteOpts} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="recetaId" label="Receta (ID)">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: 'Selecciona la fecha' }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="fechaEntrega" label="Fecha entrega estimada">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          {editing && (
            <Col xs={24} sm={12}>
              <Form.Item name="estado" label="Estado">
                <Select options={ESTADO_OPS} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item name="tipoMontura" label="Tipo de montura">
              <Input placeholder="Marco completo, sin aro..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="marcaMontura" label="Marca">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="modeloMontura" label="Modelo">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="colorMontura" label="Color">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="tipoLente" label="Tipo de lente">
              <Input placeholder="Monofocal, bifocal, progresivo..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="materialLente" label="Material">
              <Input placeholder="CR-39, policarbonato..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="tratamientoLente" label="Tratamiento">
              <Input placeholder="Antirreflejo, fotocromático..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="laboratorio" label="Laboratorio">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="subtotal" label="Subtotal">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="itbis" label="ITBIS">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="total" label="Total">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="abono" label="Anticipo">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="observaciones" label="Observaciones">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="notas" label="Notas">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row justify="space-between" gutter={8} style={{ marginTop: 4 }}>
          <Col>
            {editing && (
              <Button icon={<PrinterOutlined />} onClick={() => onPrint?.(editing)}>
                Imprimir OT
              </Button>
            )}
          </Col>
          <Col>
            <Space>
              <Button onClick={onClose}>Cancelar</Button>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear orden'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Vista Kanban ──────────────────────────────────────────────────────────────

function KanbanView({ ordenes, moveMut, openEdit, openFacturar, openEntregar, openPrint }: any) {
  const { token } = theme.useToken();

  const byEstado = ESTADOS.reduce<Record<string, any[]>>((acc, est) => {
    acc[est] = ordenes.filter((o: any) => o.estado === est);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Row gutter={12} style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 8 }}>
      {ESTADOS.map(estado => (
        <Col key={estado} style={{ minWidth: 240, flex: '0 0 240px' }}>
          <div style={{
            background: token.colorFillTertiary,
            borderRadius: token.borderRadius,
            padding: '8px 0',
          }}>
            <div style={{
              padding: '6px 12px 10px',
              borderBottom: `3px solid ${KANBAN_HEADER[estado]}`,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Text strong style={{ fontSize: 13 }}>{ESTADO_LABEL[estado]}</Text>
              <Badge count={byEstado[estado].length} color={KANBAN_HEADER[estado]} />
            </div>

            <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byEstado[estado].map((o: any) => (
                <Card
                  key={o.id}
                  size="small"
                  hoverable
                  onClick={() => openEdit(o)}
                  style={{ cursor: 'pointer', borderLeft: `3px solid ${KANBAN_HEADER[estado]}` }}
                  styles={{ body: { padding: '8px 10px' } }}
                >
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{o.numero}</Text>
                  <Text style={{ fontSize: 12 }}>{o.pacienteNombre ?? '—'}</Text>
                  {o.tipoLente && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{o.tipoLente}</Text>
                  )}
                  <Row justify="space-between" style={{ marginTop: 4 }}>
                    {o.total ? (
                      <Text style={{ fontSize: 11 }}>{fmt.money(o.total)}</Text>
                    ) : null}
                    {Number(o.balance) > 0 ? (
                      <Text style={{ fontSize: 11, color: '#f5222d' }}>Saldo: {fmt.money(o.balance)}</Text>
                    ) : o.total ? (
                      <Text style={{ fontSize: 11, color: '#52c41a' }}><CheckCircleOutlined /> Pagado</Text>
                    ) : null}
                  </Row>
                  {o.fechaEntrega && (() => {
                    const diff = dayjs(o.fechaEntrega).diff(dayjs(), 'day');
                    const color = diff < 0 ? '#f5222d' : diff === 0 ? '#fa8c16' : diff <= 2 ? '#faad14' : token.colorTextSecondary;
                    const label = diff < 0 ? `Vencida hace ${Math.abs(diff)}d` : diff === 0 ? 'Entrega hoy' : `Entrega en ${diff}d`;
                    return (
                      <Text style={{ fontSize: 10, color, display: 'block', marginTop: 2 }}>
                        <ClockCircleOutlined style={{ marginRight: 2 }} />{label}
                      </Text>
                    );
                  })()}
                  <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ESTADOS.indexOf(estado) < ESTADOS.length - 1 && estado !== 'lista' && (
                      <Button
                        size="small" type="primary" ghost
                        style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                        onClick={e => { e.stopPropagation(); moveMut.mutate({ id: o.id, estado: ESTADOS[ESTADOS.indexOf(estado) + 1] }); }}
                        loading={moveMut.isPending}
                      >
                        → {ESTADO_LABEL[ESTADOS[ESTADOS.indexOf(estado) + 1]]}
                      </Button>
                    )}
                    {estado === 'lista' && (
                      <Button
                        size="small" type="primary"
                        icon={<GiftOutlined />}
                        style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                        onClick={e => { e.stopPropagation(); openEntregar(o); }}
                      >
                        Entregar
                      </Button>
                    )}
                    {(estado === 'lista' || estado === 'entregada') && !o.facturaId && (
                      <Tooltip title="Generar pre-factura ERP">
                        <Button
                          size="small" type="default"
                          icon={<DollarOutlined />}
                          style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                          onClick={e => { e.stopPropagation(); openFacturar(o); }}
                        />
                      </Tooltip>
                    )}
                    {o.facturaId && (
                      <Tag color="green" style={{ fontSize: 10, height: 20, lineHeight: '18px', margin: 0 }}>
                        Facturado
                      </Tag>
                    )}
                    <Tooltip title="Imprimir OT">
                      <Button
                        size="small"
                        icon={<PrinterOutlined />}
                        style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                        onClick={e => { e.stopPropagation(); openPrint(o); }}
                      />
                    </Tooltip>
                  </div>
                </Card>
              ))}
              {byEstado[estado].length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block', padding: '12px 0' }}>
                  Sin órdenes
                </Text>
              )}
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ── Vista tabla ───────────────────────────────────────────────────────────────

function TablaView({ ordenes, isLoading, search, setSearch, filtroEstado, setFiltro, token, openEdit, openFacturar, openEntregar, openPrint, filterColumns, visibleColumns, updateVisibility, exportar }: any) {
  const rows = ordenes.filter((o: any) =>
    `${o.pacienteNombre ?? ''} ${o.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{ESTADO_LABEL[v] ?? v}</Tag>,
    },
    { title: 'Lente', dataIndex: 'tipoLente', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Laboratorio', dataIndex: 'laboratorio', width: 130, render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Saldo', dataIndex: 'balance', width: 120, align: 'right' as const,
      render: (v: any, r: any) => {
        const bal = Number(v ?? 0);
        if (bal > 0) return <span style={{ color: '#f5222d', fontWeight: 600 }}>{fmt.money(bal)}</span>;
        if (r.total) return <span style={{ color: '#52c41a' }}><CheckCircleOutlined /> Pagado</span>;
        return '—';
      },
    },
    {
      title: 'Entrega', dataIndex: 'fechaEntrega', width: 110,
      render: (v: string, r: any) => {
        if (r.estado === 'entregada' && v) return <span style={{ color: '#52c41a' }}>{fmt.date(v)}</span>;
        if (!v) return '—';
        const diff = dayjs(v).diff(dayjs(), 'day');
        const color = diff < 0 ? '#f5222d' : diff <= 1 ? '#fa8c16' : undefined;
        return <span style={color ? { color } : {}}>{fmt.date(v)}</span>;
      },
    },
    {
      title: 'Factura', dataIndex: 'facturaId', width: 90, align: 'center' as const,
      render: (v: any) => v ? <Tag color="green">Facturado</Tag> : '—',
    },
    {
      title: '', key: 'acc', width: 120, align: 'right' as const,
      render: (_: any, r: any) => {
        const items: any[] = [];
        if (r.estado !== 'entregada' && r.estado !== 'cancelada') {
          items.push({
            key: 'entregar',
            label: 'Registrar Entrega',
            icon: <GiftOutlined />,
            onClick: () => openEntregar(r),
          });
        }
        if (!r.facturaId && (r.estado === 'lista' || r.estado === 'entregada')) {
          items.push({
            key: 'facturar',
            label: 'Facturar',
            icon: <DollarOutlined />,
            onClick: () => openFacturar(r),
          });
        }
        items.push({
          key: 'print',
          label: 'Imprimir OT',
          icon: <PrinterOutlined />,
          onClick: () => openPrint(r),
        });
        return <TableActions onView={() => openEdit(r)} viewLabel="Editar" items={items} />;
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Input
            placeholder="Buscar..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search} onChange={e => setSearch(e.target.value)}
            allowClear style={{ width: 220 }}
          />
          <Select
            placeholder="Estado" allowClear value={filtroEstado}
            onChange={v => setFiltro(v)} options={ESTADO_OPS} style={{ width: 150 }}
          />
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['optica-ordenes']} />
          <VideoTutorialButton />
        </div>
      </div>
      <Table columns={filterColumns(cols as any)} dataSource={rows} rowKey="id" loading={isLoading}
        size="small" scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
    </>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function OrdenesTrabajoOpticaPage() {
  const { token } = theme.useToken();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [open, setOpen]               = useState(false);
  const [editing, setEditing]         = useState<any>(null);
  const [search, setSearch]           = useState('');
  const [filtroEstado, setFiltro]     = useState<string | undefined>(undefined);
  const [facturarOt, setFacturarOt]   = useState<any>(null);
  const [entregarOt, setEntregarOt]   = useState<any>(null);
  const [reciboData, setReciboData]   = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // Prefill desde URL params (quick-link desde receta)
  useEffect(() => {
    const pacienteId = searchParams.get('pacienteId');
    const recetaId   = searchParams.get('recetaId');
    if (pacienteId) {
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        pacienteId: Number(pacienteId),
        fecha: dayjs(),
        ...(recetaId ? { recetaId: Number(recetaId) } : {}),
      });
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: ordenesData, isLoading } = useQuery({
    queryKey: ['optica-ordenes', filtroEstado],
    queryFn: () => opticaApi.ordenes({ limit: 500, estado: filtroEstado }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });

  const ordenes   = (ordenesData?.data ?? ordenesData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];
  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('optica-ordenes', COLS_DEF);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldValue('fecha', dayjs()); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : dayjs(), fechaEntrega: r.fechaEntrega ? dayjs(r.fechaEntrega) : undefined }); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        fecha: v.fecha ? dayjs(v.fecha).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        fechaEntrega: v.fechaEntrega ? dayjs(v.fechaEntrega).format('YYYY-MM-DD') : undefined,
      };
      return editing ? opticaApi.actualizarOrden(editing.id, payload) : opticaApi.crearOrden(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
      message.success(editing ? 'Orden actualizada' : 'Orden creada');
      closeModal();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar orden');
    },
  });

  const moveMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      opticaApi.actualizarOrden(id, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al actualizar estado');
    },
  });

  const handleFacturarSuccess = (pf: any) => {
    setFacturarOt(null);
    qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
    Modal.confirm({
      title: 'Pre-factura generada',
      content: `Se creó la pre-factura ${pf.folio ?? '#' + pf.id}. ¿Deseas ir a verla ahora?`,
      okText: 'Ver pre-factura',
      cancelText: 'Quedarme aquí',
      onOk: () => nav('/pre-facturas'),
    });
  };

  const handleEntregarSuccess = (result: any) => {
    setReciboData({ ot: entregarOt, montoCobrado: result.montoCobrado, metodoPago: result.metodoPago });
    setEntregarOt(null);
  };

  const exportar = () => {
    const filas = ordenes.map((r: any) => ({
      'N°': r.numero ?? '',
      'Paciente': r.pacienteNombre ?? '',
      'Estado': ESTADO_LABEL[r.estado] ?? r.estado ?? '',
      'Lente': r.tipoLente ?? '',
      'Laboratorio': r.laboratorio ?? '',
      'Total': r.total ?? 0,
      'Saldo': r.balance ?? 0,
      'Entrega': r.fechaEntrega ?? '',
    }));
    exportarExcel(filas, `Ordenes-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Órdenes de Trabajo</Title>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nueva orden
          </Button>
        }
      >
        <Tabs
          defaultActiveKey="kanban"
          items={[
            {
              key: 'kanban',
              label: <Space><AppstoreOutlined />Kanban</Space>,
              children: (
                <KanbanView
                  ordenes={ordenes} moveMut={moveMut}
                  openEdit={openEdit}
                  openFacturar={(o: any) => setFacturarOt(o)}
                  openEntregar={(o: any) => setEntregarOt(o)}
                  openPrint={imprimirOT}
                />
              ),
            },
            {
              key: 'tabla',
              label: <Space><TableOutlined />Tabla</Space>,
              children: (
                <TablaView
                  ordenes={ordenes} isLoading={isLoading}
                  search={search} setSearch={setSearch}
                  filtroEstado={filtroEstado} setFiltro={setFiltro}
                  token={token} openEdit={openEdit}
                  openFacturar={(o: any) => setFacturarOt(o)}
                  openEntregar={(o: any) => setEntregarOt(o)}
                  openPrint={imprimirOT}
                  filterColumns={filterColumns} visibleColumns={visibleColumns}
                  updateVisibility={updateVisibility} exportar={exportar}
                />
              ),
            },
          ]}
        />
      </Card>

      <OrdenModal
        open={open} editing={editing} form={form}
        pacienteOpts={pacienteOpts} saveMut={saveMut} onClose={closeModal}
        onPrint={imprimirOT}
      />

      {facturarOt && (
        <FacturarModal
          open={!!facturarOt}
          ot={facturarOt}
          onClose={() => setFacturarOt(null)}
          onSuccess={handleFacturarSuccess}
        />
      )}

      {entregarOt && (
        <EntregarModal
          open={!!entregarOt}
          ot={entregarOt}
          onClose={() => setEntregarOt(null)}
          onSuccess={handleEntregarSuccess}
        />
      )}

      <ReciboEntregaModal
        open={!!reciboData}
        data={reciboData}
        onClose={() => setReciboData(null)}
      />
    </div>
  );
}

