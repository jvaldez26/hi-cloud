import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, InputNumber, message, theme, Tag } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { PackageCheck } from 'lucide-react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'numero',    label: 'N°',          defaultVisible: true  },
  { key: 'ciclo',     label: 'Ciclo',        defaultVisible: true  },
  { key: 'fecha',     label: 'Fecha',        defaultVisible: true  },
  { key: 'cantidad',  label: 'Cantidad',     defaultVisible: true  },
  { key: 'calidad',   label: 'Calidad',      defaultVisible: true  },
  { key: 'destino',   label: 'Destino',      defaultVisible: false },
  { key: 'mo',        label: 'M.O.',         defaultVisible: false },
  { key: 'inv',       label: 'Inventario',   defaultVisible: true  },
];

export default function CosechasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [invModal, setInvModal] = useState<{ open: boolean; id?: number }>({ open: false });
  const [invForm] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-cosechas', COLS_DEF);

  const { data: resp, isLoading } = useQuery({ queryKey: ['agro-cosechas'], queryFn: () => agroApi.getCosechas() });
  const cosechas: any[] = (resp as any)?.data ?? resp ?? [];

  const ingresarInv = useMutation({
    mutationFn: ({ id, productoId }: { id: number; productoId: number }) => agroApi.ingresarInventario(id, { productoId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-cosechas'] }); setInvModal({ open: false }); message.success('Inventario actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'N°',         key: 'numero',   dataIndex: 'numero', width: 110 },
    { title: 'Ciclo',      key: 'ciclo',    dataIndex: 'cicloNumero' },
    { title: 'Fecha',      key: 'fecha',    dataIndex: 'fecha',  render: (v: string) => v ? String(v).split('T')[0] : '-' },
    { title: 'Cantidad',   key: 'cantidad', render: (_: any, r: any) => `${r.cantidad} ${r.unidad ?? ''}` },
    { title: 'Calidad',    key: 'calidad',  dataIndex: 'calidad' },
    { title: 'Destino',    key: 'destino',  dataIndex: 'destino' },
    { title: 'M.O.',       key: 'mo',       dataIndex: 'costoManoObra', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
    {
      title: 'Inventario', key: 'inv', dataIndex: 'ingresadoInventario',
      render: (v: boolean, r: any) => v
        ? <Tag color="green">Ingresado</Tag>
        : <Button size="small" icon={<PackageCheck size={12} />} onClick={() => { invForm.resetFields(); setInvModal({ open: true, id: r.id }); }}>Ingresar</Button>,
    },
    { title: 'Notas', key: 'acc', dataIndex: 'notas' },
  ];

  const exportar = () => {
    const rows = cosechas.map((r: any) => ({
      'N°':       r.numero,
      'Ciclo':    r.cicloNumero ?? '',
      'Fecha':    r.fecha ? String(r.fecha).split('T')[0] : '',
      'Cantidad': `${r.cantidad} ${r.unidad ?? ''}`,
      'Calidad':  r.calidad ?? '',
      'Destino':  r.destino ?? '',
      'M.O. Cosecha': Number(r.costoManoObra ?? 0),
      'Inventario':   r.ingresadoInventario ? 'Sí' : 'No',
    }));
    exportarExcel(rows, `Cosechas-${hoyRD()}`);
    message.success(`${rows.length} cosechas exportadas`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Cosechas</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['agro-cosechas']} />
          <VideoTutorialButton />
        </div>
      </div>

      <Table loading={isLoading} dataSource={cosechas} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} cosechas`, showSizeChanger: false }} />

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
