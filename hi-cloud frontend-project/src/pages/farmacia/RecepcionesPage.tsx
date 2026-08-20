import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select,
  Tag, Typography, Space, Divider, message,
} from 'antd';
import { PlusOutlined, CheckCircleOutlined, EyeOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'numero', label: 'N° Recepción', defaultVisible: true },
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'proveedorNombre', label: 'Proveedor', defaultVisible: true },
  { key: 'facturaProveedor', label: 'Factura', defaultVisible: true },
  { key: 'total', label: 'Total', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'actions', label: 'Acciones', defaultVisible: true },
];

interface RecItem {
  medicamentoId: number; nombreGenerico?: string; numeroLote: string;
  fechaVencimiento: string; cantidadOrdenada?: number; cantidadRecibida: number;
  precioCompra?: number; precioVenta?: number;
}

export default function RecepcionesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [items, setItems] = useState<RecItem[]>([]);
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('farmacia-recepciones', COLS_DEF);

  const { data: medsData } = useQuery({
    queryKey: ['farmacia-medicamentos-select'],
    queryFn: () => farmaciaApi.medicamentos({ limit: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-recepciones', page],
    queryFn: () => farmaciaApi.recepciones({ page, limit: 20 }),
  });

  const { data: detalle } = useQuery({
    queryKey: ['farmacia-recepcion', detalleId],
    queryFn: () => farmaciaApi.recepcion(detalleId!),
    enabled: detalleId !== null,
  });

  const crear = useMutation({
    mutationFn: (b: any) => farmaciaApi.crearRecepcion(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farmacia-recepciones'] });
      setModalOpen(false); form.resetFields(); setItems([]);
    },
  });

  const confirmar = useMutation({
    mutationFn: (id: number) => farmaciaApi.confirmarRecepcion(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['farmacia-recepciones'] });
      qc.invalidateQueries({ queryKey: ['farmacia-lotes'] });
      qc.invalidateQueries({ queryKey: ['farmacia-medicamentos'] });
      message.success(`Recepción ${res.numero} confirmada. Stock actualizado.`);
      setDetalleId(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const agregarItem = () => {
    itemForm.validateFields().then(v => {
      const med = (medsData?.data ?? []).find((m: any) => m.id === v.medicamentoId);
      setItems(prev => [...prev, {
        ...v,
        fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD'),
        nombreGenerico: med?.nombreGenerico ?? '',
      }]);
      itemForm.resetFields();
    });
  };

  const cols = [
    { title: 'N° Recepción', dataIndex: 'numero', key: 'numero', width: 130 },
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 110, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
    { title: 'Proveedor', dataIndex: 'proveedorNombre', key: 'proveedorNombre', render: (v: string) => v ?? '-' },
    { title: 'Factura', dataIndex: 'facturaProveedor', key: 'facturaProveedor', width: 130 },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 110, render: (v: number) => `RD$ ${Number(v ?? 0).toFixed(2)}` },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 110,
      render: (v: string) => <Tag color={v === 'confirmada' ? 'green' : 'orange'}>{v}</Tag>,
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetalleId(r.id)} />
          {r.estado !== 'confirmada' && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}
              onClick={() => Modal.confirm({
                title: '¿Confirmar recepción?',
                content: 'Esto actualizará el stock de medicamentos.',
                onOk: () => confirmar.mutate(r.id),
              })} />
          )}
        </Space>
      ),
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'N° Recepción': r.numero,
      'Fecha': r.fecha ? new Date(r.fecha).toLocaleDateString('es-DO') : '',
      'Proveedor': r.proveedorNombre ?? '',
      'Factura': r.facturaProveedor ?? '',
      'Total': r.total ?? 0,
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Recepciones-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  const itemCols = [
    { title: 'Medicamento', dataIndex: 'nombreGenerico' },
    { title: 'Lote', dataIndex: 'numeroLote', width: 120 },
    { title: 'Vence', dataIndex: 'fechaVencimiento', width: 110 },
    { title: 'Cant.', dataIndex: 'cantidadRecibida', width: 70 },
    { title: 'P.Compra', dataIndex: 'precioCompra', width: 100, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    {
      title: '', key: 'del', width: 40,
      render: (_: any, _r: any, idx: number) => (
        <Button danger size="small" icon={<DeleteOutlined />} onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Recepciones de Mercancía</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['farmacia-recepciones']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([]); setModalOpen(true); }}>
            Nueva Recepción
          </Button>
        </div>
      </div>

      <Table
        dataSource={data?.data ?? []}
        columns={filterColumns(cols as any)}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 10, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />

      {/* Modal nueva recepción */}
      <Modal
        open={modalOpen}
        title="Nueva Recepción de Mercancía"
        onCancel={() => { setModalOpen(false); setItems([]); }}
        onOk={() => form.validateFields().then(v => crear.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD'), items }))}
        confirmLoading={crear.isPending}
        width={860}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space size={12} wrap>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]} initialValue={dayjs()}>
              <DatePicker format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="proveedorId" label="Proveedor">
              <InputNumber placeholder="ID Proveedor" style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="facturaProveedor" label="N° Factura Proveedor">
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <Divider orientation="left" plain>Medicamentos Recibidos</Divider>
        <Form form={itemForm} layout="inline" style={{ marginBottom: 8 }}>
          <Form.Item name="medicamentoId" rules={[{ required: true }]}>
            <Select
              placeholder="Medicamento"
              style={{ width: 220 }}
              showSearch optionFilterProp="label"
              options={(medsData?.data ?? []).map((m: any) => ({ value: m.id, label: `${m.nombreGenerico} ${m.concentracion ?? ''}` }))}
            />
          </Form.Item>
          <Form.Item name="numeroLote" rules={[{ required: true }]}>
            <Input placeholder="N° Lote" style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="fechaVencimiento" rules={[{ required: true }]}>
            <DatePicker placeholder="Vence" format="DD/MM/YYYY" style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="cantidadOrdenada">
            <InputNumber placeholder="Cant. ord." min={1} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="cantidadRecibida" rules={[{ required: true }]}>
            <InputNumber placeholder="Cant. rec." min={1} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="precioCompra">
            <InputNumber placeholder="P.Compra" min={0} precision={2} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="precioVenta">
            <InputNumber placeholder="P.Venta" min={0} precision={2} style={{ width: 100 }} />
          </Form.Item>
          <Button type="dashed" onClick={agregarItem}>+ Agregar</Button>
        </Form>

        <Table
          dataSource={items}
          columns={itemCols}
          rowKey={(_, idx) => String(idx)}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Sin artículos' }}
        />
      </Modal>

      {/* Modal detalle recepción */}
      <Modal
        open={detalleId !== null}
        title={`Detalle Recepción ${detalle?.numero ?? ''}`}
        onCancel={() => setDetalleId(null)}
        footer={detalle?.estado !== 'confirmada' ? [
          <Button key="cancel" onClick={() => setDetalleId(null)}>Cerrar</Button>,
          <Button key="confirm" type="primary" icon={<CheckCircleOutlined />}
            loading={confirmar.isPending}
            onClick={() => confirmar.mutate(detalleId!)}>
            Confirmar y Actualizar Stock
          </Button>,
        ] : [<Button key="close" onClick={() => setDetalleId(null)}>Cerrar</Button>]}
        width={760}
      >
        {detalle && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag color={detalle.estado === 'confirmada' ? 'green' : 'orange'}>{detalle.estado}</Tag>
              <span>Proveedor: {detalle.proveedorNombre ?? '-'}</span>
              <span>Factura: {detalle.facturaProveedor ?? '-'}</span>
            </Space>
            <Table
              dataSource={detalle.items ?? []}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Medicamento', dataIndex: 'nombreGenerico' },
                { title: 'Lote', dataIndex: 'numeroLote', width: 120 },
                { title: 'Vence', dataIndex: 'fechaVencimiento', width: 110, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
                { title: 'Cant.', dataIndex: 'cantidadRecibida', width: 70 },
                { title: 'P.Compra', dataIndex: 'precioCompra', width: 100, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

