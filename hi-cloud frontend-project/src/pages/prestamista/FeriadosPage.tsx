import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Select, Tag, Modal, Form, Input, DatePicker, message, Alert, Popconfirm, theme } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

const anioActual = new Date().getFullYear();
const ANIOS = [anioActual - 1, anioActual, anioActual + 1, anioActual + 2];

export default function FeriadosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [anio, setAnio] = useState(anioActual);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data = [], isLoading } = useQuery({
    queryKey: ['prestamista-feriados', anio],
    queryFn: () => prestamistalApi.getFeriados(anio),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearFeriado({ ...vals, anio, fecha: vals.fecha.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prestamista-feriados', anio] }); setOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear el feriado'),
  });

  const confirmar = useMutation({
    mutationFn: ({ id, confirmado }: any) => prestamistalApi.actualizarFeriado(id, { confirmado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prestamista-feriados', anio] }),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar'),
  });

  const editarFecha = useMutation({
    mutationFn: ({ id, fecha }: any) => prestamistalApi.actualizarFeriado(id, { fecha }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prestamista-feriados', anio] }),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => prestamistalApi.eliminarFeriado(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prestamista-feriados', anio] }),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar'),
  });

  const sinConfirmar = (data as any[]).filter(f => !f.confirmado);

  const cols = [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 140, render: (v: string, r: any) => (
      <DatePicker
        size="small" format="YYYY-MM-DD" defaultValue={undefined} value={undefined}
        placeholder={v?.slice(0, 10)}
        onChange={(d: any) => d && editarFecha.mutate({ id: r.id, fecha: d.format('YYYY-MM-DD') })}
      />
    ) },
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' },
    { title: 'Tipo', key: 'tipo', width: 130, render: (_: any, r: any) => (
      <Tag color={r.confirmado ? 'green' : 'orange'}>{r.confirmado ? 'Confirmado' : 'Verificar'}</Tag>
    ) },
    {
      title: '', key: 'acc', width: 160,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {!r.confirmado && (
            <Button size="small" type="primary" onClick={() => confirmar.mutate({ id: r.id, confirmado: true })}>
              Confirmar
            </Button>
          )}
          <Popconfirm title="¿Quitar este feriado del calendario?" onConfirm={() => eliminar.mutate(r.id)}>
            <Button size="small" danger icon={<Trash2 size={13} />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Calendario de Feriados</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select value={anio} onChange={setAnio} style={{ width: 100 }}>
            {ANIOS.map(a => <Select.Option key={a} value={a}>{a}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Agregar feriado</Button>
        </div>
      </div>

      <p style={{ color: C.colorTextSecondary, marginBottom: 16 }}>
        Usado por el motor de préstamos para la frecuencia "diaria" cuando se excluyen feriados — ver
        docs/prestamista/motor-financiero.md §1.5. Agregar, quitar o corregir una fecha aquí solo afecta
        a los préstamos que se desembolsen DESPUÉS: nunca reprograma cuotas de préstamos ya generados.
      </p>

      {sinConfirmar.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message={`Verifica los feriados de ${anio} con el calendario oficial`}
          description={`${sinConfirmar.map(f => f.nombre).join(', ')} se trasladan al lunes más cercano según la Ley 139-97, pero la fecha exacta de cada año se publica por decreto — confirma o corrige la fecha de cada uno antes de que el motor los use.`}
        />
      )}

      <Table
        dataSource={(data as any[]).map((r: any) => ({ ...r, key: r.id })).sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))}
        columns={cols} loading={isLoading} pagination={false}
      />

      <Modal title="Agregar feriado" open={open} onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crear.mutate(v))} okText="Agregar" confirmLoading={crear.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
