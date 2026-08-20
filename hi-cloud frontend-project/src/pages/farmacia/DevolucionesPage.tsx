import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select,
  Tag, Typography, message,
} from 'antd';
import { PlusOutlined, RollbackOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { farmaciaApi } from '../../api/farmacia.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'numero', label: 'N° Devolución', defaultVisible: true },
  { key: 'createdAt', label: 'Fecha', defaultVisible: true },
  { key: 'dispensacionNumero', label: 'Dispensación', defaultVisible: true },
  { key: 'clienteNombre', label: 'Cliente', defaultVisible: true },
  { key: 'motivo', label: 'Motivo', defaultVisible: true },
  { key: 'montoDevuelto', label: 'Monto', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
];

export default function DevolucionesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('farmacia-devoluciones', COLS_DEF);

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
    { title: 'N° Devolución', dataIndex: 'numero', key: 'numero', width: 130 },
    { title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 140, render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Dispensación', dataIndex: 'dispensacionNumero', key: 'dispensacionNumero', width: 130, render: (v: string) => v ?? '-' },
    { title: 'Cliente', dataIndex: 'clienteNombre', key: 'clienteNombre', render: (v: string) => v ?? 'Anónimo' },
    { title: 'Motivo', dataIndex: 'motivo', key: 'motivo', ellipsis: true },
    { title: 'Monto', dataIndex: 'montoDevuelto', key: 'montoDevuelto', width: 110, render: (v: number) => v ? `RD$ ${Number(v).toFixed(2)}` : '-' },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 100,
      render: (v: string) => <Tag color={v === 'procesada' ? 'green' : 'orange'}>{v}</Tag>,
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'N° Devolución': r.numero,
      'Fecha': new Date(r.createdAt).toLocaleString('es-DO'),
      'Dispensación': r.dispensacionNumero ?? '',
      'Cliente': r.clienteNombre ?? 'Anónimo',
      'Motivo': r.motivo ?? '',
      'Monto': r.montoDevuelto ?? 0,
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Devoluciones-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          <RollbackOutlined style={{ marginRight: 8 }} />Devoluciones
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['farmacia-devoluciones']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
            Nueva Devolución
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

