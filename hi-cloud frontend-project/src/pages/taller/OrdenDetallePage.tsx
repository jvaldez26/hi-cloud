import { useState } from 'react';
import {
  Card, Tabs, Button, Tag, Typography, Descriptions, Spin, Space, Select,
  Table, Modal, Form, Input, InputNumber, message, Popconfirm, Steps, Divider,
  Row, Col, Statistic,
} from 'antd';
import {
  ArrowLeftOutlined, FilePdfOutlined, PrinterOutlined, CheckOutlined,
  PlusOutlined, DeleteOutlined, EditOutlined, DollarOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { tallerApi } from '../../api/taller.api';
import { fmt as fmtObj } from '../../utils/formatters';
const fmt = (v: any) => fmtObj.date(v);
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ESTADO_COLOR: Record<string, string> = {
  recibido: 'default', diagnostico: 'processing', aprobado: 'warning',
  en_proceso: 'blue', listo: 'success', entregado: 'green', cancelado: 'error',
};
const ESTADOS_FLUJO = ['recibido','diagnostico','aprobado','en_proceso','listo','entregado'];
const PRIORIDAD_COLOR: Record<string, string> = {
  baja: 'default', normal: 'blue', alta: 'orange', urgente: 'red',
};

function money(v: any) {
  return `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

export default function OrdenDetallePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [svcModal, setSvcModal] = useState(false);
  const [repModal, setRepModal] = useState(false);
  const [diagModal, setDiagModal] = useState(false);
  const [estadoModal, setEstadoModal] = useState(false);
  const [svcForm] = Form.useForm();
  const [repForm] = Form.useForm();
  const [diagForm] = Form.useForm();
  const [estadoForm] = Form.useForm();

  const { data: orden, isLoading } = useQuery({
    queryKey: ['taller-orden', Number(id)],
    queryFn: () => tallerApi.orden(Number(id)),
    enabled: !!id,
  });

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['taller-tecnicos'],
    queryFn: tallerApi.tecnicos,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['taller-orden', Number(id)] });

  const addSvc = useMutation({
    mutationFn: (vals: any) => tallerApi.agregarServicio(Number(id), vals),
    onSuccess: () => { invalidate(); message.success('Servicio agregado'); setSvcModal(false); svcForm.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const delSvc = useMutation({
    mutationFn: (sid: number) => tallerApi.eliminarServicio(Number(id), sid),
    onSuccess: () => { invalidate(); message.success('Eliminado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const addRep = useMutation({
    mutationFn: (vals: any) => tallerApi.agregarRepuesto(Number(id), vals),
    onSuccess: () => { invalidate(); message.success('Repuesto agregado'); setRepModal(false); repForm.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const delRep = useMutation({
    mutationFn: (rid: number) => tallerApi.eliminarRepuesto(Number(id), rid),
    onSuccess: () => { invalidate(); message.success('Eliminado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const addDiag = useMutation({
    mutationFn: (vals: any) => tallerApi.agregarDiagnostico(Number(id), vals),
    onSuccess: () => { invalidate(); message.success('Diagnóstico guardado'); setDiagModal(false); diagForm.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cambiarEstado = useMutation({
    mutationFn: (vals: any) => tallerApi.cambiarEstado(Number(id), vals),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['taller-ordenes'] });
      message.success('Estado actualizado');
      setEstadoModal(false);
      estadoForm.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const aprobar = useMutation({
    mutationFn: () => tallerApi.aprobarOrden(Number(id), { formaAprobacion: 'verbal' }),
    onSuccess: () => { invalidate(); message.success('Orden aprobada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>;
  if (!orden) return null;

  const stepIdx = ESTADOS_FLUJO.indexOf(orden.estado);

  const svcColumns = [
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Cant.', dataIndex: 'cantidad', width: 70 },
    { title: 'P.Unit.', dataIndex: 'precioUnitario', width: 120, render: (v: any) => money(v) },
    { title: 'Total', dataIndex: 'total', width: 120, render: (v: any) => money(v) },
    { title: 'Técnico', dataIndex: 'tecnicoNombre', width: 130, render: (v: any) => v ?? '—' },
    {
      title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar?" onConfirm={() => delSvc.mutate(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const repColumns = [
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Ref.', dataIndex: 'referencia', width: 100, render: (v: any) => v ?? '—' },
    { title: 'Cant.', dataIndex: 'cantidad', width: 70 },
    { title: 'P.Unit.', dataIndex: 'precioUnitario', width: 120, render: (v: any) => money(v) },
    { title: 'Total', dataIndex: 'total', width: 120, render: (v: any) => money(v) },
    {
      title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar?" onConfirm={() => delRep.mutate(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const items = [
    {
      key: 'resumen',
      label: 'Resumen',
      children: (
        <div>
          {/* Steps */}
          <Steps
            current={stepIdx === -1 ? 0 : stepIdx}
            size="small"
            style={{ marginBottom: 20 }}
            items={ESTADOS_FLUJO.map(e => ({ title: e.replace('_', ' ').toUpperCase() }))}
          />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Descriptions bordered size="small" column={1} title="Vehículo">
                <Descriptions.Item label="Placa">{orden.placa ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Vehículo">{orden.marca} {orden.modelo} {orden.anio ?? ''}</Descriptions.Item>
                <Descriptions.Item label="Color">{orden.color ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="VIN">{orden.vin ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Km ingreso">{orden.kilometrajeIngreso ? Number(orden.kilometrajeIngreso).toLocaleString() : '—'}</Descriptions.Item>
              </Descriptions>
            </Col>
            <Col xs={24} md={12}>
              <Descriptions bordered size="small" column={1} title="Orden">
                <Descriptions.Item label="N°">{orden.numero}</Descriptions.Item>
                <Descriptions.Item label="Técnico">{orden.tecnicoNombre ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Prioridad">
                  <Tag color={PRIORIDAD_COLOR[orden.prioridad] ?? 'default'}>{orden.prioridad?.toUpperCase()}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Ingreso">{fmt(orden.fechaIngreso)}</Descriptions.Item>
                <Descriptions.Item label="Entrega est.">{fmt(orden.fechaEstimadaEntrega)}</Descriptions.Item>
                <Descriptions.Item label="Motivo">{orden.motivoIngreso}</Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
          <Divider />
          <Row gutter={16}>
            <Col><Statistic title="Mano de obra" value={money(orden.subtotalManoObra)} /></Col>
            <Col><Statistic title="Repuestos" value={money(orden.subtotalRepuestos)} /></Col>
            <Col><Statistic title="ITBIS (18%)" value={money(orden.itbis)} /></Col>
            <Col><Statistic title="Descuento" value={money(orden.descuento)} /></Col>
            <Col><Statistic title="TOTAL" value={money(orden.total)} valueStyle={{ color: '#1677ff', fontSize: 22 }} /></Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'diagnostico',
      label: 'Diagnóstico',
      children: (
        <div>
          <Button icon={<PlusOutlined />} onClick={() => setDiagModal(true)} style={{ marginBottom: 12 }}>
            Agregar diagnóstico
          </Button>
          {(orden.diagnosticos ?? []).map((d: any, i: number) => (
            <Card key={i} size="small" style={{ marginBottom: 8 }}>
              <Space>
                {d.sistema && <Tag>{d.sistema}</Tag>}
                {d.severidad && <Tag color={d.severidad === 'critico' ? 'red' : d.severidad === 'alto' ? 'orange' : 'default'}>{d.severidad?.toUpperCase()}</Tag>}
                {d.requiereAtencionInmediata && <Tag color="red">ATENCIÓN INMEDIATA</Tag>}
              </Space>
              <Text style={{ display: 'block', marginTop: 4 }}>{d.descripcion}</Text>
              {d.recomendacion && <Text type="secondary" style={{ fontSize: 12 }}>→ {d.recomendacion}</Text>}
            </Card>
          ))}
        </div>
      ),
    },
    {
      key: 'servicios',
      label: 'Servicios',
      children: (
        <div>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setSvcModal(true)} style={{ marginBottom: 12 }}>
            Agregar servicio
          </Button>
          <Table
            dataSource={orden.servicios ?? []}
            columns={svcColumns}
            rowKey="id"
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={false}
          />
        </div>
      ),
    },
    {
      key: 'repuestos',
      label: 'Repuestos',
      children: (
        <div>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setRepModal(true)} style={{ marginBottom: 12 }}>
            Agregar repuesto
          </Button>
          <Table
            dataSource={orden.repuestos ?? []}
            columns={repColumns}
            rowKey="id"
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={false}
          />
        </div>
      ),
    },
  ];

  const token_url = localStorage.getItem('token');
  const pdfBase = tallerApi.pdfOrden(Number(id));
  const presBase = tallerApi.pdfPresupuesto(Number(id));

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/taller/ordenes')}>Volver</Button>
        <Title level={4} style={{ margin: 0 }}>
          <ToolOutlined style={{ marginRight: 8 }} />
          Orden {orden.numero}
          <Tag color={ESTADO_COLOR[orden.estado] ?? 'default'} style={{ marginLeft: 12 }}>
            {orden.estado?.toUpperCase().replace('_', ' ')}
          </Tag>
        </Title>
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          icon={<EditOutlined />}
          onClick={() => setEstadoModal(true)}
        >
          Cambiar estado
        </Button>
        {!orden.presupuestoAprobado && (
          <Popconfirm title="¿Aprobar presupuesto?" onConfirm={() => aprobar.mutate()}>
            <Button icon={<CheckOutlined />} type="primary" ghost loading={aprobar.isPending}>
              Aprobar presupuesto
            </Button>
          </Popconfirm>
        )}
        <Button
          icon={<FilePdfOutlined />}
          href={`${pdfBase}?token=${token_url}`}
          target="_blank"
        >
          PDF Orden
        </Button>
        <Button
          icon={<PrinterOutlined />}
          href={`${presBase}?token=${token_url}`}
          target="_blank"
        >
          PDF Presupuesto
        </Button>
      </Space>

      <Card>
        <Tabs items={items} />
      </Card>

      {/* Modal servicios */}
      <Modal
        title="Agregar Servicio / Mano de obra"
        open={svcModal}
        onCancel={() => { setSvcModal(false); svcForm.resetFields(); }}
        onOk={() => svcForm.validateFields().then(addSvc.mutate)}
        confirmLoading={addSvc.isPending}
        destroyOnClose
      >
        <Form form={svcForm} layout="vertical">
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="precioUnitario" label="Precio unitario" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
            <Form.Item name="cantidad" label="Cantidad" initialValue={1}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="horasEstimadas" label="Horas estimadas">
              <InputNumber style={{ width: '100%' }} min={0} step={0.5} />
            </Form.Item>
            <Form.Item name="tecnicoId" label="Técnico">
              <Select allowClear placeholder="Asignar técnico">
                {(tecnicos as any[]).filter((t: any) => t.isActive).map((t: any) => (
                  <Select.Option key={t.id} value={t.id}>{t.nombre}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal repuestos */}
      <Modal
        title="Agregar Repuesto / Material"
        open={repModal}
        onCancel={() => { setRepModal(false); repForm.resetFields(); }}
        onOk={() => repForm.validateFields().then(addRep.mutate)}
        confirmLoading={addRep.isPending}
        destroyOnClose
      >
        <Form form={repForm} layout="vertical">
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="referencia" label="Referencia/Código">
              <Input />
            </Form.Item>
            <Form.Item name="marca" label="Marca">
              <Input />
            </Form.Item>
            <Form.Item name="precioUnitario" label="Precio unitario" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
            </Form.Item>
            <Form.Item name="cantidad" label="Cantidad" initialValue={1}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </div>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal diagnóstico */}
      <Modal
        title="Agregar Diagnóstico"
        open={diagModal}
        onCancel={() => { setDiagModal(false); diagForm.resetFields(); }}
        onOk={() => diagForm.validateFields().then(addDiag.mutate)}
        confirmLoading={addDiag.isPending}
        destroyOnClose
      >
        <Form form={diagForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="sistema" label="Sistema">
              <Select allowClear>
                {['Motor','Frenos','Suspensión','Eléctrico','Transmisión','A/C','Llantas','Carrocería','Otro'].map(s => (
                  <Select.Option key={s} value={s}>{s}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="severidad" label="Severidad">
              <Select allowClear>
                <Select.Option value="bajo">Bajo</Select.Option>
                <Select.Option value="medio">Medio</Select.Option>
                <Select.Option value="alto">Alto</Select.Option>
                <Select.Option value="critico">Crítico</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="recomendacion" label="Recomendación">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="costoEstimado" label="Costo estimado">
            <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" />
          </Form.Item>
          <Form.Item name="tecnicoId" label="Técnico">
            <Select allowClear>
              {(tecnicos as any[]).filter((t: any) => t.isActive).map((t: any) => (
                <Select.Option key={t.id} value={t.id}>{t.nombre}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal cambio estado */}
      <Modal
        title="Cambiar Estado"
        open={estadoModal}
        onCancel={() => { setEstadoModal(false); estadoForm.resetFields(); }}
        onOk={() => estadoForm.validateFields().then(cambiarEstado.mutate)}
        confirmLoading={cambiarEstado.isPending}
        destroyOnClose
      >
        <Form form={estadoForm} layout="vertical" initialValues={{ estado: orden.estado }}>
          <Form.Item name="estado" label="Nuevo estado" rules={[{ required: true }]}>
            <Select>
              {[...ESTADOS_FLUJO,'cancelado'].map(e => (
                <Select.Option key={e} value={e}>
                  <Tag color={ESTADO_COLOR[e]}>{e.toUpperCase().replace('_', ' ')}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas / Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
