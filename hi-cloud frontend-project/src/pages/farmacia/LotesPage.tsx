import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select,
  Tag, Space, Typography, Tooltip,
} from 'antd';
import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;

function tagLote(dias: number) {
  if (dias <= 0) return <Tag color="error">VENCIDO</Tag>;
  if (dias <= 15) return <Tag color="red">{dias}d — CRÍTICO</Tag>;
  if (dias <= 30) return <Tag color="orange">{dias}d — PRÓXIMO</Tag>;
  return <Tag color="green">{dias}d</Tag>;
}

export default function LotesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [medId, setMedId] = useState<number | undefined>();
  const [estado, setEstado] = useState<string | undefined>('activo');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Para búsqueda de medicamentos en el form
  const { data: medsData } = useQuery({
    queryKey: ['farmacia-medicamentos-select'],
    queryFn: () => farmaciaApi.medicamentos({ limit: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-lotes', page, medId, estado],
    queryFn: () => farmaciaApi.lotes({ page, limit: 50, medicamentoId: medId, estado }),
  });

  const crear = useMutation({
    mutationFn: (b: any) => farmaciaApi.crearLote({ ...b, fechaVencimiento: b.fechaVencimiento?.format('YYYY-MM-DD'), fechaFabricacion: b.fechaFabricacion?.format('YYYY-MM-DD') }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farmacia-lotes'] });
      qc.invalidateQueries({ queryKey: ['farmacia-medicamentos'] });
      setModalOpen(false);
      form.resetFields();
    },
  });

  const darBaja = useMutation({
    mutationFn: (id: number) => farmaciaApi.actualizarLote(id, { estado: 'dado_baja' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['farmacia-lotes'] }),
  });

  const columns = [
    { title: 'N° Lote', dataIndex: 'numeroLote', width: 130 },
    { title: 'Medicamento', dataIndex: 'nombreGenerico', ellipsis: true },
    { title: 'Concentración', dataIndex: 'concentracion', width: 120 },
    { title: 'Fabricación', dataIndex: 'fechaFabricacion', width: 110, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '-' },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 110, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
    {
      title: 'Días restantes', dataIndex: 'diasRestantes', width: 130,
      render: (v: number) => tagLote(v),
      sorter: (a: any, b: any) => a.diasRestantes - b.diasRestantes,
    },
    { title: 'Inicial', dataIndex: 'cantidadInicial', width: 80 },
    { title: 'Actual', dataIndex: 'cantidadActual', width: 80, render: (v: number) => <strong>{v}</strong> },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={v === 'activo' ? 'green' : v === 'vencido' ? 'red' : 'default'}>{v}</Tag>,
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, r: any) => r.estado === 'activo' ? (
        <Tooltip title="Dar de baja">
          <Button danger size="small" icon={<StopOutlined />} onClick={() => darBaja.mutate(r.id)} />
        </Tooltip>
      ) : null,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Control de Lotes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          Nuevo Lote
        </Button>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Filtrar por medicamento"
          style={{ width: 280 }}
          allowClear
          showSearch
          optionFilterProp="label"
          onChange={(v) => { setMedId(v); setPage(1); }}
          options={(medsData?.data ?? []).map((m: any) => ({ value: m.id, label: `${m.nombreGenerico} ${m.concentracion ?? ''}` }))}
        />
        <Select
          placeholder="Estado"
          style={{ width: 130 }}
          value={estado}
          onChange={(v) => { setEstado(v); setPage(1); }}
          options={[
            { value: 'activo', label: 'Activo' },
            { value: 'vencido', label: 'Vencido' },
            { value: 'dado_baja', label: 'Dado de baja' },
          ]}
          allowClear
        />
      </Space>

      <Table
        dataSource={data?.data ?? []}
        columns={columns}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        rowClassName={(r) => {
          const dias = r.diasRestantes;
          if (dias <= 0) return 'ant-table-row-danger';
          if (dias <= 15) return 'ant-table-row-warning';
          return '';
        }}
        pagination={{
          current: page, pageSize: 50, total: data?.total ?? 0,
          onChange: setPage, showSizeChanger: false,
        }}
      />

      <Modal
        open={modalOpen}
        title="Registrar Nuevo Lote"
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then(v => crear.mutate(v))}
        confirmLoading={crear.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="medicamentoId" label="Medicamento" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(medsData?.data ?? []).map((m: any) => ({ value: m.id, label: `${m.nombreGenerico} ${m.concentracion ?? ''}` }))}
            />
          </Form.Item>
          <Form.Item name="numeroLote" label="N° Lote" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fechaFabricacion" label="Fecha Fabricación">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha Vencimiento" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={d => d.isBefore(dayjs())} />
          </Form.Item>
          <Form.Item name="cantidadInicial" label="Cantidad" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="precioCompra" label="Precio Compra">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
          </Form.Item>
          <Form.Item name="facturaCompra" label="N° Factura Compra">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
