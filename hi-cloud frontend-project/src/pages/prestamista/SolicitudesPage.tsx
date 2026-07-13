import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Select, Tag, Modal, Form, Input, InputNumber, DatePicker, message, Descriptions, theme, AutoComplete } from 'antd';
import { Plus, Eye } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;

const estadoColor: Record<string, string> = {
  pendiente: 'blue', aprobada: 'green', rechazada: 'red', desembolsada: 'purple', cancelada: 'default',
};
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

const COLS_DEF = [
  { key: 'numero', label: 'Número', defaultVisible: true },
  { key: 'deudorNombre', label: 'Deudor', defaultVisible: true },
  { key: 'productoNombre', label: 'Producto', defaultVisible: true },
  { key: 'montoSolicitado', label: 'Monto', defaultVisible: true },
  { key: 'plazoMeses', label: 'Plazo', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'fechaSolicitud', label: 'Fecha', defaultVisible: true },
];

export default function SolicitudesPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [estado, setEstado] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [decidirOpen, setDecidirOpen] = useState(false);
  const [selectedProductoTipo, setSelectedProductoTipo] = useState<string>('personal');
  const [placaSearch, setPlacaSearch] = useState('');
  const [form] = Form.useForm();
  const [formDecision] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-solicitudes', COLS_DEF);

  const { data: solicitudesResp, isLoading } = useQuery({
    queryKey: ['prestamista-solicitudes', estado],
    queryFn: () => prestamistalApi.getSolicitudes(estado ? { estado } : {}),
  });
  const data: any[] = (solicitudesResp as any)?.data ?? solicitudesResp ?? [];

  const { data: deudores = [] } = useQuery({
    queryKey: ['prestamista-deudores-select'],
    queryFn: () => prestamistalApi.getDeudores({ limit: 999 }),
    select: (d: any) => d?.data ?? d ?? [],
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['prestamista-productos'],
    queryFn: prestamistalApi.getProductos,
  });

  const { data: vehiculosBusqueda = [] } = useQuery({
    queryKey: ['vehiculos-busca-placa', placaSearch],
    queryFn: () => prestamistalApi.buscarVehiculoPorPlaca(placaSearch),
    enabled: placaSearch.length >= 3,
    select: (d: any) => (Array.isArray(d) ? d : d?.data ?? []),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearSolicitud(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prestamista-solicitudes'] }); setOpen(false); form.resetFields(); setSelectedProductoTipo('personal'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear solicitud'),
  });

  const decidir = useMutation({
    mutationFn: ({ id, vals }: any) => prestamistalApi.decidirSolicitud(id, vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-solicitudes'] });
      setDecidirOpen(false);
      formDecision.resetFields();
      setDetalle(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar decisión'),
  });

  const openDetalle = async (id: number) => {
    const d = await prestamistalApi.getSolicitud(id);
    setDetalle(d);
    setDetalleOpen(true);
  };

  const cols = [
    { title: 'Número', dataIndex: 'numero', key: 'numero', width: 120 },
    { title: 'Deudor', dataIndex: 'deudorNombre', key: 'deudorNombre' },
    { title: 'Producto', dataIndex: 'productoNombre', key: 'productoNombre' },
    { title: 'Monto', dataIndex: 'montoSolicitado', key: 'montoSolicitado', render: fmt },
    { title: 'Plazo', dataIndex: 'plazoMeses', key: 'plazoMeses', render: (v: any) => `${v} meses` },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Fecha', dataIndex: 'fechaSolicitud', key: 'fechaSolicitud', render: (v: string) => v?.slice(0, 10) },
    {
      title: '', key: 'acc', width: 100,
      render: (_: any, r: any) => (
        <Button size="small" icon={<Eye size={13} />} onClick={() => openDetalle(r.id)}>Ver</Button>
      ),
    },
  ];

  const exportar = () => {
    const filas = (data as any[]).map((r: any) => ({
      'Número': r.numero,
      'Deudor': r.deudorNombre,
      'Producto': r.productoNombre,
      'Monto Solicitado': r.montoSolicitado,
      'Plazo (meses)': r.plazoMeses,
      'Estado': r.estado,
      'Fecha': r.fechaSolicitud?.slice(0, 10),
    }));
    exportarExcel(filas, `Solicitudes-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Solicitudes de Préstamo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-solicitudes']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Nueva Solicitud</Button>
        </div>
      </div>

      <Select style={{ marginBottom: 16, minWidth: 160 }} placeholder="Filtrar por estado" allowClear value={estado} onChange={setEstado}>
        {['pendiente', 'aprobada', 'rechazada', 'desembolsada', 'cancelada'].map(e => <Option key={e} value={e}>{e}</Option>)}
      </Select>

      <Table dataSource={(data as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={filterColumns(cols as any)}
        loading={isLoading} scroll={{ x: 'max-content' }} />

      {/* Modal nueva solicitud */}
      <Modal title="Nueva Solicitud de Préstamo" open={open} onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crear.mutate(v))} okText="Enviar Solicitud" width={600} confirmLoading={crear.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="deudorId" label="Deudor" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar deudor">
              {(deudores as any[]).map((d: any) => <Option key={d.id} value={d.id}>{d.nombre} {d.apellidos ?? ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="productoPrestamo" label="Producto de Préstamo" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="children"
              placeholder="Seleccionar producto"
              onChange={(val: number) => {
                const prod = (productos as any[]).find((p: any) => p.id === val);
                setSelectedProductoTipo(prod?.tipoCredito ?? 'personal');
                form.setFieldValue('vehiculoId', undefined);
              }}
            >
              {(productos as any[]).map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
            </Select>
          </Form.Item>
          {selectedProductoTipo === 'vehiculo' && (
            <Form.Item name="vehiculoId" label="Vehículo (buscar por placa)" rules={[{ required: true, message: 'Selecciona el vehículo a financiar' }]}>
              <AutoComplete
                options={(vehiculosBusqueda as any[]).map((v: any) => ({
                  value: v.id,
                  label: `${v.placa ?? v.chasis} — ${v.marca ?? ''} ${v.modelo ?? ''} ${v.anio ?? ''}`.trim(),
                }))}
                onSearch={v => setPlacaSearch(v)}
                placeholder="Escribir placa del vehículo..."
                filterOption={false}
              />
            </Form.Item>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="montoSolicitado" label="Monto Solicitado" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} prefix="RD$" min={1} />
            </Form.Item>
            <Form.Item name="plazoMeses" label="Plazo (meses)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="fechaSolicitud" label="Fecha Solicitud">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>
          <Form.Item name="proposito" label="Propósito del préstamo"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal detalle */}
      <Modal title={`Solicitud ${detalle?.numero ?? ''}`} open={detalleOpen} onCancel={() => { setDetalleOpen(false); setDetalle(null); }}
        width={640} footer={
          detalle?.estado === 'pendiente' ? [
            <Button key="cancel" onClick={() => { setDetalleOpen(false); setDetalle(null); }}>Cerrar</Button>,
            <Button key="reject" danger onClick={() => { formDecision.setFieldsValue({ decision: 'rechazar' }); setDecidirOpen(true); }}>Rechazar</Button>,
            <Button key="approve" type="primary" onClick={() => { formDecision.setFieldsValue({ decision: 'aprobar' }); setDecidirOpen(true); }}>Aprobar</Button>,
          ] : [<Button key="close" onClick={() => { setDetalleOpen(false); setDetalle(null); }}>Cerrar</Button>]
        }>
        {detalle && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Número">{detalle.numero}</Descriptions.Item>
            <Descriptions.Item label="Estado"><Tag color={estadoColor[detalle.estado]}>{detalle.estado}</Tag></Descriptions.Item>
            <Descriptions.Item label="Deudor">{detalle.deudorNombre}</Descriptions.Item>
            <Descriptions.Item label="Producto">{detalle.productoNombre}</Descriptions.Item>
            <Descriptions.Item label="Monto Solicitado">{fmt(detalle.montoSolicitado)}</Descriptions.Item>
            <Descriptions.Item label="Monto Aprobado">{fmt(detalle.montoAprobado)}</Descriptions.Item>
            <Descriptions.Item label="Plazo">{detalle.plazoMeses} meses</Descriptions.Item>
            <Descriptions.Item label="Tasa Mensual">{detalle.tasaAprobada ?? detalle.tasaSolicitada}%</Descriptions.Item>
            <Descriptions.Item label="Propósito" span={2}>{detalle.proposito ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Observaciones" span={2}>{detalle.observaciones ?? '—'}</Descriptions.Item>
            {detalle.motivoDecision && <Descriptions.Item label="Motivo Decisión" span={2}>{detalle.motivoDecision}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>

      {/* Modal decisión */}
      <Modal title="Registrar Decisión" open={decidirOpen} onCancel={() => setDecidirOpen(false)}
        onOk={() => formDecision.validateFields().then(v => decidir.mutate({ id: detalle?.id, vals: { ...v, decision: v.decision } }))}
        okText="Confirmar" confirmLoading={decidir.isPending}>
        <Form form={formDecision} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="decision" label="Decisión" rules={[{ required: true }]}>
            <Select>
              <Option value="aprobar">Aprobar</Option>
              <Option value="rechazar">Rechazar</Option>
            </Select>
          </Form.Item>
          <Form.Item name="montoAprobado" label="Monto Aprobado"><InputNumber style={{ width: '100%' }} prefix="RD$" /></Form.Item>
          <Form.Item name="tasaAprobada" label="Tasa Mensual Aprobada (%)"><InputNumber style={{ width: '100%' }} min={0} max={100} precision={3} /></Form.Item>
          <Form.Item name="motivoDecision" label="Motivo"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
