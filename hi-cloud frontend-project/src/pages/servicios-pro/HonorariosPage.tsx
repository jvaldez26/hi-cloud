import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, Tag, message, Dropdown, Space, Statistic, Card, Row, Col } from 'antd';
import { PlusOutlined, EllipsisOutlined, FilePdfOutlined, DollarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';

const ESTADO_COLOR: Record<string, string> = { pendiente: 'orange', pagada: 'green', cancelada: 'red', vencida: 'magenta' };

export default function HonorariosPage() {
  const [modalGen, setModalGen] = useState(false);
  const [formGen] = Form.useForm();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({ queryKey: ['sp-honorarios'], queryFn: () => serviciosProApi.getHonorarios({}) });
  const arr = Array.isArray(data) ? data : [];

  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });

  const genMut = useMutation({
    mutationFn: (body: any) => serviciosProApi.generarHonorarios(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-honorarios'] }); message.success('Honorario generado'); setModalGen(false); formGen.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const marcarPagMut = useMutation({
    mutationFn: ({ id, fecha }: { id: number; fecha: string }) => serviciosProApi.marcarHonorarioPagado(id, fecha),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-honorarios'] }); message.success('Marcado como pagado'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const totalPendiente = arr.filter((h: any) => h.estado === 'pendiente').reduce((s: number, h: any) => s + Number(h.total ?? 0), 0);
  const totalPagado    = arr.filter((h: any) => h.estado === 'pagada').reduce((s: number, h: any) => s + Number(h.total ?? 0), 0);

  const columns = [
    { title: 'Número', dataIndex: 'numero', width: 110 },
    { title: 'Expediente', render: (_: any, r: any) => r.expedienteNombre ?? '—' },
    { title: 'Cliente', render: (_: any, r: any) => r.clienteNombre ?? '—' },
    { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
    { title: 'Horas', dataIndex: 'horasTotales', render: (v: number) => v ? `${Number(v).toFixed(2)}h` : '' },
    { title: 'Subtotal', dataIndex: 'subtotal', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { title: 'Gastos', dataIndex: 'gastosTotal', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { title: 'TOTAL', dataIndex: 'total', render: (v: number) => <strong style={{ color: '#1d4ed8' }}>RD${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</strong> },
    { title: 'Fecha', dataIndex: 'fechaEmision', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    { title: 'Vence', dataIndex: 'fechaVencimiento', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
    {
      title: '', key: 'acc', width: 90,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => serviciosProApi.downloadHonorarioPdf(r.id)} title="PDF" />
          {r.estado === 'pendiente' && (
            <Dropdown menu={{ items: [
              { key: 'pagar', label: '💰 Marcar pagado', onClick: () => marcarPagMut.mutate({ id: r.id, fecha: dayjs().format('YYYY-MM-DD') }) },
            ]}} trigger={['click']}>
              <Button size="small" icon={<EllipsisOutlined />} />
            </Dropdown>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>💰 Honorarios</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalGen(true)}>Generar Honorario</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small"><Statistic title="Pendiente de cobro" value={totalPendiente} prefix="RD$" precision={2} valueStyle={{ color: '#d97706' }} /></Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small"><Statistic title="Cobrado total" value={totalPagado} prefix="RD$" precision={2} valueStyle={{ color: '#16a34a' }} /></Card>
        </Col>
      </Row>

      <Table dataSource={arr} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal open={modalGen} title="Generar Honorario de Expediente"
        onCancel={() => { setModalGen(false); formGen.resetFields(); }}
        onOk={() => formGen.validateFields().then(v => genMut.mutate({ ...v, fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD') }))}
        confirmLoading={genMut.isPending}>
        <Form form={formGen} layout="vertical">
          <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha vencimiento (pago)">
            <DatePicker style={{ width: '100%' }} defaultValue={dayjs().add(30, 'day')} />
          </Form.Item>
          <Form.Item name="notas" label="Notas internas (opcionales)" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
        <div style={{ background: '#eff6ff', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#1e40af', marginTop: 8 }}>
          ℹ️ Se incluirán todas las horas y gastos no facturados del expediente seleccionado.
        </div>
      </Modal>
    </div>
  );
}
