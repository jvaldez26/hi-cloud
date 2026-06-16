import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Card, Row, Col, Tag, Button, Table, Progress, Spin, Empty, Modal, Form, Input, InputNumber, Select, DatePicker, message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';

const ESTADO_COLOR: Record<string,string> = { activo:'green', completado:'blue', cancelado:'red', pausado:'orange', borrador:'default' };

export default function ExpedienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const expId = Number(id);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('resumen');
  const [modalTiempo, setModalTiempo] = useState(false);
  const [modalTarea, setModalTarea] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalFactura, setModalFactura] = useState(false);
  const [formTiempo] = Form.useForm();
  const [formTarea] = Form.useForm();
  const [formGasto] = Form.useForm();
  const [formFactura] = Form.useForm();

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['sp-exp-resumen', expId],
    queryFn: () => serviciosProApi.getExpedienteResumen(expId),
    enabled: !!expId,
  });

  const { data: tiempos = [] } = useQuery({ queryKey: ['sp-exp-tiempo', expId], queryFn: () => serviciosProApi.getExpedienteTiempo(expId), enabled: !!expId });
  const { data: tareas = [] } = useQuery({ queryKey: ['sp-exp-tareas', expId], queryFn: () => serviciosProApi.getExpedienteTareas(expId), enabled: !!expId });
  const { data: gastos = [] } = useQuery({ queryKey: ['sp-exp-gastos', expId], queryFn: () => serviciosProApi.getExpedienteGastos(expId), enabled: !!expId });
  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['sp-exp-resumen', expId] });
    qc.invalidateQueries({ queryKey: ['sp-exp-tiempo', expId] });
    qc.invalidateQueries({ queryKey: ['sp-exp-tareas', expId] });
    qc.invalidateQueries({ queryKey: ['sp-exp-gastos', expId] });
  };

  const mutTiempo = useMutation({
    mutationFn: (body: any) => serviciosProApi.crearTiempo(body),
    onSuccess: () => { invalidar(); message.success('Tiempo registrado'); setModalTiempo(false); formTiempo.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });
  const mutTarea = useMutation({
    mutationFn: (body: any) => serviciosProApi.crearTarea(body),
    onSuccess: () => { invalidar(); message.success('Tarea creada'); setModalTarea(false); formTarea.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });
  const mutGasto = useMutation({
    mutationFn: (body: any) => serviciosProApi.crearGasto(body),
    onSuccess: () => { invalidar(); message.success('Gasto registrado'); setModalGasto(false); formGasto.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });
  const mutFactura = useMutation({
    mutationFn: (body: any) => serviciosProApi.generarFactura(expId, body),
    onSuccess: () => { invalidar(); message.success('Factura de honorarios generada'); setModalFactura(false); formFactura.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!resumen?.expediente) return <div style={{ padding: 24 }}><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/servicios-pro/expedientes')}>Volver</Button><Empty description="Expediente no encontrado" /></div>;

  const exp = resumen.expediente;
  const saldo = Number(resumen.totalFacturado) - Number(resumen.totalCobrado);
  const pctPresupuesto = exp.presupuestoTotal ? Math.min(100, Math.round((resumen.totalFacturado / exp.presupuestoTotal) * 100)) : 0;

  const tabItems = [
    {
      key: 'resumen', label: 'Resumen',
      children: (
        <div style={{ padding: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card size="small" title="Datos del Expediente">
                <p><strong>Cliente:</strong> {exp.clienteNombre}</p>
                <p><strong>Responsable:</strong> {`${exp.profesionalNombre ?? ''} ${exp.profesionalApellidos ?? ''}`.trim() || '—'}</p>
                <p><strong>Tipo:</strong> {exp.tipo?.replace(/_/g,' ') ?? '—'}</p>
                <p><strong>Facturación:</strong> {exp.tipoFacturacion?.replace(/_/g,' ') ?? '—'}</p>
                <p><strong>Inicio:</strong> {exp.fechaInicio ? dayjs(exp.fechaInicio).format('DD/MM/YYYY') : '—'}</p>
                {exp.descripcion && <p><strong>Descripción:</strong> {exp.descripcion}</p>}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title="Resumen Financiero">
                {exp.presupuestoTotal && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>Presupuesto</span><span>RD${Number(exp.presupuestoTotal).toLocaleString('es-DO')}</span>
                    </div>
                    <Progress percent={pctPresupuesto} strokeColor={pctPresupuesto > 100 ? '#dc2626' : '#1d4ed8'} />
                  </div>
                )}
                <p><strong>Horas trabajadas:</strong> {Number(resumen.totalHoras).toFixed(2)}h</p>
                <p><strong>Monto por tiempo:</strong> RD${Number(resumen.totalMontoTiempo).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                <p><strong>Total facturado:</strong> RD${Number(resumen.totalFacturado).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                <p style={{ color: '#16a34a' }}><strong>Total cobrado:</strong> RD${Number(resumen.totalCobrado).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                {saldo > 0 && <p style={{ color: '#dc2626' }}><strong>Saldo pendiente:</strong> RD${saldo.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>}
                {resumen.horasSinFacturar > 0 && <p style={{ color: '#d97706' }}><strong>Horas sin facturar:</strong> {Number(resumen.horasSinFacturar).toFixed(2)}h</p>}
              </Card>
            </Col>
          </Row>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <Button icon={<PlusOutlined />} onClick={() => setModalTiempo(true)}>Registrar tiempo</Button>
            <Button icon={<PlusOutlined />} onClick={() => setModalTarea(true)}>Nueva tarea</Button>
            <Button type="primary" onClick={() => setModalFactura(true)}>💰 Generar factura</Button>
            <Button icon={<FilePdfOutlined />} onClick={() => window.open(`/api/servicios-pro/expedientes/${expId}/estado-cuenta-pdf`, '_blank')}>Estado de cuenta PDF</Button>
          </div>
        </div>
      ),
    },
    {
      key: 'tiempo', label: `Tiempo (${Array.isArray(tiempos) ? tiempos.length : 0})`,
      children: (
        <div style={{ padding: 16 }}>
          <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setModalTiempo(true)}>Registrar tiempo</Button>
          <Table dataSource={Array.isArray(tiempos) ? tiempos : []} rowKey="id" size="small" scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Fecha', dataIndex: 'fecha', render: (v: string) => dayjs(v).format('DD/MM/YYYY'), width: 100 },
              { title: 'Profesional', render: (_: any, r: any) => `${r.profesionalNombre ?? ''} ${r.profesionalApellidos ?? ''}`.trim() },
              { title: 'Horas', dataIndex: 'horas', render: (v: number) => `${Number(v).toFixed(2)}h`, width: 80 },
              { title: 'Descripción', dataIndex: 'descripcion' },
              { title: 'Tarifa', dataIndex: 'tarifaHora', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '' },
              { title: 'Monto', dataIndex: 'monto', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
              { title: 'Facturado', dataIndex: 'facturado', render: (v: boolean) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Sí' : 'No'}</Tag>, width: 90 },
            ]} />
        </div>
      ),
    },
    {
      key: 'tareas', label: `Tareas (${Array.isArray(tareas) ? tareas.length : 0})`,
      children: (
        <div style={{ padding: 16 }}>
          <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setModalTarea(true)}>Nueva tarea</Button>
          <Table dataSource={Array.isArray(tareas) ? tareas : []} rowKey="id" size="small" scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Título', dataIndex: 'titulo' },
              { title: 'Responsable', render: (_: any, r: any) => r.profesionalNombre ? `${r.profesionalNombre} ${r.profesionalApellidos ?? ''}`.trim() : '—' },
              { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={v === 'completada' ? 'green' : v === 'en_progreso' ? 'blue' : 'default'}>{v}</Tag> },
              { title: 'Prioridad', dataIndex: 'prioridad', render: (v: string) => <Tag color={v === 'alta' ? 'red' : v === 'urgente' ? 'magenta' : 'default'}>{v}</Tag> },
              { title: 'Vence', dataIndex: 'fechaVencimiento', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '—' },
              { title: 'Hrs Est.', dataIndex: 'horasEstimadas', render: (v: number) => v != null ? `${v}h` : '—' },
            ]} />
        </div>
      ),
    },
    {
      key: 'gastos', label: `Gastos (${Array.isArray(gastos) ? gastos.length : 0})`,
      children: (
        <div style={{ padding: 16 }}>
          <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setModalGasto(true)}>Nuevo gasto</Button>
          <Table dataSource={Array.isArray(gastos) ? gastos : []} rowKey="id" size="small" scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Fecha', dataIndex: 'fecha', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
              { title: 'Descripción', dataIndex: 'descripcion' },
              { title: 'Categoría', dataIndex: 'categoria' },
              { title: 'Monto', dataIndex: 'monto', render: (v: number) => `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` },
              { title: 'Reembolsable', dataIndex: 'reembolsable', render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
              { title: 'Reembolsado', dataIndex: 'reembolsado', render: (v: boolean) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Sí' : 'Pendiente'}</Tag> },
            ]} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/servicios-pro/expedientes')} style={{ marginBottom: 16 }}>Volver</Button>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{exp.nombre}</span>
              <Tag color={ESTADO_COLOR[exp.estado] ?? 'default'}>{exp.estado?.toUpperCase()}</Tag>
              {exp.prioridad && exp.prioridad !== 'normal' && <Tag color={exp.prioridad === 'urgente' ? 'red' : exp.prioridad === 'alta' ? 'orange' : 'blue'}>{exp.prioridad}</Tag>}
            </div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{exp.numero} · {exp.clienteNombre}</div>
          </div>
        </div>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Modal tiempo */}
      <Modal open={modalTiempo} title="Registrar Tiempo"
        onCancel={() => { setModalTiempo(false); formTiempo.resetFields(); }}
        onOk={() => formTiempo.validateFields().then(v => mutTiempo.mutate({ ...v, expedienteId: expId, fecha: v.fecha?.format('YYYY-MM-DD') }))}
        confirmLoading={mutTiempo.isPending}>
        <Form form={formTiempo} layout="vertical">
          <Form.Item name="profesionalId" label="Profesional" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="horas" label="Horas" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0.25} step={0.25} /></Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="facturable" label="Facturable" initialValue={true}>
            <Select><Select.Option value={true}>Sí</Select.Option><Select.Option value={false}>No</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal tarea */}
      <Modal open={modalTarea} title="Nueva Tarea"
        onCancel={() => { setModalTarea(false); formTarea.resetFields(); }}
        onOk={() => formTarea.validateFields().then(v => mutTarea.mutate({ ...v, expedienteId: expId, fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD') }))}
        confirmLoading={mutTarea.isPending}>
        <Form form={formTarea} layout="vertical">
          <Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="profesionalId" label="Profesional">
            <Select allowClear showSearch optionFilterProp="children">
              {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha vencimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="horasEstimadas" label="Horas estimadas"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item>
          <Form.Item name="prioridad" label="Prioridad" initialValue="normal">
            <Select><Select.Option value="baja">Baja</Select.Option><Select.Option value="normal">Normal</Select.Option><Select.Option value="alta">Alta</Select.Option><Select.Option value="urgente">Urgente</Select.Option></Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal gasto */}
      <Modal open={modalGasto} title="Registrar Gasto"
        onCancel={() => { setModalGasto(false); formGasto.resetFields(); }}
        onOk={() => formGasto.validateFields().then(v => mutGasto.mutate({ ...v, expedienteId: expId, fecha: v.fecha?.format('YYYY-MM-DD') }))}
        confirmLoading={mutGasto.isPending}>
        <Form form={formGasto} layout="vertical">
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="categoria" label="Categoría"><Input placeholder="viaje, copias, registro..." /></Form.Item>
          <Form.Item name="monto" label="Monto" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="comprobante" label="Comprobante"><Input /></Form.Item>
          <Form.Item name="reembolsable" label="Reembolsable" initialValue={true}>
            <Select><Select.Option value={true}>Sí</Select.Option><Select.Option value={false}>No</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal generar factura */}
      <Modal open={modalFactura} title="Generar Factura de Honorarios"
        onCancel={() => { setModalFactura(false); formFactura.resetFields(); }}
        onOk={() => formFactura.validateFields().then(v => mutFactura.mutate({ ...v, desde: v.desde?.format('YYYY-MM-DD'), hasta: v.hasta?.format('YYYY-MM-DD'), fechaVencimiento: v.fechaVencimiento?.format('YYYY-MM-DD') }))}
        confirmLoading={mutFactura.isPending}>
        <Form form={formFactura} layout="vertical">
          <Form.Item name="desde" label="Período desde"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="hasta" label="Período hasta"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha de vencimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="descuento" label="Descuento"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="conItbis" label="Aplicar ITBIS (18%)">
            <Select><Select.Option value={true}>Sí</Select.Option><Select.Option value={false}>No</Select.Option></Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
