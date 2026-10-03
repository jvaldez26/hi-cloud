import { useState } from 'react';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carWashApi } from '../../api/car-wash.api';
import { LABEL_MODO_PAGO_CW, type ModoPagoLavadorCw } from './tipos';

const { Title } = Typography;

export default function CarWashLavadoresPage() {
  const qc = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form] = Form.useForm();

  const { data: lavadores, isLoading } = useQuery({
    queryKey: ['cw-lavadores'],
    queryFn: () => carWashApi.getLavadores(),
  });

  const crear = useMutation({
    mutationFn: (body: any) => carWashApi.crearLavador(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cw-lavadores'] }); message.success('Lavador creado'); cerrar(); },
  });
  const actualizar = useMutation({
    mutationFn: ({ id, body }: any) => carWashApi.actualizarLavador(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cw-lavadores'] }); message.success('Lavador actualizado'); cerrar(); },
  });

  function abrirNuevo() {
    setEditando(null);
    form.resetFields();
    form.setFieldsValue({ modoPago: 'por_vehiculo', valorModoPago: 0 });
    setModalAbierto(true);
  }
  function abrirEditar(lavador: any) {
    setEditando(lavador);
    form.setFieldsValue(lavador);
    setModalAbierto(true);
  }
  function cerrar() {
    setModalAbierto(false);
    setEditando(null);
    form.resetFields();
  }
  function guardar() {
    form.validateFields().then(valores => {
      if (editando) actualizar.mutate({ id: editando.id, body: valores });
      else crear.mutate(valores);
    });
  }

  const modoPago: ModoPagoLavadorCw = Form.useWatch('modoPago', form) ?? 'por_vehiculo';
  const etiquetaValor = modoPago === 'porcentaje' ? 'Porcentaje (%)' : 'Monto RD$';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Lavadores</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={abrirNuevo}>Nuevo lavador</Button>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={lavadores ?? []}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Cédula', dataIndex: 'cedula', render: (v: string) => v || '—' },
          { title: 'Teléfono', dataIndex: 'telefono', render: (v: string) => v || '—' },
          { title: 'Modo de pago', dataIndex: 'modoPago', render: (v: ModoPagoLavadorCw) => LABEL_MODO_PAGO_CW[v] },
          {
            title: 'Valor', dataIndex: 'valorModoPago',
            render: (v: number, r: any) => r.modoPago === 'porcentaje' ? `${Number(v).toFixed(2)}%` : `RD$${Number(v).toFixed(2)}`,
          },
          { title: 'Activo', dataIndex: 'activo', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
          { title: '', key: 'acciones', render: (_, r: any) => <Button onClick={() => abrirEditar(r)}>Editar</Button> },
        ]}
      />

      <Modal
        title={editando ? 'Editar lavador' : 'Nuevo lavador'}
        open={modalAbierto}
        onCancel={cerrar}
        onOk={guardar}
        confirmLoading={crear.isPending || actualizar.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cedula" label="Cédula (opcional)">
            <Input />
          </Form.Item>
          <Form.Item name="telefono" label="Teléfono (opcional)">
            <Input />
          </Form.Item>
          <Form.Item name="modoPago" label="Modo de pago" rules={[{ required: true }]}>
            <Select
              options={Object.entries(LABEL_MODO_PAGO_CW).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="valorModoPago" label={etiquetaValor} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {editando && (
            <Form.Item name="activo" label="Activo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
