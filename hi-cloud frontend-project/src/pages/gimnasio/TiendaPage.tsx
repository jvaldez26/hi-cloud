import { useState } from 'react';
import { Button, Modal, Form, Select, InputNumber, message, Tag, Row, Col, Card } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function TiendaPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [productoSel, setProductoSel] = useState<any>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ['gimnasio-tienda'], queryFn: gimnasioApi.getTienda });
  const productos = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const ventaMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.ventaTienda(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-tienda'] }); message.success('Venta registrada'); setModalOpen(false); form.resetFields(); setProductoSel(null); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Tienda del Gimnasio</h2>
      <Row gutter={[16, 16]}>
        {productos.map((p: any) => (
          <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
            <Card size="small"
              actions={[
                <Button icon={<ShoppingCartOutlined />} type="primary" size="small"
                  disabled={p.stock <= 0}
                  onClick={() => { setProductoSel(p); form.resetFields(); setModalOpen(true); }}>
                  Vender
                </Button>
              ]}>
              <div style={{ fontWeight: 600 }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{p.categoria}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
                RD${Number(p.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <Tag color={p.stock > 5 ? 'green' : p.stock > 0 ? 'orange' : 'red'} style={{ marginTop: 4 }}>
                Stock: {p.stock}
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>
      <Modal open={modalOpen} title={`Vender: ${productoSel?.nombre ?? ''}`}
        onCancel={() => { setModalOpen(false); form.resetFields(); setProductoSel(null); }}
        onOk={() => form.validateFields().then(v => ventaMut.mutate({ productoId: productoSel?.id, ...v }))}
        confirmLoading={ventaMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="miembroId" label="Miembro (opcional)">
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro (opcional)" allowClear>
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]} initialValue={1}>
            <InputNumber style={{ width: '100%' }} min={1} max={productoSel?.stock ?? 999} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
