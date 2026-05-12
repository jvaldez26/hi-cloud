import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Typography, Space, Modal,
  Form, Input, InputNumber, Select, message, Popconfirm,
  Progress, Divider, Alert, Statistic, Descriptions, Tag,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  EyeOutlined, CloseOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;

const distApi = {
  listar:   ()              => api.get('/distribucion-costos').then(d),
  crear:    (b: any)        => api.post('/distribucion-costos', b).then(d),
  delete:   (id: number)    => api.delete(`/distribucion-costos/${id}`).then(d),
  simular:  (id: number, monto: number) =>
    api.post(`/distribucion-costos/${id}/simular?monto=${monto}`, {}).then(d),
  ejecutar: (id: number, b: any) =>
    api.post(`/distribucion-costos/${id}/ejecutar`, b).then(d),
  // Cuentas para selector
  cuentas:  () => api.get('/contabilidad/cuentas?soloMovimientos=true').then(d),
};

// ── Crear regla modal ──────────────────────────────────────────────────────────
function CrearReglaModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [form] = Form.useForm();
  const { data: cuentas } = useQuery({ queryKey: ['cuentas-sel'], queryFn: distApi.cuentas });

  const cuentaOpts = (cuentas ?? [])
    .filter((c: any) => c.permiteMovimientos)
    .map((c: any) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }));

  const crearMut = useMutation({
    mutationFn: distApi.crear,
    onSuccess: () => { onSuccess(); onClose(); form.resetFields(); message.success('Regla creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const handleSubmit = (v: any) => {
    const lineas = (v.lineas ?? []).map((l: any) => ({
      cuentaDestinoId:    l.cuentaDestinoId,
      cuentaDestinoNombre: cuentaOpts.find((c: any) => c.value === l.cuentaDestinoId)?.label?.split(' — ')[1],
      porcentaje:         Number(l.porcentaje),
      descripcion:        l.descripcion,
    }));
    const total = lineas.reduce((s: number, l: any) => s + l.porcentaje, 0);
    if (Math.abs(total - 100) > 0.1) {
      message.error(`Los porcentajes suman ${total.toFixed(2)}%, deben sumar exactamente 100%`);
      return;
    }
    crearMut.mutate({
      nombre:             v.nombre,
      descripcion:        v.descripcion,
      cuentaOrigenId:     v.cuentaOrigenId,
      cuentaOrigenNombre: cuentaOpts.find((c: any) => c.value === v.cuentaOrigenId)?.label?.split(' — ')[1],
      periodicidad:       v.periodicidad,
      lineas,
    });
  };

  return (
    <Modal title="Nueva Regla de Distribución" open={open} onCancel={() => { onClose(); form.resetFields(); }}
      footer={null} width={680}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ periodicidad: 'manual', lineas: [{ porcentaje: 100 }] }}>
        <Row gutter={12}>
          <Col span={16}>
            <Form.Item name="nombre" label="Nombre de la regla" rules={[{ required: true }]}>
              <Input placeholder="ej. Distribución costos administrativos" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="periodicidad" label="Periodicidad">
              <Select options={[
                { value: 'manual',     label: 'Manual' },
                { value: 'mensual',    label: 'Mensual' },
                { value: 'trimestral', label: 'Trimestral' },
                { value: 'anual',      label: 'Anual' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="cuentaOrigenId" label="Cuenta origen (se acredita al distribuir)" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={cuentaOpts} placeholder="Seleccionar cuenta de origen" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: '8px 0 12px' }}>Cuentas destino y porcentajes (deben sumar 100%)</Divider>

        <Form.List name="lineas" initialValue={[{}]}>
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                  <Col span={12}>
                    <Form.Item name={[name, 'cuentaDestinoId']} rules={[{ required: true }]} style={{ margin: 0 }}>
                      <Select showSearch optionFilterProp="label" options={cuentaOpts} placeholder="Cuenta destino" />
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item name={[name, 'porcentaje']} rules={[{ required: true }]} style={{ margin: 0 }}>
                      <InputNumber min={0.01} max={100} precision={2} addonAfter="%" style={{ width: '100%' }} placeholder="%" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name={[name, 'descripcion']} style={{ margin: 0 }}>
                      <Input placeholder="Descripción" />
                    </Form.Item>
                  </Col>
                  <Col span={1}>
                    <Button type="text" danger size="small" icon={<CloseOutlined />} onClick={() => remove(name)} />
                  </Col>
                </Row>
              ))}
              <Button type="dashed" onClick={() => add({})} block icon={<PlusOutlined />}>
                Agregar cuenta destino
              </Button>
            </>
          )}
        </Form.List>

        <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
          <Col><Button onClick={() => { onClose(); form.resetFields(); }}>Cancelar</Button></Col>
          <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear regla</Button></Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Ejecutar regla modal ───────────────────────────────────────────────────────
function EjecutarModal({ regla, open, onClose, onSuccess }: {
  regla: any; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<any>(null);

  const ejecutarMut = useMutation({
    mutationFn: (b: any) => distApi.ejecutar(regla.id, b),
    onSuccess: (r) => {
      message.success(`Asiento #${r.asientoId} creado — ${r.lineasDistribuidas} cuentas distribuidas`);
      onSuccess(); onClose(); form.resetFields(); setPreview(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const simular = async () => {
    const monto = form.getFieldValue('monto');
    if (!monto) { message.warning('Ingresa un monto primero'); return; }
    const r = await distApi.simular(regla.id, monto);
    setPreview(r);
  };

  return (
    <Modal title={`Ejecutar: ${regla?.nombre}`} open={open}
      onCancel={() => { onClose(); form.resetFields(); setPreview(null); }}
      footer={null} width={520}>
      <Form form={form} layout="vertical"
        initialValues={{ fecha: dayjs().format('YYYY-MM-DD') }}
        onFinish={(v) => ejecutarMut.mutate(v)}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="monto" label="Monto a distribuir (RD$)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} precision={2} onChange={() => setPreview(null)} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fecha" label="Fecha del asiento" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="concepto" label="Concepto del asiento">
              <Input placeholder={`Distribución: ${regla?.nombre}`} />
            </Form.Item>
          </Col>
        </Row>

        <Button icon={<EyeOutlined />} onClick={simular} style={{ marginBottom: 12 }}>
          Vista previa sin ejecutar
        </Button>

        {preview && (
          <Card size="small" style={{ marginBottom: 12, background: '#f0f4f8' }}>
            <Text strong style={{ fontSize: 12 }}>Vista previa — distribución de {fmt.money(preview.monto)}</Text>
            <Table size="small" pagination={false} style={{ marginTop: 8 }}
              dataSource={preview.lineasDistribuidas}
              rowKey="cuentaDestino"
              columns={[
                { title: 'Cuenta destino', dataIndex: 'cuentaDestino', ellipsis: true },
                { title: '%', dataIndex: 'porcentaje', width: 60, render: (v: number) => `${v}%` },
                { title: 'Monto', dataIndex: 'montoDistribuido', width: 110, align: 'right' as const,
                  render: (v: number) => fmt.money(v) },
              ]}
            />
          </Card>
        )}

        <Row justify="end" gutter={8}>
          <Col><Button onClick={() => { onClose(); form.resetFields(); setPreview(null); }}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={ejecutarMut.isPending}
              icon={<ThunderboltOutlined />}>
              Ejecutar y crear asiento
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function DistribucionCostosPage() {
  const [openCreate, setOpenCreate] = useState(false);
  const [ejecutarRegla, setEjecutarRegla] = useState<any>(null);
  const qc = useQueryClient();

  const { data: reglas, isLoading } = useQuery({ queryKey: ['dist-costos'], queryFn: distApi.listar });

  const delMut = useMutation({
    mutationFn: distApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dist-costos'] }); message.success('Regla eliminada'); },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['dist-costos'] });

  const cols = [
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true,
      render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Cuenta origen', dataIndex: 'cuentaOrigenNombre', ellipsis: true,
      render: (v: string, r: any) => v ? <Text type="secondary">{v}</Text> : <Text type="secondary">#{r.cuentaOrigenId}</Text> },
    { title: 'Periodicidad', dataIndex: 'periodicidad', width: 100,
      render: (v: string) => <Tag>{v?.toUpperCase()}</Tag> },
    { title: 'Líneas', key: 'lineas', width: 70, align: 'center' as const,
      render: (_: any, r: any) => r.lineas?.length ?? 0 },
    { title: 'Ejecutada', dataIndex: 'vecesEjecutada', width: 90, align: 'center' as const,
      render: (v: number) => v > 0 ? <Text style={{ color: '#2E7D32' }}>{v}×</Text> : <Text type="secondary">—</Text> },
    { title: '', key: 'acc', width: 140, align: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<PlayCircleOutlined />}
            onClick={() => setEjecutarRegla(r)}>
            Ejecutar
          </Button>
          <Popconfirm title="¿Eliminar regla?" onConfirm={() => delMut.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Distribución de Costos</Title>

      <Alert type="info" showIcon style={{ marginBottom: 16, fontSize: 12 }}
        message="Las reglas de distribución automatizan la asignación de costos entre cuentas contables mediante porcentajes configurables. Al ejecutar una regla se genera un asiento contable automáticamente." />

      <Card
        title={`${(reglas ?? []).length} regla(s) configurada(s)`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreate(true)}>
            Nueva regla
          </Button>
        }
      >
        <Table
          columns={cols} dataSource={reglas ?? []} rowKey="id"
          loading={isLoading} size="small"
          expandable={{
            expandedRowRender: (r) => (
              <div style={{ padding: '8px 16px' }}>
                <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Distribución:
                </Text>
                {(r.lineas ?? []).map((l: any) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <Text style={{ width: 280, fontSize: 12 }}>
                      {l.cuentaDestinoNombre ?? `#${l.cuentaDestinoId}`}
                    </Text>
                    <Progress
                      percent={Number(l.porcentaje)} size="small"
                      style={{ flex: 1, margin: 0 }}
                      format={p => `${p}%`}
                    />
                  </div>
                ))}
                {r.descripcion && <Text type="secondary" style={{ fontSize: 11 }}>{r.descripcion}</Text>}
              </div>
            ),
          }}
          pagination={false}
        />
      </Card>

      <CrearReglaModal open={openCreate} onClose={() => setOpenCreate(false)} onSuccess={refresh} />
      {ejecutarRegla && (
        <EjecutarModal regla={ejecutarRegla} open={!!ejecutarRegla}
          onClose={() => setEjecutarRegla(null)} onSuccess={refresh} />
      )}
    </div>
  );
}
