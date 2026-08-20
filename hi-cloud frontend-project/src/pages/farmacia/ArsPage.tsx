import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select,
  Tag, Typography, Space, message,
} from 'antd';
import { PlusOutlined, EditOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'numero', label: 'N° Reclamación', defaultVisible: true },
  { key: 'arsNombre', label: 'ARS', defaultVisible: true },
  { key: 'periodoDesde', label: 'Período Desde', defaultVisible: true },
  { key: 'periodoHasta', label: 'Período Hasta', defaultVisible: true },
  { key: 'cantidadDispensaciones', label: 'Dispensaciones', defaultVisible: false },
  { key: 'montoTotal', label: 'Monto Total', defaultVisible: true },
  { key: 'montoCubierto', label: 'Cubierto', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'fechaEnvio', label: 'Fecha Envío', defaultVisible: false },
  { key: 'fechaPago', label: 'Fecha Pago', defaultVisible: false },
  { key: 'actions', label: 'Acciones', defaultVisible: true },
];

const ESTADOS_ARS = ['pendiente', 'enviada', 'pagada', 'rechazada'];

export default function ArsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('farmacia-ars', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-ars', page, estado],
    queryFn: () => farmaciaApi.ars({ page, limit: 20, estado }),
  });

  const crear = useMutation({
    mutationFn: (b: any) => farmaciaApi.crearArs({
      ...b,
      periodoDesde: b.periodo?.[0]?.format('YYYY-MM-DD'),
      periodoHasta: b.periodo?.[1]?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['farmacia-ars'] }); setModalOpen(false); form.resetFields(); },
  });

  const actualizar = useMutation({
    mutationFn: (b: any) => farmaciaApi.actualizarArs(editId!, {
      ...b,
      fechaEnvio: b.fechaEnvio?.format('YYYY-MM-DD'),
      fechaPago: b.fechaPago?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['farmacia-ars'] }); setEditModal(false); setEditId(null); },
  });

  const abrirEditar = (r: any) => {
    setEditId(r.id);
    editForm.setFieldsValue({
      estado: r.estado,
      montoCubierto: r.montoCubierto,
      observaciones: r.observaciones,
      fechaEnvio: r.fechaEnvio ? dayjs(r.fechaEnvio) : undefined,
      fechaPago: r.fechaPago ? dayjs(r.fechaPago) : undefined,
    });
    setEditModal(true);
  };

  const cols = [
    { title: 'N° Reclamación', dataIndex: 'numero', key: 'numero', width: 140 },
    { title: 'ARS', dataIndex: 'arsNombre', key: 'arsNombre', width: 160 },
    { title: 'Período Desde', dataIndex: 'periodoDesde', key: 'periodoDesde', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Período Hasta', dataIndex: 'periodoHasta', key: 'periodoHasta', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Dispensaciones', dataIndex: 'cantidadDispensaciones', key: 'cantidadDispensaciones', width: 120 },
    { title: 'Monto Total', dataIndex: 'montoTotal', key: 'montoTotal', width: 120, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    { title: 'Cubierto', dataIndex: 'montoCubierto', key: 'montoCubierto', width: 120, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 100,
      render: (v: string) => {
        const colors: Record<string, string> = { pendiente: 'orange', enviada: 'blue', pagada: 'green', rechazada: 'red' };
        return <Tag color={colors[v] ?? 'default'}>{v}</Tag>;
      },
    },
    { title: 'Fecha Envío', dataIndex: 'fechaEnvio', key: 'fechaEnvio', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Fecha Pago', dataIndex: 'fechaPago', key: 'fechaPago', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
      ),
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'N° Reclamación': r.numero,
      'ARS': r.arsNombre,
      'Período Desde': r.periodoDesde ? new Date(r.periodoDesde).toLocaleDateString('es-DO') : '',
      'Período Hasta': r.periodoHasta ? new Date(r.periodoHasta).toLocaleDateString('es-DO') : '',
      'Dispensaciones': r.cantidadDispensaciones ?? 0,
      'Monto Total': r.montoTotal ?? 0,
      'Cubierto': r.montoCubierto ?? 0,
      'Estado': r.estado,
      'Fecha Envío': r.fechaEnvio ? new Date(r.fechaEnvio).toLocaleDateString('es-DO') : '',
      'Fecha Pago': r.fechaPago ? new Date(r.fechaPago).toLocaleDateString('es-DO') : '',
    }));
    exportarExcel(filas, `ARS-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Reclamaciones ARS</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['farmacia-ars']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
            Nueva ARS
          </Button>
        </div>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Estado"
          style={{ width: 140 }}
          allowClear
          onChange={v => { setEstado(v); setPage(1); }}
          options={ESTADOS_ARS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))}
        />
      </Space>

      <Table
        dataSource={data?.data ?? []}
        columns={filterColumns(cols as any)}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 10, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />

      {/* Modal crear */}
      <Modal
        open={modalOpen}
        title="Nueva Reclamación ARS"
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then(v => crear.mutate(v))}
        confirmLoading={crear.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="arsNombre" label="Nombre de la ARS" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="periodo" label="Período (Desde - Hasta)">
            <DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cantidadDispensaciones" label="Cantidad de Dispensaciones">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="montoTotal" label="Monto Total Reclamado">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
          </Form.Item>
          <Form.Item name="montoCubierto" label="Monto Cubierto (si conocido)">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
          </Form.Item>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal editar */}
      <Modal
        open={editModal}
        title="Actualizar Reclamación ARS"
        onCancel={() => setEditModal(false)}
        onOk={() => editForm.validateFields().then(v => actualizar.mutate(v))}
        confirmLoading={actualizar.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="estado" label="Estado">
            <Select options={ESTADOS_ARS.map(e => ({ value: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))} />
          </Form.Item>
          <Form.Item name="fechaEnvio" label="Fecha de Envío">
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fechaPago" label="Fecha de Pago">
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="montoCubierto" label="Monto Cubierto">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
          </Form.Item>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

