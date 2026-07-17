import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Tabs, Table, Tag, Button, Descriptions, Statistic, Row, Col, Spin,
  Modal, Form, InputNumber, DatePicker, Select, Input, message, Progress, theme
} from 'antd';
import { ArrowLeft, FileText, DollarSign, Plus } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const estadoColor: Record<string, string> = { al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default', refinanciado: 'purple' };
const cuotaColor: Record<string, string> = { pendiente: 'default', pagada: 'green', vencida: 'red', pagada_parcial: 'orange' };

function VehiculoDetalle({ vehiculoId }: { vehiculoId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prestamista-vehiculo', vehiculoId],
    queryFn: () => prestamistalApi.getVehiculo(vehiculoId),
  });
  if (isLoading) return <Spin size="small" />;
  if (!data) return <div>Vehículo no encontrado</div>;
  const v: any = data;
  const hoy = new Date();
  const vence = v.fechaVencePoliza ? new Date(v.fechaVencePoliza) : null;
  const dias = vence ? Math.ceil((vence.getTime() - hoy.getTime()) / 86400000) : null;
  const polizaTag = !vence ? null
    : dias! < 0 ? <Tag color="red">Póliza vencida hace {Math.abs(dias!)}d</Tag>
    : dias! <= 30 ? <Tag color="orange">Vence en {dias}d</Tag>
    : <Tag color="green">Vigente hasta {vence.toLocaleDateString('es-DO')}</Tag>;

  return (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
      <Descriptions.Item label="Placa"><b>{v.placa ?? '—'}</b></Descriptions.Item>
      <Descriptions.Item label="Chasis">{v.chasis ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Motor">{v.motor ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Marca">{v.marca ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Modelo">{v.modelo ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Año">{v.anio ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Color">{v.color ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Tipo">{v.tipoVehiculo ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Valor Mercado">{fmt(v.valorMercado)}</Descriptions.Item>
      <Descriptions.Item label="Valor Factura">{fmt(v.valorFactura)}</Descriptions.Item>
      <Descriptions.Item label="Aseguradora">{v.aseguradora ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="No. Póliza">{v.polizaSeguro ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Seguro">{polizaTag ?? '—'}</Descriptions.Item>
    </Descriptions>
  );
}

export default function DetallePrestamo() {
  const { token: C } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pagoOpen, setPagoOpen] = useState(false);
  const [garantiaOpen, setGarantiaOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [formPago] = Form.useForm();
  const [formGarantia] = Form.useForm();
  const [formCancelar] = Form.useForm();

  const { data: prestamo, isLoading } = useQuery({
    queryKey: ['prestamista-prestamo', id],
    queryFn: () => prestamistalApi.getPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: pagos = [] } = useQuery({
    queryKey: ['prestamista-pagos', id],
    queryFn: () => prestamistalApi.getPagosByPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['prestamista-garantias', id],
    queryFn: () => prestamistalApi.getGarantiasByPrestamo(Number(id)),
    enabled: !!id,
  });

  const registrarPago = useMutation({
    mutationFn: (vals: any) => prestamistalApi.registrarPago({ prestamoId: Number(id), ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-pagos', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-dashboard'] });
      setPagoOpen(false);
      formPago.resetFields();
      message.success('Pago registrado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar pago'),
  });

  const crearGarantia = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearGarantia({ prestamoId: Number(id), deudorId: prestamo?.deudorId, ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantias', id] });
      setGarantiaOpen(false);
      formGarantia.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar garantía'),
  });

  const cancelar = useMutation({
    mutationFn: (vals: any) => prestamistalApi.cancelarPrestamo(Number(id), vals.motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-prestamos'] });
      setCancelarOpen(false);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cancelar préstamo'),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  if (!prestamo) return <div style={{ padding: 24 }}>Préstamo no encontrado</div>;

  const cuotas: any[] = prestamo.cuotas ?? [];
  const pagado = Number(prestamo.montoPrincipal) - Number(prestamo.saldoCapital);
  const pctPagado = prestamo.montoPrincipal > 0 ? Math.round((pagado / Number(prestamo.montoPrincipal)) * 100) : 0;
  const activo = !['pagado', 'cancelado', 'refinanciado'].includes(prestamo.estado);

  const exportarCuotas = () => {
    const filas = cuotas.map((r: any) => ({
      '#': r.numeroCuota,
      'Vencimiento': r.fechaVencimiento?.slice(0, 10),
      'Capital': r.capitalCuota,
      'Interés': r.interesCuota,
      'Cuota Total': r.cuotaTotal,
      'Capital Pagado': r.capitalPagado,
      'Interés Pagado': r.interesPagado,
      'Mora': r.moraGenerada,
      'Días Mora': r.diasMora,
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Cuotas-${prestamo.numero}-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} cuotas exportadas`);
  };

  const exportarPagos = () => {
    const filas = (pagos as any[]).map((r: any) => ({
      'Número': r.numero,
      'Fecha': r.fechaPago?.slice(0, 10),
      'Total Pagado': r.montoPagado,
      'Capital': r.capitalAplicado,
      'Interés': r.interesAplicado,
      'Mora': r.moraAplicada,
      'Forma Pago': r.formaPago,
    }));
    exportarExcel(filas, `Pagos-${prestamo.numero}-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} pagos exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/prestamista/prestamos')}>Volver</Button>
        <h2 style={{ margin: 0, color: C.colorText }}>{prestamo.numero}</h2>
        <Tag color={estadoColor[prestamo.estado] ?? 'default'}>{prestamo.estado?.replace('_', ' ')}</Tag>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button icon={<FileText size={14} />} onClick={() => window.open(prestamistalApi.pdfAmortizacion(Number(id)), '_blank')}>PDF Amortización</Button>
          {activo && <Button type="primary" icon={<DollarSign size={14} />} onClick={() => setPagoOpen(true)}>Registrar Pago</Button>}
          {activo && <Button danger onClick={() => setCancelarOpen(true)}>Cancelar</Button>}
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Capital" value={fmt(prestamo.montoPrincipal)} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Saldo Capital" value={fmt(prestamo.saldoCapital)} valueStyle={{ color: C.colorWarning }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Saldo Interés" value={fmt(prestamo.saldoInteres)} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Mora" value={fmt(prestamo.saldoMora)} valueStyle={{ color: Number(prestamo.saldoMora) > 0 ? C.colorError : undefined }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Saldo Total" value={fmt(prestamo.saldoTotal)} valueStyle={{ color: C.colorError }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small">
          <div style={{ fontSize: 12, color: C.colorTextSecondary, marginBottom: 4 }}>Avance Pago</div>
          <Progress percent={pctPagado} size="small" status={pctPagado === 100 ? 'success' : 'active'} />
        </Card></Col>
      </Row>

      <Tabs items={[
        {
          key: 'info',
          label: 'Información',
          children: (
            <Card>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
                <Descriptions.Item label="Deudor">{prestamo.deudorNombre}</Descriptions.Item>
                <Descriptions.Item label="Producto">{prestamo.productoNombre}</Descriptions.Item>
                <Descriptions.Item label="Método Amortización">{prestamo.metodoAmortizacion}</Descriptions.Item>
                <Descriptions.Item label="Tasa Mensual">{prestamo.tasaInteresMensual}%</Descriptions.Item>
                <Descriptions.Item label="Plazo">{prestamo.plazoMeses} meses</Descriptions.Item>
                <Descriptions.Item label="Frecuencia Pago">{prestamo.frecuenciaPago}</Descriptions.Item>
                <Descriptions.Item label="Cuota Periódica">{fmt(prestamo.cuotaPeriodica)}</Descriptions.Item>
                <Descriptions.Item label="Fecha Desembolso">{prestamo.fechaDesembolso?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Primer Pago">{prestamo.fechaPrimerPago?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Vencimiento">{prestamo.fechaVencimiento?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Días Mora Actual">{prestamo.diasMoraActual ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Cuotas Vencidas">{prestamo.cuotasVencidas ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Total Pagado">{fmt(prestamo.totalPagado)}</Descriptions.Item>
                <Descriptions.Item label="Total Interés Pagado">{fmt(prestamo.totalInteresPagado)}</Descriptions.Item>
                <Descriptions.Item label="Total Mora Pagada">{fmt(prestamo.totalMoraPagada)}</Descriptions.Item>
                {prestamo.observaciones && <Descriptions.Item label="Observaciones" span={3}>{prestamo.observaciones}</Descriptions.Item>}
              </Descriptions>
            </Card>
          ),
        },
        {
          key: 'cuotas',
          label: `Cuotas (${cuotas.length})`,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 2 }}>
                <Button icon={<FileExcelOutlined />} onClick={exportarCuotas}>Excel</Button>
                <RefreshByKeyButton queryKey={['prestamista-prestamo']} />
                <VideoTutorialButton />
              </div>
              <Table
                dataSource={cuotas.map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: '#', dataIndex: 'numeroCuota', width: 50 },
                  { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
                  { title: 'Capital', dataIndex: 'capital', render: fmt },
                  { title: 'Interés', dataIndex: 'interes', render: fmt },
                  { title: 'Cuota Total', dataIndex: 'cuotaTotal', render: fmt },
                  { title: 'Capital Pag.', dataIndex: 'capitalPagado', render: fmt },
                  { title: 'Interés Pag.', dataIndex: 'interesPagado', render: fmt },
                  { title: 'Mora', dataIndex: 'moraGenerada', render: (v: any) => <span style={{ color: Number(v) > 0 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
                  { title: 'Días Mora', dataIndex: 'diasMora', render: (v: any) => v > 0 ? <Tag color="red">{v}</Tag> : 0 },
                  { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={cuotaColor[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag> },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'pagos',
          label: `Pagos (${(pagos as any[]).length})`,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 2 }}>
                <Button icon={<FileExcelOutlined />} onClick={exportarPagos}>Excel</Button>
                <RefreshByKeyButton queryKey={['prestamista-pagos']} />
                <VideoTutorialButton />
              </div>
              <Table
                dataSource={(pagos as any[]).map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'Número', dataIndex: 'numero', width: 110 },
                  { title: 'Fecha', dataIndex: 'fechaPago', render: (v: string) => v?.slice(0, 10) },
                  { title: 'Total Pagado', dataIndex: 'montoPagado', render: fmt },
                  { title: 'Capital', dataIndex: 'capitalAplicado', render: fmt },
                  { title: 'Interés', dataIndex: 'interesAplicado', render: fmt },
                  { title: 'Mora', dataIndex: 'moraAplicada', render: fmt },
                  { title: 'Forma Pago', dataIndex: 'formaPago' },
                  {
                    title: '', key: 'pdf', width: 70,
                    render: (_: any, r: any) => <Button size="small" icon={<FileText size={13} />} onClick={() => window.open(prestamistalApi.pdfRecibo(r.id), '_blank')} />,
                  },
                ]}
              />
            </div>
          ),
        },
        ...(prestamo.vehiculoId ? [{
          key: 'vehiculo',
          label: 'Vehículo',
          children: (
            <Card>
              <VehiculoDetalle vehiculoId={prestamo.vehiculoId} />
            </Card>
          ),
        }] : []),
        {
          key: 'garantias',
          label: `Garantías (${(garantias as any[]).length})`,
          children: (
            <div>
              <Button icon={<Plus size={14} />} style={{ marginBottom: 12 }} onClick={() => setGarantiaOpen(true)}>Agregar Garantía</Button>
              <Table
                dataSource={(garantias as any[]).map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'Tipo', dataIndex: 'tipo' },
                  { title: 'Descripción', dataIndex: 'descripcion' },
                  { title: 'Valor Tasado', dataIndex: 'valorTasado', render: fmt },
                  { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag>{v}</Tag> },
                  { title: 'Fecha Tasación', dataIndex: 'fechaTasacion', render: (v: string) => v?.slice(0, 10) },
                ]}
              />
            </div>
          ),
        },
      ]} />

      {/* Modal pago */}
      <Modal title="Registrar Pago" open={pagoOpen} onCancel={() => { setPagoOpen(false); formPago.resetFields(); }}
        onOk={() => formPago.validateFields().then(v => registrarPago.mutate(v))} okText="Registrar" confirmLoading={registrarPago.isPending}>
        <Form form={formPago} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="montoPagado" label="Monto a Pagar" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="RD$" min={0.01} />
          </Form.Item>
          <Form.Item name="fechaPago" label="Fecha de Pago" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="formaPago" label="Forma de Pago" initialValue="efectivo">
            <Select>
              <Option value="efectivo">Efectivo</Option>
              <Option value="transferencia">Transferencia</Option>
              <Option value="cheque">Cheque</Option>
              <Option value="tarjeta">Tarjeta</Option>
            </Select>
          </Form.Item>
          <Form.Item name="referencia" label="Referencia"><Input placeholder="N° cheque, transferencia..." /></Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal garantía */}
      <Modal title="Agregar Garantía" open={garantiaOpen} onCancel={() => { setGarantiaOpen(false); formGarantia.resetFields(); }}
        onOk={() => formGarantia.validateFields().then(v => crearGarantia.mutate(v))} okText="Guardar" confirmLoading={crearGarantia.isPending}>
        <Form form={formGarantia} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select>
              <Option value="inmueble">Inmueble</Option>
              <Option value="vehiculo">Vehículo</Option>
              <Option value="joya">Joya / Prenda</Option>
              <Option value="electrodomestico">Electrodoméstico</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="valorTasado" label="Valor Tasado (RD$)"><InputNumber style={{ width: '100%' }} prefix="RD$" /></Form.Item>
          <Form.Item name="fechaTasacion" label="Fecha Tasación"><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal cancelar */}
      <Modal title="Cancelar Préstamo" open={cancelarOpen} onCancel={() => setCancelarOpen(false)}
        onOk={() => formCancelar.validateFields().then(v => cancelar.mutate(v))} okText="Cancelar Préstamo" okButtonProps={{ danger: true }} confirmLoading={cancelar.isPending}>
        <Form form={formCancelar} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="motivo" label="Motivo de cancelación" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
