import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, InputNumber, message, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'tipo', label: 'Tipo', defaultVisible: true },
  { key: 'categoria', label: 'Categoria', defaultVisible: true },
  { key: 'capacidad', label: 'Capacidad', defaultVisible: true },
  { key: 'duracionMinutos', label: 'Duracion (min)', defaultVisible: true },
  { key: 'costo', label: 'Costo', defaultVisible: true },
  { key: 'acciones', label: 'Acciones', defaultVisible: true },
];

export default function ClasesPage() {
  const [modalClaseOpen, setModalClaseOpen] = useState(false);
  const [modalScheduleOpen, setModalScheduleOpen] = useState(false);
  const [editandoClase, setEditandoClase] = useState<any>(null);
  const [formClase] = Form.useForm();
  const [formSchedule] = Form.useForm();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('gimnasio-clases', COLS_DEF);

  const exportar = () => {
    const filas = (Array.isArray(clasesData) ? clasesData : []).map((r: any) => ({
      'Nombre': r.nombre,
      'Tipo': r.tipo,
      'Categoria': r.categoria,
      'Capacidad': r.capacidad,
      'Duracion (min)': r.duracionMinutos,
      'Costo': r.costo,
    }));
    exportarExcel(filas, `Clases-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const { data: clasesData, isLoading: loadingClases } = useQuery({ queryKey: ['gimnasio-clases'], queryFn: gimnasioApi.getClases });
  const clases = Array.isArray(clasesData) ? clasesData : [];

  const { data: scheduleData, isLoading: loadingSchedule } = useQuery({ queryKey: ['gimnasio-schedule'], queryFn: () => gimnasioApi.getSchedule() });
  const schedule = Array.isArray(scheduleData) ? scheduleData : [];

  const { data: entrenadoresData } = useQuery({ queryKey: ['gimnasio-entrenadores'], queryFn: gimnasioApi.getEntrenadores });
  const entrenadores = Array.isArray(entrenadoresData) ? entrenadoresData : [];

  const crearClaseMut = useMutation({
    mutationFn: (body: any) => editandoClase ? gimnasioApi.actualizarClase(editandoClase.id, body) : gimnasioApi.crearClase(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-clases'] }); message.success('Clase guardada'); setModalClaseOpen(false); formClase.resetFields(); setEditandoClase(null); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const crearScheduleMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.crearSchedule(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-schedule'] }); message.success('Horario creado'); setModalScheduleOpen(false); formSchedule.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const colClases = [
    { key: 'nombre', title: 'Nombre', dataIndex: 'nombre' },
    { key: 'tipo', title: 'Tipo', dataIndex: 'tipo' },
    { key: 'categoria', title: 'Categoria', dataIndex: 'categoria' },
    { key: 'capacidad', title: 'Capacidad', dataIndex: 'capacidad' },
    { key: 'duracionMinutos', title: 'Duracion (min)', dataIndex: 'duracionMinutos' },
    { key: 'costo', title: 'Costo', dataIndex: 'costo', render: (v: number) => v != null ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : 'Incluida' },
    {
      key: 'acciones', title: 'Acciones', render: (_: any, r: any) => (
        <Button icon={<EditOutlined />} size="small" onClick={() => { setEditandoClase(r); formClase.setFieldsValue(r); setModalClaseOpen(true); }}>Editar</Button>
      )
    },
  ];

  const colSchedule = [
    { title: 'Dia', dataIndex: 'diaSemana' },
    { title: 'Hora Inicio', dataIndex: 'horaInicio' },
    { title: 'Hora Fin', dataIndex: 'horaFin' },
    { title: 'Clase', dataIndex: 'claseNombre' },
    { title: 'Entrenador', dataIndex: 'entrenadorNombre' },
    { title: 'Sala', dataIndex: 'sala' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Clases</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['gimnasio-clases']} />
          <VideoTutorialButton />
        </div>
      </div>
      <Tabs
        items={[
          {
            key: 'clases', label: 'Clases',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditandoClase(null); formClase.resetFields(); setModalClaseOpen(true); }}>Nueva Clase</Button>
                </div>
                <Table dataSource={clases} columns={filterColumns(colClases as any)} rowKey="id" loading={loadingClases} scroll={{ x: 'max-content' }} />
              </>
            )
          },
          {
            key: 'horario', label: 'Horario',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { formSchedule.resetFields(); setModalScheduleOpen(true); }}>Nuevo Horario</Button>
                </div>
                <Table dataSource={schedule} columns={colSchedule} rowKey="id" loading={loadingSchedule} scroll={{ x: 'max-content' }} />
              </>
            )
          },
        ]}
      />

      <Modal open={modalClaseOpen} title={editandoClase ? 'Editar Clase' : 'Nueva Clase'}
        onCancel={() => { setModalClaseOpen(false); formClase.resetFields(); setEditandoClase(null); }}
        onOk={() => formClase.validateFields().then(v => crearClaseMut.mutate(v))}
        confirmLoading={crearClaseMut.isPending}>
        <Form form={formClase} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo"><Select><Select.Option value="grupal">Grupal</Select.Option><Select.Option value="individual">Individual</Select.Option></Select></Form.Item>
          <Form.Item name="categoria" label="Categoria"><Input /></Form.Item>
          <Form.Item name="capacidad" label="Capacidad"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item name="duracionMinutos" label="Duracion (min)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
          <Form.Item name="costo" label="Costo (dejar vacio si incluida)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="descripcion" label="Descripcion"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal open={modalScheduleOpen} title="Nuevo Horario"
        onCancel={() => { setModalScheduleOpen(false); formSchedule.resetFields(); }}
        onOk={() => formSchedule.validateFields().then(v => crearScheduleMut.mutate(v))}
        confirmLoading={crearScheduleMut.isPending}>
        <Form form={formSchedule} layout="vertical">
          <Form.Item name="claseId" label="Clase" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar clase">{clases.map((c: any) => <Select.Option key={c.id} value={c.id}>{c.nombre}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="entrenadorId" label="Entrenador">
            <Select placeholder="Seleccionar entrenador" allowClear>{entrenadores.map((e: any) => <Select.Option key={e.id} value={e.id}>{e.nombre}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="diaSemana" label="Dia" rules={[{ required: true }]}>
            <Select>{DIAS.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="horaInicio" label="Hora Inicio" rules={[{ required: true }]}><Input placeholder="08:00" /></Form.Item>
          <Form.Item name="horaFin" label="Hora Fin" rules={[{ required: true }]}><Input placeholder="09:00" /></Form.Item>
          <Form.Item name="sala" label="Sala"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
