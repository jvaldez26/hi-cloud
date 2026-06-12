import { useState } from 'react';
import {
  Card, Table, Button, DatePicker, Select, Modal, Form, Input,
  TimePicker, InputNumber, Tag, Space, Typography, message,
} from 'antd';
import { PlusOutlined, CalendarOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tallerApi } from '../../api/taller.api';
import dayjs from 'dayjs';

const { Title } = Typography;
const ESTADO_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', completada: 'green',
  cancelada: 'red', no_asistio: 'default',
};

export default function AgendaTallerPage() {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [tecnicoId, setTecnicoId] = useState<number | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const { data: citas = [], isLoading } = useQuery({
    queryKey: ['taller-citas', fecha, tecnicoId],
    queryFn: () => tallerApi.citas({ fecha, tecnicoId }),
  });

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['taller-tecnicos'],
    queryFn: tallerApi.tecnicos,
  });

  const save = useMutation({
    mutationFn: (vals: any) => {
      const body = {
        ...vals,
        hora: vals.hora ? dayjs(vals.hora).format('HH:mm') : undefined,
      };
      return editingId ? tallerApi.actualizarCita(editingId, body) : tallerApi.crearCita(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taller-citas'] });
      message.success(editingId ? 'Cita actualizada' : 'Cita creada');
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'Error al guardar'),
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    form.setFieldsValue({
      ...r,
      hora: r.hora ? dayjs(`2000-01-01 ${r.hora}`) : undefined,
    });
    setModalOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ fecha, estado: 'programada', duracionMinutos: 60 });
    setModalOpen(true);
  };

  const columns = [
    { title: 'Hora', dataIndex: 'hora', width: 80 },
    { title: 'N°', dataIndex: 'numero', width: 110, render: (v: any) => v ?? '—' },
    {
      title: 'Vehículo', key: 'v',
      render: (r: any) => r.placa ? `${r.placa} — ${r.marca ?? ''} ${r.modelo ?? ''}` : '—',
    },
    { title: 'Servicio', dataIndex: 'tipoServicio', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', render: (v: any) => v ?? '—' },
    { title: 'Duración', dataIndex: 'duracionMinutos', width: 90, render: (v: any) => `${v} min` },
    {
      title: 'Estado', dataIndex: 'estado',
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
    },
    {
      title: '', key: 'acc', width: 60,
      render: (_: any, r: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />Agenda Taller
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nueva Cita</Button>
      </div>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <DatePicker
            value={dayjs(fecha)}
            onChange={v => setFecha(v ? v.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))}
            format="DD/MM/YYYY"
          />
          <Select
            allowClear
            placeholder="Filtrar por técnico"
            value={tecnicoId}
            onChange={setTecnicoId}
            style={{ width: 200 }}
          >
            {(tecnicos as any[]).map((t: any) => (
              <Select.Option key={t.id} value={t.id}>{t.nombre}</Select.Option>
            ))}
          </Select>
        </Space>
        <Table
          dataSource={citas as any[]}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId ? 'Editar Cita' : 'Nueva Cita'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.validateFields().then(save.mutate)}
        confirmLoading={save.isPending}
        width={550}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="hora" label="Hora" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} minuteStep={15} />
            </Form.Item>
            <Form.Item name="duracionMinutos" label="Duración (min)">
              <InputNumber style={{ width: '100%' }} min={15} step={15} />
            </Form.Item>
            <Form.Item name="tecnicoId" label="Técnico">
              <Select allowClear>
                {(tecnicos as any[]).filter((t: any) => t.isActive).map((t: any) => (
                  <Select.Option key={t.id} value={t.id}>{t.nombre}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="vehiculoId" label="ID Vehículo">
              <Input type="number" />
            </Form.Item>
            <Form.Item name="estado" label="Estado">
              <Select>
                {['programada','confirmada','completada','cancelada','no_asistio'].map(e => (
                  <Select.Option key={e} value={e}>
                    <Tag color={ESTADO_COLOR[e]}>{e.toUpperCase()}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="tipoServicio" label="Tipo de servicio">
            <Input placeholder="Ej: Cambio de aceite, Revisión frenos..." />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
