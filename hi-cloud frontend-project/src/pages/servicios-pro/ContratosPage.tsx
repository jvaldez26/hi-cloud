import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, InputNumber, Tag, message, Dropdown, Space } from 'antd';
import { PlusOutlined, EllipsisOutlined, FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const ESTADO_COLOR: Record<string, string> = { borrador: 'default', enviado: 'orange', firmado: 'green', cancelado: 'red' };
const TIPOS = ['honorarios','servicios','nda','acuerdo_pago','otro'];

const COLS_DEF = [
  { key: 'numero', label: 'Número', defaultVisible: true },
  { key: 'titulo', label: 'Título', defaultVisible: true },
  { key: 'expediente', label: 'Expediente', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'tipo', label: 'Tipo', defaultVisible: true },
  { key: 'valor', label: 'Monto', defaultVisible: true },
  { key: 'fechaInicio', label: 'Inicio', defaultVisible: true },
  { key: 'fechaVencimiento', label: 'Vence', defaultVisible: true },
  { key: 'acciones', label: 'Acciones', defaultVisible: true },
];

export default function ContratosPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('sp-contratos', COLS_DEF);

  const { data = [], isLoading } = useQuery({ queryKey: ['sp-contratos'], queryFn: () => serviciosProApi.getContratos({}) });
  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });
  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });

  const crearMut = useMutation({
    mutationFn: (body: any) => editId ? serviciosProApi.actualizarContrato(editId, body) : serviciosProApi.crearContrato(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-contratos'] });
      message.success(editId ? 'Contrato actualizado' : 'Contrato creado');
      setModalOpen(false); form.resetFields(); setEditId(null);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const firmadoMut = useMutation({
    mutationFn: (id: number) => serviciosProApi.marcarContratoFirmado(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-contratos'] }); message.success('Contrato marcado como firmado'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openEditar = (c: any) => {
    setEditId(c.id);
    form.setFieldsValue({ ...c, fechaInicio: c.fechaInicio ? dayjs(c.fechaInicio) : null, fechaVencimiento: c.fechaVencimiento ? dayjs(c.fechaVencimiento) : null });
    setModalOpen(true);
  };

  const exportar = () => {
    const filas = (Array.isArray(data) ? data : []).map((r: any) => ({
      'Número': r.numero,
      'Título': r.titulo,
      'Expediente': r.expedienteNombre ?? '',
      'Estado': r.estado,
      'Tipo': r.tipo,
      'Monto': r.valor,
      'Inicio': r.fechaInicio ? dayjs(r.fechaInicio).format('DD/MM/YYYY') : '',
      'Vence': r.fechaVencimiento ? dayjs(r.fechaVencimiento).format('DD/MM/YYYY') : '',
    }));
    exportarExcel(filas, `Contratos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const columns = [
    { key: 'numero', title: 'Número', dataIndex: 'numero', width: 110 },
    { key: 'titulo', title: 'Título', dataIndex: 'titulo', render: (v: string, r: any) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'expediente', title: 'Expediente', render: (_: any, r: any) => r.expedienteNombre ?? '—' },
    { key: 'estado', title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { key: 'tipo', title: 'Tipo', dataIndex: 'tipo', render: (v: string) => v?.replace(/_/g, ' ') ?? '' },
    { key: 'valor', title: 'Monto', dataIndex: 'valor', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { key: 'fechaInicio', title: 'Inicio', dataIndex: 'fechaInicio', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    { key: 'fechaVencimiento', title: 'Vence', dataIndex: 'fechaVencimiento', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    {
      title: '', key: 'acciones', width: 80,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => serviciosProApi.downloadContratoPdf(r.id)} title="PDF" />
          <Dropdown menu={{ items: [
            { key: 'editar', label: 'Editar', onClick: () => openEditar(r) },
            ...(r.estado !== 'firmado' ? [{ key: 'firmar', label: '✅ Marcar firmado', onClick: () => firmadoMut.mutate(r.id) }] : []),
          ]}} trigger={['click']}>
            <Button size="small" icon={<EllipsisOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📄 Contratos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['sp-contratos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>Nuevo Contrato</Button>
        </div>
      </div>

      <Table dataSource={Array.isArray(data) ? data : []} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal open={modalOpen} title={editId ? 'Editar Contrato' : 'Nuevo Contrato'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fechaInicio: v.fechaInicio?.format('YYYY-MM-DD'), fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending} width={680}>
        <Form form={form} layout="vertical">
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="profesionalId" label="Profesional responsable">
            <Select allowClear showSearch optionFilterProp="children">
              {(profesionales as any[]).map((p: any) => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tipo" label="Tipo">
            <Select>{TIPOS.map(t => <Select.Option key={t} value={t}>{t.replace(/_/g, ' ')}</Select.Option>)}</Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="fechaInicio" label="Fecha inicio" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fechaVencimiento" label="Fecha vencimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="valor" label="Monto total"><InputNumber style={{ width: '100%' }} min={0} prefix="RD$" /></Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="borrador">
            <Select>
              <Select.Option value="borrador">Borrador</Select.Option>
              <Select.Option value="enviado">Enviado</Select.Option>
              <Select.Option value="firmado">Firmado</Select.Option>
              <Select.Option value="cancelado">Cancelado</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="contenido" label="Cláusulas / Términos"><Input.TextArea rows={5} placeholder="Cláusulas del contrato..." /></Form.Item>
          <Form.Item name="notas" label="Notas internas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
