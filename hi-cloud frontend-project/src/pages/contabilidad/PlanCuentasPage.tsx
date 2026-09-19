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

/**
 * tipoGasto606/requiereNCF solo tienen sentido en gasto o costo — el 606
 * declara compras y gastos, no partidas de balance. Corrección del
 * 2026-09-19: anexoIR2/casillaIR2 NO comparten esta restricción (ver abajo)
 * — A1 es del Balance General, así que aplicaría a activo/pasivo/patrimonio.
 */
const TIPOS_CON_606 = ['gasto', 'costo'];

const ANEXO_A1 = { value: 'A1', label: 'A1 — Balance General' };
const ANEXO_B1 = { value: 'B1', label: 'B1 — Estado de Resultados' };
const ANEXO_D  = { value: 'D',  label: 'D — Costo de Venta' };

/** Qué anexos del IR-2 puede llevar cada tipo de cuenta — ver TIPOS_POR_ANEXO_IR2 en el backend (misma regla, duplicada aquí para el selector). */
const ANEXOS_POR_TIPO: Record<string, { value: string; label: string }[]> = {
  activo:     [ANEXO_A1, ANEXO_D],
  pasivo:     [ANEXO_A1],
  patrimonio: [ANEXO_A1],
  ingreso:    [ANEXO_B1],
  costo:      [ANEXO_B1, ANEXO_D],
  gasto:      [ANEXO_B1],
};

/**
 * El Anexo D (Costo de Venta) pide Inventario Inicial/Final (cuentas de
 * tipo activo) y Compras/Costo de Venta (tipo costo) — el código no puede
 * distinguir una cuenta de Inventario de, por ejemplo, Caja (ambas son
 * "activo"), así que en vez de adivinar, el selector de casilla ofrece
 * solo las líneas que corresponden al tipo elegido. No son códigos
 * oficiales de DGII confirmados — esa numeración se verifica en Fase 3.
 */
const CASILLAS_ANEXO_D: Record<'activo' | 'costo', { value: string; label: string }[]> = {
  activo: [
    { value: 'inv_ini_merc', label: 'Inventario Inicial de Mercancías' },
    { value: 'inv_fin_merc', label: 'Inventario Final de Mercancías' },
    { value: 'inv_ini_mp',   label: 'Inventario Inicial de Materia Prima' },
    { value: 'inv_fin_mp',   label: 'Inventario Final de Materia Prima' },
    { value: 'inv_ini_pp',   label: 'Inventario Inicial de Producción en Proceso' },
    { value: 'inv_fin_pp',   label: 'Inventario Final de Producción en Proceso' },
    { value: 'inv_ini_pt',   label: 'Inventario Inicial de Productos Terminados' },
    { value: 'inv_fin_pt',   label: 'Inventario Final de Productos Terminados' },
  ],
  costo: [
    { value: 'compras_local', label: 'Compras Locales' },
    { value: 'compras_ext',   label: 'Compras del Exterior' },
    { value: 'itbis_costo',   label: 'ITBIS Llevado al Costo' },
    { value: 'costo_venta',   label: 'Costo de Venta' },
  ],
};

export default function PlanCuentasPage() {
  const { bloqueado, config, plan } = usePlanGuard();
  const qc = useQueryClient();
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Cuenta | null>(null);
  const [form] = Form.useForm<CuentaPayload>();

  // Se leen para reaccionar en vivo al elegir tipo/permiteMovimientos/anexoIR2.
  // Las etiquetas de agrupación nunca se ofrecen (no reciben asientos). De
  // ahí en adelante la regla difiere por etiqueta — ver ANEXOS_POR_TIPO.
  const tipoActual               = Form.useWatch('tipo', form);
  const permiteMovimientosActual = Form.useWatch('permiteMovimientos', form);
  const anexoActual              = Form.useWatch('anexoIR2', form);
  const muestra606       = TIPOS_CON_606.includes(tipoActual) && !!permiteMovimientosActual;
  const muestraAnexoIR2  = !!permiteMovimientosActual;
  const anexosDisponibles = ANEXOS_POR_TIPO[tipoActual] ?? [];
  const casillasDisponiblesD = (tipoActual === 'activo' || tipoActual === 'costo') ? CASILLAS_ANEXO_D[tipoActual] : [];

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

  // Al dejar de calificar, las etiquetas que hubieran quedado huérfanas se
  // limpian solas (el backend las rechazaría igual, pero mejor que el
  // formulario no las envíe siquiera).
  const handleValuesChange = (changed: Partial<CuentaPayload>) => {
    // Cuenta de agrupación: ninguna etiqueta aplica.
    if ('permiteMovimientos' in changed && !changed.permiteMovimientos) {
      form.setFieldsValue({ tipoGasto606: undefined, anexoIR2: undefined, casillaIR2: undefined, requiereNCF: undefined });
      return;
    }
    if ('tipo' in changed) {
      const nuevoTipo = changed.tipo as string;
      if (!TIPOS_CON_606.includes(nuevoTipo)) {
        form.setFieldsValue({ tipoGasto606: undefined, requiereNCF: undefined });
      }
      const anexoVigente   = form.getFieldValue('anexoIR2');
      const anexosValidos  = (ANEXOS_POR_TIPO[nuevoTipo] ?? []).map(a => a.value);
      if (anexoVigente && !anexosValidos.includes(anexoVigente)) {
        // El anexo ya no aplica al tipo nuevo (ej. A1 en una cuenta que pasó a ser gasto).
        form.setFieldsValue({ anexoIR2: undefined, casillaIR2: undefined });
      } else if (anexoVigente === 'D') {
        // La lista de casillas de D depende de si el tipo es activo o costo — cambia al cambiar el tipo.
        form.setFieldsValue({ casillaIR2: undefined });
      }
    }
    if ('anexoIR2' in changed) {
      // La casilla depende del anexo elegido (lista acotada en D, texto libre en A1/B1) — el valor anterior no aplica.
      form.setFieldsValue({ casillaIR2: undefined });
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
        if (!r.permiteMovimientos) return <Text type="secondary">—</Text>;
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

            {muestra606 && (
              <>
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Formato 606 — de un material de capacitación, no de la norma; ante la duda, verificar con el contador.
                  </Text>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="tipoGasto606" label="Tipo de gasto (Formato 606)">
                    <Select allowClear options={TIPOS_BIENES_606} placeholder="01 — Gastos de personal" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="requiereNCF" label="¿Requiere NCF?" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </>
            )}

            {muestraAnexoIR2 && (
              <>
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Anexo del IR-2 — A1 (Balance) aplica a activo/pasivo/patrimonio, B1 (Resultados) a ingreso/costo/gasto,
                    D (Costo de Venta) a activo o costo. Verificar con el contador.
                  </Text>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="anexoIR2" label="Anexo IR-2">
                    <Select
                      allowClear disabled={!tipoActual}
                      options={anexosDisponibles}
                      placeholder={tipoActual ? 'Ninguno' : 'Elige el tipo primero'}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="casillaIR2" label="Casilla del anexo">
                    {anexoActual === 'D'
                      // El código no distingue una cuenta "activo" que es Inventario de una que es Caja —
                      // en vez de adivinar, se ofrece solo la lista de líneas que aplica al tipo elegido.
                      ? <Select allowClear options={casillasDisponiblesD} placeholder="Elige la línea" />
                      : <Input placeholder="ej. 6.1, 9.1" disabled={!anexoActual} />}
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
