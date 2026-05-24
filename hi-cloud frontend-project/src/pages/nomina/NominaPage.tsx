import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { TableActions } from '../../components/ui/TableActions';
import {
  Tabs, Table, Button, Tag, Space, Modal, Form, Input, InputNumber,
  Select, Row, Col, Typography, Card, Statistic, Popconfirm,
  message, Descriptions, Drawer, Tooltip, Alert, Badge,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, CheckOutlined, DollarOutlined,
  UserOutlined, FileExcelOutlined, SearchOutlined, FilePdfOutlined,
  BankOutlined, FileTextOutlined, ThunderboltOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nominaApi, type EmpleadoPayload, type PeriodoPayload, type NovedadPayload, type ContratoPayload } from '../../api/nomina.api';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const estadoNominaColor: Record<string, string> = {
  borrador: 'default', procesada: 'blue', pagada: 'green', anulada: 'red',
};

const tipoNovedadLabel: Record<string, { label: string; color: string }> = {
  bono:        { label: 'Bono',          color: 'green'  },
  horas_extras:{ label: 'Horas Extras',  color: 'blue'   },
  ausencia:    { label: 'Ausencia',      color: 'orange' },
  descuento:   { label: 'Descuento',     color: 'red'    },
  otro:        { label: 'Otro',          color: 'default'},
};

// ── Empleados ──────────────────────────────────────────────────────────────────
function EmpleadosTab() {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [form] = Form.useForm<EmpleadoPayload>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['empleados', page, search],
    queryFn: () => nominaApi.empleados(page, 10, search),
  });

  const createMut = useMutation({
    mutationFn: nominaApi.createEmpleado,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); setOpen(false); message.success('Empleado registrado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar empleado'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<EmpleadoPayload> }) => nominaApi.updateEmpleado(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empleados'] }); setOpen(false); message.success('Actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar empleado'),
  });

  const openEdit = (r: any) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      fechaNacimiento: r.fechaNacimiento?.split('T')[0],
      fechaIngreso: r.fechaIngreso?.split('T')[0],
    });
    setOpen(true);
  };
  const closeModal = () => { setOpen(false); setEditing(null); form.resetFields(); };

  const COLS_DEF = [
    { key: 'cedula',       label: 'Cédula',      defaultVisible: false },
    { key: 'nombre',       label: 'Nombre',      defaultVisible: true  },
    { key: 'cargo',        label: 'Cargo',       defaultVisible: true  },
    { key: 'departamento', label: 'Depto.',      defaultVisible: true  },
    { key: 'salarioBase',  label: 'Salario',     defaultVisible: true  },
    { key: 'estado',       label: 'Estado',      defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcNom } = useColumnVisibility('nomina-empleados', COLS_DEF);

  const cols = [
    { title: 'Cédula',   key: 'cedula',       dataIndex: 'cedula',       width: 120 },
    { title: 'Nombre',   key: 'nombre', ellipsis: true, render: (_: any, r: any) => `${r.nombre} ${r.apellido}` },
    { title: 'Cargo',    key: 'cargo',        dataIndex: 'cargo',        ellipsis: true },
    { title: 'Depto.',   key: 'departamento', dataIndex: 'departamento', width: 120 },
    { title: 'Salario',  key: 'salarioBase',  dataIndex: 'salarioBase',  width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Estado',   key: 'estado',       dataIndex: 'estado',       width: 90,
      render: (v: string) => <Tag color={v === 'activo' ? 'green' : 'red'}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 70, isActions: true,
      render: (_: any, r: any) => (
        <TableActions onView={() => openEdit(r)} viewLabel="Ver empleado"
          items={[{ key: 'editar', label: 'Editar empleado', icon: <EyeOutlined />, onClick: () => openEdit(r) }]} />
      )},
  ];

  return (
    <>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input placeholder="Buscar nombre, cédula, cargo..." prefix={<SearchOutlined />}
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: '100%', maxWidth: 280 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>{data?.meta?.total ?? 0} empleados</Text>
          </Space>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (data?.data ?? []).map((e: any) => ({
                'Cédula': e.cedula, 'Nombre': `${e.nombre} ${e.apellido}`,
                'Cargo': e.cargo, 'Departamento': e.departamento,
                'Salario Base': Number(e.salarioBase ?? 0),
                'Tipo Pago': e.tipoPago, 'Estado': e.estado,
                'Ingreso': e.fechaIngreso ? dayjs(e.fechaIngreso).format('DD/MM/YYYY') : '',
              }));
              exportarExcel(filas, `Empleados-${dayjs().format('YYYY-MM-DD')}`);
            }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['empleados']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
              Nuevo empleado
            </Button>
          </Space>
        </Col>
      </Row>
      <Table columns={fcNom(cols as any)} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }}
        scroll={{ x: 'max-content' }} />

      <Modal title={editing ? 'Editar empleado' : 'Nuevo empleado'} open={open} onCancel={closeModal} footer={null} width={780}>
        <Form form={form} layout="vertical"
          onFinish={(v) => editing ? updateMut.mutate({ id: editing.id, body: v }) : createMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="cedula" label="Cédula (11 dígitos)" rules={[{ required: true, pattern: /^\d{11}$/, message: '11 dígitos' }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="apellido" label="Apellido" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaNacimiento" label="Fecha Nacimiento" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaIngreso" label="Fecha Ingreso" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="cargo" label="Cargo" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="departamento" label="Departamento"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="salarioBase" label="Salario Base (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipoPago" label="Tipo Pago" rules={[{ required: true }]}>
              <Select options={[{ value: 'mensual', label: 'Mensual' }, { value: 'quincenal', label: 'Quincenal' }]} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipoContrato" label="Contrato" rules={[{ required: true }]}>
              <Select options={[{ value: 'indefinido', label: 'Indefinido' }, { value: 'fijo', label: 'Fijo' }, { value: 'temporal', label: 'Temporal' }]} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="banco" label="Banco"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="cuentaBancaria" label="No. Cuenta"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="otrasDeduccionesFixed" label="Otras Ded. Fijas (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending}>{editing ? 'Actualizar' : 'Registrar'}</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Novedades ──────────────────────────────────────────────────────────────────
function NovedadesTab() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<NovedadPayload>();
  const qc = useQueryClient();
  const watchTipo = Form.useWatch('tipo', form);

  const { data: novedades, isLoading } = useQuery({
    queryKey: ['novedades'],
    queryFn: () => nominaApi.novedades(undefined, undefined, false),
  });
  const { data: empleados } = useQuery({
    queryKey: ['empleados', 1, ''],
    queryFn: () => nominaApi.empleados(1, 100),
  });

  const createMut = useMutation({
    mutationFn: nominaApi.createNovedad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['novedades'] }); qc.invalidateQueries({ queryKey: ['nomina-resumen'] }); setOpen(false); form.resetFields(); message.success('Novedad registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: nominaApi.deleteNovedad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['novedades'] }); qc.invalidateQueries({ queryKey: ['nomina-resumen'] }); message.success('Novedad eliminada'); },
  });

  const esIngreso = (tipo: string) => tipo === 'bono' || tipo === 'horas_extras' || tipo === 'otro';

  const cols = [
    { title: 'Empleado', key: 'emp', ellipsis: true,
      render: (_: any, r: any) => `${r.empleado?.nombre ?? ''} ${r.empleado?.apellido ?? ''}` },
    { title: 'Tipo', dataIndex: 'tipo', width: 120,
      render: (v: string) => { const t = tipoNovedadLabel[v]; return <Tag color={t?.color}>{t?.label ?? v}</Tag>; } },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Monto / Horas', key: 'valor', width: 130, align: 'right' as const,
      render: (_: any, r: any) => r.tipo === 'horas_extras'
        ? <span style={{ color: '#1677ff' }}><strong>{r.horasExtras}h</strong></span>
        : <span style={{ color: esIngreso(r.tipo) ? '#52c41a' : '#ff4d4f' }}>
            {esIngreso(r.tipo) ? '+' : '-'}{fmt.money(Number(r.monto ?? 0))}
          </span> },
    { title: 'Estado', dataIndex: 'aplicado', width: 100,
      render: (v: boolean) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Aplicada' : 'Pendiente'}</Tag> },
    { title: '', key: 'del', width: 60,
      render: (_: any, r: any) => !r.aplicado && (
        <Popconfirm title="¿Eliminar novedad?" onConfirm={() => deleteMut.mutate(r.id)}>
          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} />
        </Popconfirm>
      ) },
  ];

  const empOptions = (empleados?.data ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.nombre} ${e.apellido} — ${e.cedula}`,
  }));

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Alert
            type="info" showIcon
            message="Las novedades pendientes se aplican automáticamente al generar el próximo período de nómina."
            style={{ fontSize: 12 }}
          />
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
            Nueva novedad
          </Button>
        </Col>
      </Row>
      <Table columns={cols} dataSource={novedades ?? []} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 15 }} 
        scroll={{ x: 'max-content' }} />

      <Modal title="Registrar novedad" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Form.Item name="empleadoId" label="Empleado" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={empOptions} placeholder="Seleccionar empleado" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'bono',         label: '💰 Bono adicional' },
                  { value: 'horas_extras', label: '⏰ Horas extras' },
                  { value: 'ausencia',     label: '📅 Ausencia / Descuento días' },
                  { value: 'descuento',    label: '➖ Descuento variable' },
                  { value: 'otro',         label: '📋 Otro ingreso' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              {watchTipo === 'horas_extras' ? (
                <Form.Item name="horasExtras" label="Cantidad de horas" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={1} max={240} addonAfter="h"
                    placeholder="ej. 8" />
                </Form.Item>
              ) : (
                <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              )}
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input placeholder="ej. Bono de producción Q1, Ausencia día 15..." />
          </Form.Item>
          {watchTipo === 'horas_extras' && (
            <Alert type="info" showIcon message="Art. 147 CT-RD: se pagarán al 135% del valor hora ordinaria (salario mensual ÷ 240h × 1.35)." style={{ marginBottom: 12, fontSize: 12 }} />
          )}
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Contratos Laborales ────────────────────────────────────────────────────────
function ContratosTab() {
  const [open,    setOpen]    = useState(false);
  const [detail,  setDetail]  = useState<any>(null);
  const [form] = Form.useForm<ContratoPayload>();
  const qc = useQueryClient();
  const watchTipo = Form.useWatch('tipo', form);

  const { data: contratos, isLoading } = useQuery({
    queryKey: ['contratos-laborales'],
    queryFn: () => nominaApi.contratos(),
  });
  const { data: empleados } = useQuery({
    queryKey: ['empleados', 1, ''],
    queryFn: () => nominaApi.empleados(1, 100),
  });

  const createMut = useMutation({
    mutationFn: nominaApi.createContrato,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contratos-laborales'] }); setOpen(false); form.resetFields(); message.success('Contrato creado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => nominaApi.updateContrato(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contratos-laborales'] }); setDetail(null); message.success('Contrato actualizado'); },
  });

  const estadoContratColor: Record<string, string> = { activo: 'green', vencido: 'orange', rescindido: 'red' };

  const cols = [
    { title: 'N°',       dataIndex: 'numero',    width: 110 },
    { title: 'Empleado', key: 'emp', ellipsis: true,
      render: (_: any, r: any) => `${r.empleado?.nombre ?? ''} ${r.empleado?.apellido ?? ''}` },
    { title: 'Tipo',     dataIndex: 'tipo',       width: 100,
      render: (v: string) => <Tag>{v?.toUpperCase()}</Tag> },
    { title: 'Cargo',    dataIndex: 'cargo',      ellipsis: true },
    { title: 'Salario',  dataIndex: 'salario',    width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Inicio',   dataIndex: 'fechaInicio', width: 105, render: (v: string) => fmt.date(v) },
    { title: 'Vence',    dataIndex: 'fechaFin',    width: 105, render: (v: string) => v ? fmt.date(v) : <Text type="secondary">Indefinido</Text> },
    { title: 'Estado',   dataIndex: 'estado',     width: 100,
      render: (v: string) => <Tag color={estadoContratColor[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'ver', width: 60,
      render: (_: any, r: any) => <Button type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} /> },
  ];

  const empOptions = (empleados?.data ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.nombre} ${e.apellido} — ${e.cedula}`,
  }));

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col />
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
            Nuevo contrato
          </Button>
        </Col>
      </Row>
      <Table columns={cols} dataSource={contratos ?? []} rowKey="id" loading={isLoading} size="small" pagination={{ pageSize: 15 }} 
        scroll={{ x: 'max-content' }} />

      <Modal title="Nuevo contrato laboral" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}>
              <Form.Item name="empleadoId" label="Empleado" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={empOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="numero" label="N° Contrato (opcional)"><Input placeholder="Auto" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="tipo" label="Tipo de contrato" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'indefinido', label: 'Indefinido' },
                  { value: 'fijo',       label: 'Plazo Fijo' },
                  { value: 'temporal',   label: 'Temporal' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaInicio" label="Fecha inicio" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fechaFin" label="Fecha vencimiento"
                rules={[{ required: watchTipo !== 'indefinido', message: 'Requerido para contratos con plazo' }]}>
                <Input type="date" disabled={watchTipo === 'indefinido'} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="salario" label="Salario (RD$)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="cargo" label="Cargo" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="departamento" label="Departamento"><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="horasSemana" label="Horas/semana">
                <InputNumber style={{ width: '100%' }} min={1} max={48} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="lugarTrabajo" label="Lugar de trabajo"><Input /></Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="clausulas" label="Cláusulas adicionales">
                <Input.TextArea rows={4} placeholder="Condiciones especiales, restricciones, beneficios adicionales..." />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Crear contrato</Button></Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title={`Contrato ${detail?.numero}`} open={!!detail} onClose={() => setDetail(null)} width={540}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Empleado" span={2}>
                <strong>{detail.empleado?.nombre} {detail.empleado?.apellido}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Tipo"><Tag>{detail.tipo?.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={{ activo: 'green', vencido: 'orange', rescindido: 'red' }[detail.estado as string]}>
                  {detail.estado?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Cargo">{detail.cargo}</Descriptions.Item>
              <Descriptions.Item label="Departamento">{detail.departamento ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Salario">{fmt.money(detail.salario)}</Descriptions.Item>
              <Descriptions.Item label="Horas/sem">{detail.horasSemana ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Inicio">{fmt.date(detail.fechaInicio)}</Descriptions.Item>
              <Descriptions.Item label="Vence">{detail.fechaFin ? fmt.date(detail.fechaFin) : 'Indefinido'}</Descriptions.Item>
              {detail.lugarTrabajo && <Descriptions.Item label="Lugar" span={2}>{detail.lugarTrabajo}</Descriptions.Item>}
            </Descriptions>
            {detail.clausulas && (
              <Card size="small" title="Cláusulas adicionales" style={{ marginBottom: 16 }}>
                <Text style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{detail.clausulas}</Text>
              </Card>
            )}
            {detail.estado === 'activo' && (
              <Space>
                <Popconfirm
                  title="¿Rescindir contrato?"
                  description="Esta acción no se puede deshacer."
                  onConfirm={() => updateMut.mutate({ id: detail.id, body: { estado: 'rescindido' } })}>
                  <Button danger>Rescindir</Button>
                </Popconfirm>
              </Space>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

// ── Períodos de Nómina ─────────────────────────────────────────────────────────
function PeriodosTab() {
  const [openCreate, setOpenCreate] = useState(false);
  const [openDetail, setOpenDetail] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);
  const [form] = Form.useForm<PeriodoPayload>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['periodos', page], queryFn: () => nominaApi.periodos(page, 10) });
  const { data: lineas } = useQuery({
    queryKey: ['periodo-lineas', openDetail?.id],
    queryFn: () => nominaApi.getLineas(openDetail.id),
    enabled: !!openDetail,
  });

  const createMut = useMutation({
    mutationFn: nominaApi.createPeriodo,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['periodos'] }); qc.invalidateQueries({ queryKey: ['nomina-resumen'] }); setOpenCreate(false); form.resetFields(); message.success('Nómina generada con novedades aplicadas'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al generar nómina'),
  });
  const procesarMut = useMutation({ mutationFn: nominaApi.procesarPeriodo, onSuccess: () => { qc.invalidateQueries({ queryKey: ['periodos'] }); message.success('Nómina procesada'); } });
  const pagarMut    = useMutation({ mutationFn: nominaApi.pagarPeriodo,    onSuccess: () => { qc.invalidateQueries({ queryKey: ['periodos'] }); qc.invalidateQueries({ queryKey: ['nomina-resumen'] }); message.success('Nómina marcada como pagada'); } });

  const cols = [
    { title: 'Período',     dataIndex: 'periodo',           width: 100 },
    { title: 'Fecha Pago',  dataIndex: 'fechaPago',         width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Empleados',   dataIndex: 'totalEmpleados',    width: 90 },
    { title: 'Total Bruto', dataIndex: 'totalSalariosBruto', width: 130, render: (v: number) => fmt.money(v) },
    { title: 'Total Neto',  dataIndex: 'totalNeto',         width: 130, render: (v: number) => <strong>{fmt.money(v)}</strong> },
    { title: 'Estado',      dataIndex: 'estado',            width: 100,
      render: (v: string) => <Tag color={estadoNominaColor[v]}>{v?.toUpperCase()}</Tag> },
    {
      title: '', key: 'actions', width: 210,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenDetail(r)}>Ver</Button>
          {r.estado === 'borrador'  && <Button size="small" type="primary" icon={<CheckOutlined />} loading={procesarMut.isPending} onClick={() => procesarMut.mutate(r.id)}>Procesar</Button>}
          {r.estado === 'procesada' && <Button size="small" type="primary" icon={<DollarOutlined />} loading={pagarMut.isPending} onClick={() => pagarMut.mutate(r.id)}>Pagar</Button>}
        </Space>
      ),
    },
  ];

  const lineasCols = [
    { title: 'Empleado', key: 'emp', ellipsis: true, render: (_: any, r: any) => `${r.empleado?.nombre ?? ''} ${r.empleado?.apellido ?? ''}` },
    { title: 'Bruto',    dataIndex: 'salarioBruto',      render: (v: number) => fmt.money(v) },
    { title: 'H.Extras', key: 'he', width: 90,
      render: (_: any, r: any) => r.horasExtras > 0
        ? <Tooltip title={fmt.money(Number(r.montoHorasExtras))}><Tag color="blue">{r.horasExtras}h</Tag></Tooltip>
        : '—' },
    { title: 'Bonos',    dataIndex: 'bonos',             width: 110, render: (v: number) => v > 0 ? <span style={{ color: '#52c41a' }}>{fmt.money(v)}</span> : '—' },
    { title: 'TSS',      dataIndex: 'totalTSSEmpleado',  width: 110, render: (v: number) => fmt.money(v) },
    { title: 'ISR',      dataIndex: 'isr',               width: 110, render: (v: number) => fmt.money(v) },
    { title: 'Desc.',    dataIndex: 'otrosDescuentos',   width: 90,  render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>-{fmt.money(v)}</span> : '—' },
    { title: 'Neto',     dataIndex: 'salarioNeto',       width: 130, render: (v: number) => <strong style={{ color: '#52c41a' }}>{fmt.money(v)}</strong> },
    {
      title: '', key: 'recibo', width: 60, align: 'center' as const,
      render: (_: any, r: any) => (
        <Tooltip title="Descargar recibo PDF">
          <Button
            size="small"
            type="text"
            icon={<FilePdfOutlined />}
            loading={pdfLoading === r.empleadoId}
            disabled={pdfLoading !== null}
            onClick={async () => {
              setPdfLoading(r.empleadoId);
              try {
                const blob = await nominaApi.getReciboPdf(openDetail?.id, r.empleadoId);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `Recibo-${r.empleado?.nombre ?? r.empleadoId}-${openDetail?.periodo}.pdf`;
                a.click();
                URL.revokeObjectURL(a.href);
              } catch (e: any) {
                message.error(e?.response?.data?.message ?? 'Error generando recibo PDF');
              } finally {
                setPdfLoading(null);
              }
            }}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col />
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpenCreate(true); form.resetFields(); }}>
            Generar nómina
          </Button>
        </Col>
      </Row>
      <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} 
        scroll={{ x: 'max-content' }} />

      <Modal title="Generar período de nómina" open={openCreate} onCancel={() => setOpenCreate(false)} footer={null} width={520}>
        <Alert type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }}
          message="Se aplicarán automáticamente todas las novedades pendientes (bonos, horas extras, ausencias, descuentos)." />
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate({ ...v, diasPeriodo: 30 })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="periodo" label="Período (YYYY-MM)" rules={[{ required: true, pattern: /^\d{4}-\d{2}$/ }]}><Input placeholder="2026-05" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaPago" label="Fecha de Pago" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaInicio" label="Fecha Inicio" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaFin" label="Fecha Fin" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenCreate(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Calcular nómina</Button></Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title={`Detalle — Nómina ${openDetail?.periodo}`} open={!!openDetail}
        onClose={() => setOpenDetail(null)} width={980}
        extra={
          <Space>
            <Button icon={<BankOutlined />} size="small"
              onClick={async () => {
                try {
                  await nominaApi.descargarArchivoBanco(openDetail.id, openDetail.periodo);
                  message.success('Archivo de banco descargado');
                } catch { message.error('Error generando archivo'); }
              }}>
              Archivo Banco (ACH)
            </Button>
            <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
              const filas = (lineas ?? []).map((l: any) => ({
                'Empleado':       `${l.empleado?.nombre ?? ''} ${l.empleado?.apellido ?? ''}`,
                'Cédula':         l.empleado?.cedula ?? '',
                'Banco':          l.empleado?.banco ?? '',
                'Cuenta':         l.empleado?.cuentaBancaria ?? '',
                'Salario Base':   Number(l.salarioBase ?? 0),
                'Horas Extras':   l.horasExtras ?? 0,
                'Monto HE':       Number(l.montoHorasExtras ?? 0),
                'Bonos':          Number(l.bonos ?? 0),
                'Salario Bruto':  Number(l.salarioBruto ?? 0),
                'TSS SFS':        Number(l.tssSfsEmpleado ?? 0),
                'TSS AFP':        Number(l.tssAfpEmpleado ?? 0),
                'ISR':            Number(l.isr ?? 0),
                'Otros Desc.':    Number(l.otrosDescuentos ?? 0),
                'Otras Ded.':     Number(l.otrasDeduciones ?? 0),
                'Salario Neto':   Number(l.salarioNeto ?? 0),
                'TSS Patronal':   Number(l.totalTSSPatronal ?? 0),
                'Costo Empresa':  Number(l.costoTotalEmpleado ?? 0),
              }));
              exportarExcel(filas, `Nomina-${openDetail?.periodo}`);
              message.success(`${filas.length} líneas exportadas`);
            }}>
              Excel
            </Button>
          </Space>
        }>
        {openDetail && (
          <>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              {[
                { label: 'Total Bruto',   value: openDetail.totalSalariosBruto },
                { label: 'TSS Empleados', value: openDetail.totalTSSEmpleados },
                { label: 'ISR Total',     value: openDetail.totalISR },
                { label: 'Otras Ded.',    value: openDetail.totalOtrasDeducciones },
                { label: 'Total Neto',    value: openDetail.totalNeto, color: '#52c41a' },
                { label: 'TSS Patronal',  value: openDetail.totalTSSPatronal },
                { label: 'Costo Empresa', value: openDetail.totalCostoEmpresa, color: '#1677ff' },
              ].map(k => (
                <Col xs={12} sm={8} md={6} key={k.label}>
                  <Statistic title={k.label} value={k.value ?? 0}
                    formatter={v => fmt.money(Number(v))} valueStyle={{ fontSize: 13, color: k.color }} />
                </Col>
              ))}
            </Row>
            <Table columns={lineasCols} dataSource={lineas ?? []} rowKey="id" size="small" pagination={false} scroll={{ x: 900 }} />
          </>
        )}
      </Drawer>
    </>
  );
}

// ── Page principal ─────────────────────────────────────────────────────────────
export default function NominaPage() {
  const { data: resumen } = useQuery({ queryKey: ['nomina-resumen'], queryFn: nominaApi.resumen });
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Nómina y RRHH" planMinimo={config.planMinimo} planActual={plan} />;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Nómina y Recursos Humanos</Title>

      <Card>
        <Tabs defaultActiveKey="empleados" items={[
          { key: 'empleados',  label: <><UserOutlined />  Empleados</>,           children: <EmpleadosTab /> },
          { key: 'novedades',  label: (
              <>
                <ThunderboltOutlined /> Novedades
                {(resumen?.novedadesPendientes ?? 0) > 0 && (
                  <Badge count={resumen?.novedadesPendientes} size="small" style={{ marginLeft: 6 }} />
                )}
              </>
            ),                                                                   children: <NovedadesTab /> },
          { key: 'contratos',  label: <><FileTextOutlined /> Contratos Laborales</>, children: <ContratosTab /> },
          { key: 'periodos',   label: <><DollarOutlined />  Períodos de Nómina</>,  children: <PeriodosTab /> },
        ]} />
      </Card>
    </div>
  );
}
