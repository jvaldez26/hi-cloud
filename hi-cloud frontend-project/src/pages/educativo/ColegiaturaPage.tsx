import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Select, Space, Tag, Modal, Form, Input, InputNumber,
  message, Typography, Row, Col, Card, Statistic, Tabs, DatePicker,
  Checkbox, Tooltip,
} from 'antd';
import { PlusOutlined, DollarOutlined, EditOutlined, ThunderboltOutlined, MinusCircleOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';
import { anioRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 });

function useEdList(path: string, params?: any, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled,
  });
}

// ── Resumen financiero ───────────────────────────────────────────────────────

function ResumenBar({ anioId }: { anioId?: number }) {
  const { data } = useQuery<any>({
    queryKey: ['educativo', 'colegiatura', 'resumen', anioId],
    queryFn: () =>
      api.get('/educativo/colegiatura/resumen', { params: { anioEscolarId: anioId || undefined } })
        .then(r => r.data?.data ?? r.data),
    staleTime: 30_000,
  });
  if (!data) return null;
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
      {[
        { label: 'Cobrado este mes', value: fmt.format(data.cobradoMes), color: '#52c41a' },
        { label: 'Cobrado total',    value: fmt.format(data.cobrado),    color: '#1677ff' },
        { label: 'Pendiente',        value: fmt.format(data.pendiente),  color: '#faad14' },
        { label: 'Vencido',          value: fmt.format(data.vencido),    color: '#ff4d4f' },
        { label: 'Morosos',          value: data.morosos,                color: '#ff4d4f' },
      ].map(c => (
        <Col key={c.label}>
          <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
            <Statistic title={c.label} value={c.value} valueStyle={{ fontSize: 16, color: c.color }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

// ── Modal plan de pago ───────────────────────────────────────────────────────

function PlanModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const { data: estudiantes = [] } = useEdList('estudiantes', undefined, open);
  const { data: anios = [] } = useEdList('anios-escolares', undefined, open);

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/colegiatura/planes', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'colegiatura'] });
      message.success('Plan guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal open={open} title={editing ? 'Editar plan' : 'Nuevo plan de pago'} onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending} width={520} destroyOnClose
      afterOpenChange={v => {
        if (v && editing) form.setFieldsValue(editing);
        else if (!v) form.resetFields();
      }}>
      <Form form={form} layout="vertical">
        {!editing && (
          <>
            <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
              <Select showSearch
                filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
                options={estudiantes.map((e: any) => ({
                  value: e.id, label: `${e.apellidos}, ${e.nombres}`,
                }))} />
            </Form.Item>
            <Form.Item name="anioEscolarId" label="Año escolar" rules={[{ required: true }]}>
              <Select options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item>
          </>
        )}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="montoColegiatura" label="Colegiatura mensual" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="montoMatricula" label="Monto matrícula">
              <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="diaCobro" label="Día de cobro" initialValue={5}>
              <InputNumber min={1} max={28} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="descuento" label="Descuento (%)" initialValue={0}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Modal generar cargos ─────────────────────────────────────────────────────

function GenerarCargosModal({ open, plan, onClose }: { open: boolean; plan?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedMeses, setSelectedMeses] = useState<number[]>([8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
  const [anio, setAnio] = useState(anioRD());

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/educativo/colegiatura/planes/${plan?.id}/generar-cargos`, { meses: selectedMeses, anio }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'colegiatura'] });
      message.success(`${res.data?.data?.created ?? res.data?.created ?? 0} cargos generados`);
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal open={open} title="Generar cargos de colegiatura" onCancel={onClose}
      onOk={() => mut.mutate()} confirmLoading={mut.isPending} destroyOnClose>
      {plan && <Text type="secondary">{plan.estudianteNombre} — {fmt.format(plan.montoColegiatura)}/mes</Text>}
      <div style={{ margin: '12px 0' }}>
        <Text strong>Año: </Text>
        <InputNumber value={anio} onChange={v => setAnio(v ?? anioRD())} min={2020} max={2030} />
      </div>
      <div>
        <Text strong style={{ marginBottom: 8, display: 'block' }}>Meses a generar:</Text>
        <Checkbox.Group
          value={selectedMeses}
          onChange={vals => setSelectedMeses(vals as number[])}
        >
          <Row gutter={[8, 8]}>
            {MESES.map((m, i) => (
              <Col span={8} key={i + 1}>
                <Checkbox value={i + 1}>{m}</Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </div>
    </Modal>
  );
}

// ── Modal registrar pago ─────────────────────────────────────────────────────
//
// Un pago puede cubrir varios cargos del mismo estudiante — el tutor que
// llega a pagar dos o tres cuotas atrasadas de una vez es el caso normal.
// Se abre desde el botón "Pagar" de un cargo puntual (siempre marcado), y
// se ofrecen los demás cargos pendientes/vencidos del mismo estudiante como
// opciones adicionales. El backend decide el orden real de aplicación
// (el más atrasado primero) sin importar cómo queden marcados aquí.

function PagoModal({ open, cargo, onClose }: { open: boolean; cargo?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

  const { data: otrosCargos = [] } = useQuery<any[]>({
    queryKey: ['educativo', 'colegiatura', 'cargos', 'porEstudiante', cargo?.estudianteId],
    queryFn: () =>
      api.get('/educativo/colegiatura/cargos', { params: { estudianteId: cargo?.estudianteId } })
        .then(r => (r.data?.data ?? r.data ?? [])
          .filter((c: any) => c.id !== cargo?.id && ['pendiente', 'parcial', 'vencido'].includes(c.estado))),
    enabled: open && !!cargo?.estudianteId,
    staleTime: 15_000,
  });

  const todosLosCargos = cargo ? [cargo, ...otrosCargos] : [];
  const totalSeleccionado = todosLosCargos
    .filter(c => seleccionados.includes(c.id))
    .reduce((s, c) => s + Number(c.saldoPendiente), 0);

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/colegiatura/pagos', { cargoIds: seleccionados, ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'colegiatura'] });
      message.success('Pago registrado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal open={open} title="Registrar pago" onCancel={onClose}
      onOk={() => form.validateFields().then(vals => {
        if (vals.fecha) vals.fecha = vals.fecha.format('YYYY-MM-DD');
        mut.mutate(vals);
      })}
      confirmLoading={mut.isPending} destroyOnClose
      afterOpenChange={v => {
        if (v && cargo) {
          setSeleccionados([cargo.id]);
          form.setFieldsValue({ monto: cargo.saldoPendiente, fecha: dayjs(), metodoPago: 'efectivo' });
        } else if (!v) {
          setSeleccionados([]);
          form.resetFields();
        }
      }}>
      {cargo && (
        <div style={{ marginBottom: 12 }}>
          <Text strong>{cargo.estudianteNombre}</Text>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>Cargos a cubrir con este pago:</Text>
        <Checkbox.Group
          value={seleccionados}
          onChange={vals => {
            const nuevos = vals as number[];
            setSeleccionados(nuevos);
            const suma = todosLosCargos.filter(c => nuevos.includes(c.id)).reduce((s, c) => s + Number(c.saldoPendiente), 0);
            form.setFieldValue('monto', suma);
          }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {todosLosCargos.map(c => (
              <Checkbox key={c.id} value={c.id} disabled={c.id === cargo?.id}>
                {c.descripcion} — <Text type="secondary">{fmt.format(c.saldoPendiente)} pendiente</Text>
                {c.fechaVencimiento && <Text type="secondary" style={{ fontSize: 11 }}> (vence {c.fechaVencimiento.substring(0, 10)})</Text>}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
        {seleccionados.length > 1 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
            Total pendiente de lo seleccionado: {fmt.format(totalSeleccionado)} — se aplica primero al más atrasado.
          </Text>
        )}
      </div>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="monto" label="Monto" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fecha" label="Fecha">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="metodoPago" label="Método de pago">
          <Select options={METODOS} />
        </Form.Item>
        <Form.Item name="referencia" label="Referencia / No. cheque"><Input /></Form.Item>
        <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

// ── Tab Planes ───────────────────────────────────────────────────────────────

function TabPlanes({ anioId }: { anioId?: number }) {
  const [planModal, setPlanModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [generarModal, setGenerarModal] = useState<{ open: boolean; plan?: any }>({ open: false });

  const { data: planes = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'colegiatura', 'planes', anioId],
    queryFn: () =>
      api.get('/educativo/colegiatura/planes', { params: { anioEscolarId: anioId || undefined } })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setPlanModal({ open: true })}>
          Nuevo plan
        </Button>
      </div>
      <Table dataSource={planes} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Estudiante', dataIndex: 'estudianteNombre', render: (v: any, r: any) => (
            <span><Text strong>{v}</Text> <Text type="secondary" style={{ fontSize: 11 }}>{r.estudianteCedula}</Text></span>
          )},
          { title: 'Año', dataIndex: 'anioNombre', render: (v: any) => v ?? '—' },
          { title: 'Colegiatura', dataIndex: 'montoColegiatura', render: (v: any) => fmt.format(v) },
          { title: 'Matrícula', dataIndex: 'montoMatricula', render: (v: any) => v > 0 ? fmt.format(v) : '—' },
          { title: 'Descuento', dataIndex: 'descuento', render: (v: any) => v > 0 ? `${v}%` : '—' },
          { title: 'Pendientes', dataIndex: 'cargosPendientes', align: 'center', render: (v: any) => v > 0 ? <Tag color="orange">{v}</Tag> : <Tag color="green">0</Tag> },
          { title: 'Saldo', dataIndex: 'saldoPendiente', render: (v: any) => v > 0 ? <Text type="danger">{fmt.format(v)}</Text> : <Text type="success">—</Text> },
          {
            title: '',
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => setPlanModal({ open: true, editing: r })} />
                <Button size="small" icon={<ThunderboltOutlined />} onClick={() => setGenerarModal({ open: true, plan: r })}>
                  Generar
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <PlanModal open={planModal.open} editing={planModal.editing} onClose={() => setPlanModal({ open: false })} />
      <GenerarCargosModal open={generarModal.open} plan={generarModal.plan} onClose={() => setGenerarModal({ open: false })} />
    </>
  );
}

// ── Modal condonar mora ──────────────────────────────────────────────────────

function CondonarMoraModal({ open, cargo, onClose }: { open: boolean; cargo?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => api.post(`/educativo/colegiatura/cargos/${cargo?.id}/condonar-mora`, vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'colegiatura'] });
      message.success('Mora condonada');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al condonar la mora'),
  });

  return (
    <Modal open={open} title="Condonar mora" onCancel={onClose}
      onOk={() => form.validateFields().then(vals => mut.mutate(vals))}
      confirmLoading={mut.isPending} destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}>
      {cargo && (
        <div style={{ marginBottom: 12 }}>
          <Text strong>{cargo.estudianteNombre}</Text> <Text type="secondary">— {cargo.descripcion}</Text>
          <br />
          <Text type="danger">Mora a condonar: {fmt.format(cargo.montoMora)}</Text>
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="motivo" label="Motivo" rules={[{ required: true, message: 'El motivo es requerido' }]}>
          <Input.TextArea rows={3} placeholder="Por qué se perdona esta mora — queda auditado" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Modal anular pago ────────────────────────────────────────────────────────
//
// Nunca borra el pago — el backend lo marca estado='anulado' y devuelve el
// saldo a los cargos que había cubierto. Motivo obligatorio, igual que
// condonar mora — queda auditado.

function AnularPagoModal({ open, pago, onClose }: { open: boolean; pago?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => api.post(`/educativo/colegiatura/pagos/${pago?.id}/anular`, vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'colegiatura'] });
      message.success('Pago anulado — el saldo volvió a los cargos afectados');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular el pago'),
  });

  return (
    <Modal open={open} title="Anular pago" onCancel={onClose}
      onOk={() => form.validateFields().then(vals => mut.mutate(vals))}
      confirmLoading={mut.isPending} destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}>
      {pago && (
        <div style={{ marginBottom: 12 }}>
          <Text strong>{pago.estudianteNombre}</Text>
          <br />
          <Text type="danger">Monto a anular: {fmt.format(pago.montoPagado)}</Text>
          {pago.aplicaciones?.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">Se devolverá el saldo a: </Text>
              {pago.aplicaciones.map((a: any, i: number) => (
                <Tag key={i}>{a.cargoDescripcion} ({fmt.format(a.monto)})</Tag>
              ))}
            </div>
          )}
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="motivo" label="Motivo" rules={[{ required: true, message: 'El motivo es requerido' }]}>
          <Input.TextArea rows={3} placeholder="Por qué se anula este pago — queda auditado" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Tab Cargos ───────────────────────────────────────────────────────────────

function TabCargos({ anioId }: { anioId?: number }) {
  const [filters, setFilters] = useState<Record<string, any>>({ estado: 'pendiente' });
  const [pagoModal, setPagoModal] = useState<{ open: boolean; cargo?: any }>({ open: false });
  const [condonarModal, setCondonarModal] = useState<{ open: boolean; cargo?: any }>({ open: false });

  const { data: cargos = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'colegiatura', 'cargos', filters],
    queryFn: () =>
      api.get('/educativo/colegiatura/cargos', { params: filters })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 15_000,
  });

  const ESTADO_OPTS = [
    { value: undefined, label: 'Todos' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'parcial',   label: 'Pago parcial' },
    { value: 'vencido',   label: 'Vencido' },
    { value: 'pagado',    label: 'Pagado' },
    { value: 'anulado',   label: 'Anulado' },
  ];

  const estadoColor = (e: string) =>
    e === 'pagado' ? 'green' : e === 'anulado' ? 'default' : e === 'pendiente' ? 'orange' : e === 'parcial' ? 'blue' : e === 'vencido' ? 'red' : 'red';

  // La mora se recalcula completa cada día (ver mora.cron.ts) — nunca se
  // muestra sola, siempre junto a diasMora para que se entienda que es un
  // monto vivo, no un cargo fijo. condonacionesMora (si las hay) en el
  // tooltip — mismo espíritu que renderDescuento con las becas.
  const renderMora = (r: any) => {
    if (r.moraCondonada) {
      const ultima = r.condonacionesMora?.[0];
      return (
        <Tooltip title={ultima ? `Condonada — ${ultima.motivo}` : 'Mora condonada'}>
          <Tag color="default" style={{ cursor: 'default' }}>Condonada</Tag>
        </Tooltip>
      );
    }
    if (!(Number(r.montoMora) > 0)) return <span style={{ color: '#999' }}>—</span>;
    return (
      <Tooltip title={`${r.diasMora} día(s) en mora`}>
        <Tag color="volcano" style={{ cursor: 'default' }}>{fmt.format(r.montoMora)}</Tag>
      </Tooltip>
    );
  };

  // desgloseDescuento viene ya resuelto (nombre de beca incluido) desde el
  // backend — nunca se muestra el "concepto" técnico crudo (plan:450;beca:
  // 3:900;topado) en pantalla.
  const renderDescuento = (r: any) => {
    const d = r.desgloseDescuento;
    if (!d && !(r.descuento > 0)) return <span style={{ color: '#999' }}>—</span>;
    if (!d) return <Tag color="purple">{fmt.format(r.descuento)}</Tag>;
    const lineas = [
      ...(d.planMonto > 0 ? [`Plan: ${fmt.format(d.planMonto)}`] : []),
      ...d.becas.map((b: any) => `${b.nombre}: ${fmt.format(b.monto)}`),
      ...(d.topado ? ['⚠ Topado al monto del cargo'] : []),
    ];
    return (
      <Tooltip title={<div>{lineas.map((l, i) => <div key={i}>{l}</div>)}</div>}>
        <Tag color={d.topado ? 'orange' : 'purple'} style={{ cursor: 'default' }}>
          {d.becas.length > 0 ? `🎓 ${fmt.format(r.descuento)}` : fmt.format(r.descuento)}
        </Tag>
      </Tooltip>
    );
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Buscar estudiante…" style={{ width: 220 }} allowClear
          onSearch={v => setFilters((p: any) => ({ ...p, q: v || undefined }))}
          onChange={e => { if (!e.target.value) setFilters((p: any) => ({ ...p, q: undefined })); }} />
        <Select style={{ width: 130 }} value={filters.estado} allowClear placeholder="Estado"
          options={ESTADO_OPTS} onChange={v => setFilters((p: any) => ({ ...p, estado: v }))  } />
        <Select style={{ width: 120 }} placeholder="Mes" allowClear
          options={MESES_FULL.map((m, i) => ({ value: i + 1, label: m }))}
          onChange={v => setFilters((p: any) => ({ ...p, mes: v }))} />
      </Space>
      <Table dataSource={cargos} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Estudiante', dataIndex: 'estudianteNombre', ellipsis: true },
          { title: 'Descripción', dataIndex: 'descripcion' },
          { title: 'Descuento', render: (_: any, r: any) => renderDescuento(r) },
          { title: 'Monto', dataIndex: 'montoTotal', render: (v: any) => fmt.format(v), align: 'right' },
          { title: 'Mora', render: (_: any, r: any) => renderMora(r) },
          { title: 'Saldo', dataIndex: 'saldoPendiente', render: (v: any) => v > 0 ? fmt.format(v) : '—', align: 'right' },
          { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={estadoColor(v)}>{v}</Tag> },
          {
            title: '',
            render: (_: any, r: any) => (
              <Space>
                {(r.estado === 'pendiente' || r.estado === 'parcial' || r.estado === 'vencido') && (
                  <Button size="small" type="primary" icon={<DollarOutlined />}
                    onClick={() => setPagoModal({ open: true, cargo: r })}>
                    Pagar
                  </Button>
                )}
                {Number(r.montoMora) > 0 && !r.moraCondonada && (
                  <Button size="small" danger icon={<MinusCircleOutlined />}
                    onClick={() => setCondonarModal({ open: true, cargo: r })}>
                    Condonar mora
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <PagoModal open={pagoModal.open} cargo={pagoModal.cargo} onClose={() => setPagoModal({ open: false })} />
      <CondonarMoraModal open={condonarModal.open} cargo={condonarModal.cargo} onClose={() => setCondonarModal({ open: false })} />
    </>
  );
}

// ── Tab Pagos (historial) ────────────────────────────────────────────────────
//
// listPagos() ya devuelve "aplicaciones" (ed_pagos_detalle resuelto con
// descripción/tipo del cargo) — un pago con varias aplicaciones se muestra
// como varios Tags en una sola fila, no como filas separadas.

function TabPagos() {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [anularModal, setAnularModal] = useState<{ open: boolean; pago?: any }>({ open: false });

  const { data: pagos = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'colegiatura', 'pagos', filters],
    queryFn: () =>
      api.get('/educativo/colegiatura/pagos', { params: filters })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 15_000,
  });

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Buscar estudiante…" style={{ width: 220 }} allowClear
          onSearch={v => setFilters((p: any) => ({ ...p, q: v || undefined }))} />
      </Space>
      <Table dataSource={pagos} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Fecha', dataIndex: 'fecha', render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Estudiante', dataIndex: 'estudianteNombre', ellipsis: true },
          { title: 'Monto', dataIndex: 'montoPagado', render: (v: any) => fmt.format(v), align: 'right' },
          { title: 'Método', dataIndex: 'metodoPago' },
          { title: 'Referencia', dataIndex: 'referencia', render: (v: any) => v || '—' },
          {
            title: 'Aplicado a', dataIndex: 'aplicaciones',
            render: (aps: any[]) => (
              <Space wrap size={4}>
                {(aps ?? []).map((a: any, i: number) => (
                  <Tag key={i}>{a.cargoDescripcion}: {fmt.format(a.monto)}</Tag>
                ))}
              </Space>
            ),
          },
          {
            title: 'Estado', dataIndex: 'estado',
            render: (v: string) => <Tag color={v === 'anulado' ? 'default' : 'green'}>{v}</Tag>,
          },
          {
            title: '',
            render: (_: any, r: any) => r.estado === 'activo' && (
              <Button size="small" danger icon={<MinusCircleOutlined />}
                onClick={() => setAnularModal({ open: true, pago: r })}>
                Anular
              </Button>
            ),
          },
        ]}
      />
      <AnularPagoModal open={anularModal.open} pago={anularModal.pago} onClose={() => setAnularModal({ open: false })} />
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ColegiaturaPage() {
  const [anioId, setAnioId] = useState<number | undefined>();
  const { data: anios = [] } = useEdList('anios-escolares');

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Colegiatura y Pagos</Title>
        <Select style={{ width: 180 }} placeholder="Año escolar" allowClear
          options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={setAnioId} />
      </div>

      <ResumenBar anioId={anioId} />

      <Tabs items={[
        { key: 'planes', label: 'Planes de pago', children: <TabPlanes anioId={anioId} /> },
        { key: 'cargos', label: 'Cargos',          children: <TabCargos anioId={anioId} /> },
        { key: 'pagos',  label: 'Pagos',           children: <TabPagos /> },
      ]} />
    </div>
  );
}
