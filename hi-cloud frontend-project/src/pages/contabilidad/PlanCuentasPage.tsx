import { useState } from 'react';
import {
  Table, Tag, Card, Row, Col, Typography, Space, Button, Modal, Form,
  Input, InputNumber, Select, Switch, message, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { contabilidadApi, type CuentaPayload } from '../../api/contabilidad.api';
import { TIPOS_BIENES_606 } from '../../constants/dgii-606';

const { Title, Text } = Typography;

interface Cuenta extends CuentaPayload {
  id: number;
}

const tipoColor: Record<string, string> = {
  activo: '#1677ff', pasivo: '#fa8c16', patrimonio: '#722ed1',
  ingreso: '#52c41a', costo: '#ff4d4f', gasto: '#ff7a45',
};

/** Tipos de cuenta que pueden llevar etiquetas fiscales del 606/IR-2 (Fase 1). */
const TIPOS_CON_ETIQUETA_FISCAL = ['gasto', 'costo'];

const ANEXOS_IR2 = [
  { value: 'A1', label: 'A1 — Balance General' },
  { value: 'B1', label: 'B1 — Estado de Resultados' },
  { value: 'D',  label: 'D — Costo de Venta' },
];

export default function PlanCuentasPage() {
  const { bloqueado, config, plan } = usePlanGuard();
  const qc = useQueryClient();
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Cuenta | null>(null);
  const [form] = Form.useForm<CuentaPayload>();

  // Se leen para reaccionar en vivo al elegir tipo/permiteMovimientos —
  // las etiquetas fiscales solo se ofrecen en cuentas de gasto o costo
  // que además sean de movimiento (las de agrupación no reciben asientos).
  const tipoActual               = Form.useWatch('tipo', form);
  const permiteMovimientosActual = Form.useWatch('permiteMovimientos', form);
  const muestraEtiquetasFiscales =
    TIPOS_CON_ETIQUETA_FISCAL.includes(tipoActual) && !!permiteMovimientosActual;

  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentas'],
    queryFn: () => contabilidadApi.cuentas(),
  });

  const createMut = useMutation({
    mutationFn: contabilidadApi.createCuenta,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cuentas'] }); closeModal(); message.success('Cuenta creada'); },
    onError:   (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo crear la cuenta'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CuentaPayload> }) => contabilidadApi.updateCuenta(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cuentas'] }); closeModal(); message.success('Cuenta actualizada'); },
    onError:   (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo actualizar la cuenta'),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (c: Cuenta) => { setEditing(c); form.setFieldsValue(c); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); form.resetFields(); };

  // Al dejar de calificar (tipo distinto de gasto/costo, o se vuelve de
  // agrupación), las etiquetas fiscales que hubiera quedan huérfanas en el
  // formulario y el backend las rechazaría — se limpian solas.
  const handleValuesChange = (changed: Partial<CuentaPayload>) => {
    if (!('tipo' in changed) && !('permiteMovimientos' in changed)) return;
    const tipoEfectivo = 'tipo' in changed ? changed.tipo : form.getFieldValue('tipo');
    const movEfectivo  = 'permiteMovimientos' in changed ? changed.permiteMovimientos : form.getFieldValue('permiteMovimientos');
    if (!TIPOS_CON_ETIQUETA_FISCAL.includes(tipoEfectivo as string) || !movEfectivo) {
      form.setFieldsValue({ tipoGasto606: undefined, anexoIR2: undefined, casillaIR2: undefined, requiereNCF: undefined });
    }
  };

  const handleSubmit = (v: CuentaPayload) =>
    editing ? updateMut.mutate({ id: editing.id, body: v }) : createMut.mutate(v);

  if (bloqueado && config) return <ModuloBloqueado modulo="Contabilidad General" planMinimo={config.planMinimo} planActual={plan} />;

  const opcionesPadre = (cuentas ?? []).filter((c: Cuenta) => c.id !== editing?.id);

  const cols = [
    { title: 'Código',  dataIndex: 'codigo',    width: 110 },
    { title: 'Nombre',  dataIndex: 'nombre',    ellipsis: true,
      render: (v: string, r: any) => <span style={{ paddingLeft: (r.nivel - 1) * 16 }}>{v}</span> },
    { title: 'Tipo',    dataIndex: 'tipo',      width: 100,
      render: (v: string) => <Tag color={tipoColor[v]} style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Naturaleza', dataIndex: 'naturaleza', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Nivel',   dataIndex: 'nivel',     width: 60 },
    { title: 'Movim.',  dataIndex: 'permiteMovimientos', width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
    { title: '606 / IR-2', key: 'etiquetas', width: 130,
      render: (_: unknown, r: Cuenta) => {
        if (!TIPOS_CON_ETIQUETA_FISCAL.includes(r.tipo) || !r.permiteMovimientos) return <Text type="secondary">—</Text>;
        if (!r.tipoGasto606 && !r.anexoIR2) return <Tag color="orange">Sin etiquetar</Tag>;
        return (
          <Space size={4} wrap>
            {r.tipoGasto606 && <Tooltip title={TIPOS_BIENES_606.find(t => t.value === r.tipoGasto606)?.label}><Tag>{r.tipoGasto606}</Tag></Tooltip>}
            {r.anexoIR2 && <Tag color="blue">{r.anexoIR2}</Tag>}
            {r.requiereNCF === false && <Tooltip title="Va sin NCF (nómina/TSS, pensiones, depreciación, destrucción autorizada)"><Tag color="purple">Sin NCF</Tag></Tooltip>}
          </Space>
        );
      } },
    { title: '', key: 'actions', width: 50, align: 'right' as const,
      render: (_: unknown, r: Cuenta) => (
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
      ) },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Plan de Cuentas</Title></Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva cuenta</Button>
        </Col>
      </Row>

      <Table columns={cols} dataSource={cuentas ?? []} rowKey="id" loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        rowClassName={(r: any) => r.nivel <= 2 ? 'ant-table-row-level-header' : ''} />

      <Modal
        title={editing ? `Editar cuenta — ${editing.codigo}` : 'Nueva cuenta contable'}
        open={open} onCancel={closeModal} footer={null} width={640} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} onValuesChange={handleValuesChange}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="codigo" label="Código" rules={[{ required: true }]}>
                {/* No se permite renumerar una cuenta ya creada desde aquí — el
                    catálogo fiscal (Fase 2) depende de que el código no cambie. */}
                <Input disabled={!!editing} placeholder="6.1.1.05" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'activo', label: 'Activo' }, { value: 'pasivo', label: 'Pasivo' },
                  { value: 'patrimonio', label: 'Patrimonio' }, { value: 'ingreso', label: 'Ingreso' },
                  { value: 'costo', label: 'Costo' }, { value: 'gasto', label: 'Gasto' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="naturaleza" label="Naturaleza" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'deudora', label: 'Deudora' }, { value: 'acreedora', label: 'Acreedora' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="nivel" label="Nivel" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={5} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4}>
              <Form.Item name="permiteMovimientos" label="Movimiento" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="cuentaPadreId" label="Cuenta padre">
                <Select
                  allowClear showSearch optionFilterProp="label"
                  placeholder="Sin padre (cuenta raíz)"
                  options={opcionesPadre.map((c: Cuenta) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>

            {muestraEtiquetasFiscales && (
              <>
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Etiquetas fiscales (606 / IR-2) — de un material de capacitación, no de la norma;
                    ante la duda, verificar con el contador.
                  </Text>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="tipoGasto606" label="Tipo de gasto (Formato 606)">
                    <Select allowClear options={TIPOS_BIENES_606} placeholder="01 — Gastos de personal" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="anexoIR2" label="Anexo IR-2">
                    <Select allowClear options={ANEXOS_IR2} placeholder="B1 — Estado de Resultados" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="casillaIR2" label="Casilla del anexo">
                    <Input placeholder="ej. 6.1, 9.1" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="requiereNCF" label="¿Requiere NCF?" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Actualizar' : 'Crear cuenta'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
