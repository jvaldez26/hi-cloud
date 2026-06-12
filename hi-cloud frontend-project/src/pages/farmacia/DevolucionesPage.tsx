import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select,
  Tag, Typography,
} from 'antd';
import { PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;

export default function DevolucionesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-devoluciones', page],
    queryFn: () => farmaciaApi.devoluciones({ page, limit: 20 }),
  });

  const crear = useMutation({
    mutationFn: (b: any) => farmaciaApi.crearDevolucion(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farmacia-devoluciones'] });
      setModalOpen(false);
      form.resetFields();
    },
  });

  const cols = [
    { title: 'N° Devolución', dataIndex: 'numero', width: 130 },
    { title: 'Fecha', dataIndex: 'createdAt', width: 140, render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Dispensación', dataIndex: 'dispensacionNumero', width: 130, render: (v: string) => v ?? '-' },
    { title: 'Cliente', dataIndex: 'clienteNombre', render: (v: string) => v ?? 'Anónimo' },
    { title: 'Motivo', dataIndex: 'motivo', ellipsis: true },
    { title: 'Monto', dataIndex: 'montoDevuelto', width: 110, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={v === 'procesada' ? 'green' : 'orange'}>{v}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <RollbackOutlined style={{ marginRight: 8 }} />
          Devoluciones
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          Nueva Devolución
        </Button>
      </div>

      <Table
        dataSource={data?.data ?? []}
        columns={cols}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />

      <Modal
        open={modalOpen}
        title="Registrar Devolución"
        onCancel={() => setModalOpen(false)}
        onOk={() => form.validateFields().then(v => crear.mutate(v))}
        confirmLoading={crear.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="dispensacionId" label="N° Dispensación (opcional)">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="ID de la dispensación" />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'medicamento_vencido', label: 'Medicamento vencido' },
              { value: 'error_despacho', label: 'Error en despacho' },
              { value: 'no_tolera', label: 'Paciente no tolera' },
              { value: 'prescripcion_cambiada', label: 'Prescripción cambiada' },
              { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="montoDevuelto" label="Monto a Devolver">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
