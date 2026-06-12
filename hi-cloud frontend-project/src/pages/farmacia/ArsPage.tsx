import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select,
  Tag, Typography, Space,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;

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
    { title: 'N° Reclamación', dataIndex: 'numero', width: 140 },
    { title: 'ARS', dataIndex: 'arsNombre', width: 160 },
    { title: 'Período Desde', dataIndex: 'periodoDesde', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Período Hasta', dataIndex: 'periodoHasta', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Dispensaciones', dataIndex: 'cantidadDispensaciones', width: 120 },
    { title: 'Monto Total', dataIndex: 'montoTotal', width: 120, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    { title: 'Cubierto', dataIndex: 'montoCubierto', width: 120, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => {
        const colors: Record<string, string> = { pendiente: 'orange', enviada: 'blue', pagada: 'green', rechazada: 'red' };
        return <Tag color={colors[v] ?? 'default'}>{v}</Tag>;
      },
    },
    { title: 'Fecha Envío', dataIndex: 'fechaEnvio', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Fecha Pago', dataIndex: 'fechaPago', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Reclamaciones ARS</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          Nueva Reclamación
        </Button>
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
        columns={cols}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
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
