import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Tag, message, Dropdown, Space } from 'antd';
import { PlusOutlined, EllipsisOutlined, DollarOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const ESTADO_COLOR: Record<string, string> = { activo: 'green', pausado: 'orange', cancelado: 'red' };
const PERIODICIDAD = ['mensual','trimestral','semestral','anual'];

const COLS_DEF = [
  { key: 'expediente', label: 'Expediente', defaultVisible: true },
  { key: 'cliente', label: 'Cliente', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'periodicidad', label: 'Periodicidad', defaultVisible: true },
  { key: 'montoMensual', label: 'Monto mensual', defaultVisible: true },
  { key: 'horasIncluidas', label: 'Horas incluidas', defaultVisible: true },
  { key: 'fechaInicio', label: 'Inicio', defaultVisible: true },
  { key: 'fechaFin', label: 'Fin', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

export default function RetainersPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPago, setModalPago] = useState<{ retainerId: number } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [formPago] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('sp-retainers', COLS_DEF);

  const { data = [], isLoading } = useQuery({ queryKey: ['sp-retainers'], queryFn: () => serviciosProApi.getRetainers({}) });
  const arr = Array.isArray(data) ? data : [];
  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });

  const crearMut = useMutation({
    mutationFn: (body: any) => editId ? serviciosProApi.actualizarRetainer(editId, body) : serviciosProApi.crearRetainer(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-retainers'] });
      message.success(editId ? 'Retainer actualizado' : 'Retainer creado');
      setModalOpen(false); form.resetFields(); setEditId(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const pagoMut = useMutation({
    mutationFn: ({ retainerId, body }: { retainerId: number; body: any }) => serviciosProApi.registrarPagoRetainer(retainerId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-retainers'] });
      message.success('Pago registrado');
      setModalPago(null); formPago.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (r: any) => {
    setEditId(r.id);
    form.setFieldsValue({ ...r, fechaInicio: r.fechaInicio ? dayjs(r.fechaInicio) : null, fechaFin: r.fechaFin ? dayjs(r.fechaFin) : null });
    setModalOpen(true);
  };

  const exportar = () => {
    const filas = arr.map((r: any) => ({
      'Expediente': r.expedienteNombre ?? '',
      'Cliente': r.clienteNombre ?? '',
      'Estado': r.estado,
      'Periodicidad': r.periodicidad,
      'Monto mensual': r.montoMensual,
      'Horas incluidas': r.horasIncluidas,
      'Inicio': r.fechaInicio ? dayjs(r.fechaInicio).format('DD/MM/YYYY') : '',
      'Fin': r.fechaFin ? dayjs(r.fechaFin).format('DD/MM/YYYY') : '',
    }));
    exportarExcel(filas, `Retainers-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const columns = [
    { key: 'expediente', title: 'Expediente', render: (_: any, r: any) => <span style={{ fontWeight: 600 }}>{r.expedienteNombre ?? '—'}</span> },
    { key: 'cliente', title: 'Cliente', render: (_: any, r: any) => r.clienteNombre ?? '—' },
    { key: 'estado', title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { key: 'periodicidad', title: 'Periodicidad', dataIndex: 'periodicidad' },
    { key: 'montoMensual', title: 'Monto mensual', dataIndex: 'montoMensual', render: (v: number) => `RD$${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
    { key: 'horasIncluidas', title: 'Horas incluidas', dataIndex: 'horasIncluidas', render: (v: number) => v ? `${v}h` : '—' },
    { key: 'fechaInicio', title: 'Inicio', dataIndex: 'fechaInicio', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    { key: 'fechaFin', title: 'Fin', dataIndex: 'fechaFin', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    {
      title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<DollarOutlined />} onClick={() => setModalPago({ retainerId: r.id })} title="Registrar pago" />
          <Dropdown menu={{ items: [{ key: 'editar', label: 'Editar', onClick: () => openEditar(r) }] }} trigger={['click']}>
            <Button size="small" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>🔄 Retainers</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['sp-retainers']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>Nuevo Retainer</Button>
        </div>
      </div>

      <Table dataSource={arr} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      {/* Modal crear/editar */}
      <Modal open={modalOpen} title={editId ? 'Editar Retainer' : 'Nuevo Retainer'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fechaInicio: v.fechaInicio?.format('YYYY-MM-DD'), fechaFin: v.fechaFin?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="montoMensual" label="Monto mensual" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} prefix="RD$" /></Form.Item>
            <Form.Item name="periodicidad" label="Periodicidad" initialValue="mensual">
              <Select>{PERIODICIDAD.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}</Select>
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="horasIncluidas" label="Horas incluidas"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="estado" label="Estado" initialValue="activo">
              <Select>
                <Select.Option value="activo">Activo</Select.Option>
                <Select.Option value="pausado">Pausado</Select.Option>
                <Select.Option value="cancelado">Cancelado</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="fechaInicio" label="Fecha inicio" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fechaFin" label="Fecha fin"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal pago */}
      <Modal open={!!modalPago} title="Registrar Pago de Retainer"
        onCancel={() => { setModalPago(null); formPago.resetFields(); }}
        onOk={() => formPago.validateFields().then(v => pagoMut.mutate({ retainerId: modalPago!.retainerId, body: { ...v, fechaPago: v.fechaPago?.format('YYYY-MM-DD'), periodo: v.periodo?.format('YYYY-MM') } }))}
        confirmLoading={pagoMut.isPending}>
        <Form form={formPago} layout="vertical">
          <Form.Item name="monto" label="Monto pagado" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} prefix="RD$" /></Form.Item>
          <Form.Item name="fechaPago" label="Fecha de pago" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} defaultValue={dayjs()} /></Form.Item>
          <Form.Item name="periodo" label="Periodo (mes)"><DatePicker picker="month" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="metodoPago" label="Método de pago">
            <Select allowClear><Select.Option value="transferencia">Transferencia</Select.Option><Select.Option value="efectivo">Efectivo</Select.Option><Select.Option value="cheque">Cheque</Select.Option></Select>
          </Form.Item>
          <Form.Item name="referencia" label="Referencia"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
