import { useState } from 'react';
import { Card, Tag, Button, Modal, Form, Input, Select, DatePicker, InputNumber, message, Empty, Dropdown } from 'antd';
import { PlusOutlined, EllipsisOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';

const COLUMNAS: { key: string; label: string; color: string }[] = [
  { key: 'pendiente',   label: 'Pendiente',   color: '#e5e7eb' },
  { key: 'en_progreso', label: 'En Progreso',  color: '#dbeafe' },
  { key: 'revision',    label: 'En Revisión',  color: '#fef9c3' },
  { key: 'completada',  label: 'Completada',   color: '#dcfce7' },
];

const PRIORIDAD_COLOR: Record<string, string> = { urgente: 'magenta', alta: 'red', normal: 'default', baja: 'green' };

export default function TareasPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [filtroExp, setFiltroExp] = useState<number | undefined>();
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['sp-tareas-board', filtroExp],
    queryFn: () => serviciosProApi.getTareas(filtroExp ? { expedienteId: filtroExp } : {}),
  });
  const tareasArr = Array.isArray(tareas) ? tareas : [];

  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });
  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });

  const crearMut = useMutation({
    mutationFn: (body: any) => serviciosProApi.crearTarea(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-tareas-board'] }); message.success('Tarea creada'); setModalOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => serviciosProApi.actualizarEstadoTarea(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sp-tareas-board'] }),
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => serviciosProApi.eliminarTarea(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-tareas-board'] }); message.success('Tarea eliminada'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const tareasEnColumna = (estado: string) => tareasArr.filter((t: any) => t.estado === estado);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📋 Tareas</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select allowClear placeholder="Filtrar por expediente" style={{ width: 250 }} value={filtroExp} onChange={v => setFiltroExp(v)} showSearch optionFilterProp="children">
            {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Nueva Tarea</Button>
        </div>
      </div>

      {isLoading ? null : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, minWidth: 900, overflowX: 'auto' }}>
          {COLUMNAS.map(col => (
            <div key={col.key}>
              <div style={{ padding: '8px 12px', background: col.color, borderRadius: '8px 8px 0 0', fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span>{col.label}</span>
                <span style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 12, padding: '0 8px', fontSize: 11 }}>
                  {tareasEnColumna(col.key).length}
                </span>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 8px 8px', minHeight: 200, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tareasEnColumna(col.key).length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0' }}>Sin tareas</div>
                ) : tareasEnColumna(col.key).map((tarea: any) => (
                  <Card key={tarea.id} size="small" style={{ borderRadius: 6, borderLeft: `3px solid ${PRIORIDAD_COLOR[tarea.prioridad] === 'red' ? '#ef4444' : PRIORIDAD_COLOR[tarea.prioridad] === 'magenta' ? '#db2777' : '#d1d5db'}` }}
                    extra={
                      <Dropdown menu={{ items: [
                        ...COLUMNAS.filter(c => c.key !== tarea.estado).map(c => ({
                          key: c.key, label: `→ ${c.label}`,
                          onClick: () => estadoMut.mutate({ id: tarea.id, estado: c.key }),
                        })),
                        { type: 'divider' as const },
                        { key: 'del', label: <span style={{ color: 'red' }}>Eliminar</span>, onClick: () => eliminarMut.mutate(tarea.id) },
                      ]}} trigger={['click']}>
                        <Button size="small" type="text" icon={<EllipsisOutlined />} />
                      </Dropdown>
                    }>
                    <Tag color={PRIORIDAD_COLOR[tarea.prioridad] ?? 'default'} style={{ fontSize: 10, marginBottom: 4 }}>{tarea.prioridad?.toUpperCase()}</Tag>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{tarea.titulo}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{tarea.expedienteNombre}</div>
                    {tarea.profesionalNombre && (
                      <div style={{ fontSize: 11, color: '#6b7280' }}>👤 {tarea.profesionalNombre}</div>
                    )}
                    {tarea.fechaVencimiento && (
                      <div style={{ fontSize: 11, color: dayjs(tarea.fechaVencimiento).isBefore(dayjs()) ? '#dc2626' : '#6b7280', marginTop: 4 }}>
                        ⏰ {dayjs(tarea.fechaVencimiento).format('DD/MM/YYYY')}
                      </div>
                    )}
                    {tarea.horasEstimadas && (
                      <div style={{ fontSize: 11, color: '#6b7280' }}>⏱️ Est: {tarea.horasEstimadas}h | Real: {tarea.horasReales ?? 0}h</div>
                    )}
                    {tarea.facturable && <Tag color="blue" style={{ fontSize: 9, marginTop: 4 }}>$ Facturable</Tag>}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Nueva Tarea"
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate({ ...v, fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD'), fechaInicio: v.fechaInicio?.format('YYYY-MM-DD') }))}
        confirmLoading={crearMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(expedientes as any[]).map((e: any) => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="profesionalId" label="Profesional">
            <Select allowClear showSearch optionFilterProp="children">
              {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="fechaInicio" label="Fecha inicio"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="fechaVencimiento" label="Fecha vencimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="prioridad" label="Prioridad" initialValue="normal">
              <Select><Select.Option value="baja">Baja</Select.Option><Select.Option value="normal">Normal</Select.Option><Select.Option value="alta">Alta</Select.Option><Select.Option value="urgente">Urgente</Select.Option></Select>
            </Form.Item>
            <Form.Item name="horasEstimadas" label="Horas estimadas"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item>
          </div>
          <Form.Item name="categoria" label="Categoría"><Input placeholder="investigacion, redaccion, reunion..." /></Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
