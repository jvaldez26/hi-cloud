import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag } from 'antd';
import { Plus, PackageCheck } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function CosechasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [invModal, setInvModal] = useState<{ open: boolean; id?: number }>({ open: false });

  const { data: resp, isLoading } = useQuery({ queryKey: ['agro-cosechas'], queryFn: () => agroApi.getCosechas() });
  const cosechas: any[] = (resp as any)?.data ?? resp ?? [];

  const ingresarInv = useMutation({
    mutationFn: ({ id, productoId }: { id: number; productoId: number }) => agroApi.ingresarInventario(id, productoId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-cosechas'] }); setInvModal({ open: false }); message.success('Inventario actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const [invForm] = Form.useForm();

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: C.colorText, marginBottom: 16 }}>Cosechas</h2>

      <Table loading={isLoading} dataSource={cosechas} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'N°', dataIndex: 'numero', key: 'n', width: 110 },
          { title: 'Ciclo', dataIndex: 'cicloNumero', key: 'c' },
          { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => v ? String(v).split('T')[0] : '-' },
          { title: 'Cantidad', key: 'q', render: (_: any, r: any) => `${r.cantidad} ${r.unidad ?? ''}` },
          { title: 'Calidad', dataIndex: 'calidad', key: 'cal' },
          { title: 'Destino', dataIndex: 'destino', key: 'd' },
          { title: 'M.O. Cosecha', dataIndex: 'costoManoObra', key: 'mo', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
          {
            title: 'Inventario', dataIndex: 'ingresadoInventario', key: 'inv',
            render: (v: boolean, r: any) => v
              ? <Tag color="green">Ingresado</Tag>
              : <Button size="small" icon={<PackageCheck size={12} />} onClick={() => { invForm.resetFields(); setInvModal({ open: true, id: r.id }); }}>Ingresar</Button>,
          },
          { title: 'Notas', dataIndex: 'notas', key: 'not' },
        ]} />

      <Modal open={invModal.open} title="Ingresar al Inventario" onCancel={() => setInvModal({ open: false })}
        onOk={() => invForm.validateFields().then(v => ingresarInv.mutate({ id: invModal.id!, productoId: Number(v.productoId) }))}
        confirmLoading={ingresarInv.isPending}>
        <Form form={invForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="productoId" label="ID del Producto en Inventario" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="ID del producto en el módulo de inventario" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
