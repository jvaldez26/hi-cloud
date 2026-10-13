import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, InputNumber, Switch, Select, Tag, message, theme,
  Divider, Collapse, Space, Descriptions,
} from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';
import { hoyRD } from '../../utils/fechaRD';

const { Option } = Select;

const COLS_DEF = [
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'tasaInteresMensual', label: 'Tasa Mensual', defaultVisible: true },
  { key: 'metodoAmortizacion', label: 'Método', defaultVisible: true },
  { key: 'plazo', label: 'Plazo (meses)', defaultVisible: true },
  { key: 'porcentajeMora', label: 'Mora %', defaultVisible: true },
  { key: 'diasGracia', label: 'Días Gracia', defaultVisible: false },
  { key: 'motor', label: 'Motor', defaultVisible: true },
  { key: 'isActive', label: 'Activo', defaultVisible: true },
];

const FRECUENCIAS = ['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'unico'];
const METODOS = [
  { value: 'frances', label: 'Francés (cuota fija)' },
  { value: 'aleman', label: 'Alemán (capital fijo)' },
  { value: 'americano', label: 'Americano (solo interés + capital al final)' },
  { value: 'flat', label: 'Flat (interés fijo sobre el monto original)' },
  { value: 'solo_interes_luego_amortiza', label: 'Solo interés por N períodos, luego amortiza' },
];
const CONCEPTOS_FISCALES = ['interes', 'mora', 'apertura', 'gastos', 'seguro'];
const LABEL_CONCEPTO: Record<string, string> = { interes: 'Interés', mora: 'Mora', apertura: 'Apertura', gastos: 'Gastos', seguro: 'Seguro' };

/** Motor v2 (Fase 2B) — valores por defecto de un motorConfig nuevo. */
function motorConfigVacio() {
  return {
    frecuencia: 'mensual',
    frecuenciaDiaria: { excluirDomingos: true, excluirFeriados: false },
    frecuenciaQuincenal: { modo: 'dias_fijos' },
    tasa: { valor: 3, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
    metodo: 'frances',
    gracia: undefined,
    cargos: [],
    mora: { base: 'cuota_vencida', tasaOMonto: 0, baseDiasMora: 360 },
    fiscal: Object.fromEntries(CONCEPTOS_FISCALES.map(c => [c, { generaComprobante: null, tipoEcf: null, tratamientoItbis: null }])),
    permiteAjusteSolicitud: true,
  };
}

export default function ProductosPrestamoPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [usarMotorV2, setUsarMotorV2] = useState(false);
  const [tieneGracia, setTieneGracia] = useState(false);
  const [tieneTope, setTieneTope] = useState(false);
  const [vistaTasa, setVistaTasa] = useState<{ tasaEquivalentePorPeriodo: number; tasaAnualNominal: number; tea: number } | null>(null);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-productos', COLS_DEF);

  const frecuencia = Form.useWatch(['motorConfig', 'frecuencia'], form);
  const metodo = Form.useWatch(['motorConfig', 'metodo'], form);
  const moraBase = Form.useWatch(['motorConfig', 'mora', 'base'], form);
  const graciaTipo = Form.useWatch(['motorConfig', 'gracia', 'tipo'], form);
  const cargosActuales = Form.useWatch(['motorConfig', 'cargos'], form) ?? [];

  const { data = [], isLoading } = useQuery({
    queryKey: ['prestamista-productos'],
    queryFn: prestamistalApi.getProductos,
  });

  const save = useMutation({
    mutationFn: (vals: any) => {
      const body = { ...vals };
      if (usarMotorV2 && body.motorConfig) {
        body.motorConfig = {
          ...body.motorConfig,
          tasa: { ...body.motorConfig.tasa, valor: Number(body.motorConfig.tasa.valor) / 100 },
          gracia: tieneGracia ? body.motorConfig.gracia : undefined,
          mora: body.motorConfig.mora ? { ...body.motorConfig.mora, topeMora: tieneTope ? body.motorConfig.mora.topeMora : undefined } : undefined,
          cargos: (body.motorConfig.cargos ?? []).filter((c: any) => c?.concepto),
        };
        if (body.motorConfig.frecuencia !== 'diaria') delete body.motorConfig.frecuenciaDiaria;
        if (body.motorConfig.frecuencia !== 'quincenal') delete body.motorConfig.frecuenciaQuincenal;
      } else {
        delete body.motorConfig;
      }
      return editing ? prestamistalApi.updateProducto(editing.id, body) : prestamistalApi.crearProducto(body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prestamista-productos'] }); setOpen(false); form.resetFields(); setEditing(null); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const verTasa = useMutation({
    mutationFn: () => {
      const { tasa } = form.getFieldsValue(['motorConfig']).motorConfig ?? {};
      return prestamistalApi.vistaTasa({ tasa: { ...tasa, valor: Number(tasa.valor) / 100 }, frecuencia });
    },
    onSuccess: (d: any) => setVistaTasa(d),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Completa tasa y frecuencia primero'),
  });

  const openForm = (row?: any) => {
    setEditing(row ?? null);
    setVistaTasa(null);
    const esV2 = !!row?.motorConfig;
    setUsarMotorV2(esV2);
    setTieneGracia(!!row?.motorConfig?.gracia);
    setTieneTope(!!row?.motorConfig?.mora?.topeMora);
    form.setFieldsValue(row
      ? { ...row, motorConfig: row.motorConfig ? { ...row.motorConfig, tasa: { ...row.motorConfig.tasa, valor: Number(row.motorConfig.tasa.valor) * 100 } } : motorConfigVacio() }
      : { metodoAmortizacion: 'frances', diasGracia: 0, porcentajeMora: 0, cargoCierre: 0, motorConfig: motorConfigVacio() });
    setOpen(true);
  };

  const cols = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' },
    { title: 'Tasa Mensual', dataIndex: 'tasaInteresMensual', key: 'tasaInteresMensual', render: (v: any) => `${v}%` },
    { title: 'Método', dataIndex: 'metodoAmortizacion', key: 'metodoAmortizacion', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Plazo (meses)', key: 'plazo', render: (_: any, r: any) => `${r.plazoMinimoMeses ?? '—'} - ${r.plazoMaximoMeses ?? '—'}` },
    { title: 'Mora %', dataIndex: 'porcentajeMora', key: 'porcentajeMora', render: (v: any) => `${v}%` },
    { title: 'Días Gracia', dataIndex: 'diasGracia', key: 'diasGracia' },
    { title: 'Motor', key: 'motor', render: (_: any, r: any) => <Tag color={r.motorConfig ? 'blue' : 'default'}>{r.motorConfig ? `v2 · ${r.motorConfig.frecuencia}` : 'legacy'}</Tag> },
    { title: 'Tipo Crédito', dataIndex: 'tipoCredito', key: 'tipoCredito', render: (v: string) => <Tag color={v === 'vehiculo' ? 'blue' : v === 'hipotecario' ? 'purple' : 'default'}>{v ?? 'personal'}</Tag> },
    { title: 'Activo', dataIndex: 'isActive', key: 'isActive', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
    { title: '', key: 'acc', width: 80, render: (_: any, r: any) => <Button size="small" onClick={() => openForm(r)}>Editar</Button> },
  ];

  const exportar = () => {
    const filas = (data as any[]).map((r: any) => ({
      'Nombre': r.nombre,
      'Tasa Mensual (%)': r.tasaInteresMensual,
      'Método Amortización': r.metodoAmortizacion,
      'Plazo Mín (meses)': r.plazoMinimoMeses,
      'Plazo Máx (meses)': r.plazoMaximoMeses,
      'Mora %': r.porcentajeMora,
      'Días Gracia': r.diasGracia,
      'Motor': r.motorConfig ? 'v2' : 'legacy',
      'Activo': r.isActive ? 'Sí' : 'No',
    }));
    exportarExcel(filas, `ProductosPrestamo-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Productos de Préstamo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-productos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => openForm()}>Nuevo Producto</Button>
        </div>
      </div>

      <Table dataSource={(data as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={filterColumns(cols as any)}
        loading={isLoading} scroll={{ x: 'max-content' }} pagination={false} />

      <Modal title={editing ? 'Editar Producto' : 'Nuevo Producto'} open={open}
        onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => save.mutate(v))} okText="Guardar" width={760} confirmLoading={save.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="tasaInteresMensual" label="Tasa Interés Mensual (%) — resumen/compat" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={3} addonAfter="%" />
            </Form.Item>
            <Form.Item name="tipoCredito" label="Tipo de Crédito">
              <Select>
                <Option value="personal">Personal</Option>
                <Option value="vehiculo">Vehículo</Option>
                <Option value="hipotecario">Hipotecario</Option>
              </Select>
            </Form.Item>
            <Form.Item name="plazoMinimoMeses" label="Plazo Mínimo (meses)">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="plazoMaximoMeses" label="Plazo Máximo (meses)">
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="montoMinimo" label="Monto Mínimo (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
            <Form.Item name="montoMaximo" label="Monto Máximo (RD$)">
              <InputNumber style={{ width: '100%' }} prefix="RD$" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item name="requiereGarantia" label="Requiere Garantía" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requiereGarante" label="Requiere Garante" valuePropName="checked"><Switch /></Form.Item>
            {editing && <Form.Item name="isActive" label="Activo" valuePropName="checked"><Switch /></Form.Item>}
          </div>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>

          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Switch checked={usarMotorV2} onChange={setUsarMotorV2} />
            <b>Motor financiero v2</b>
            <span style={{ color: C.colorTextSecondary, fontSize: 12 }}>
              {usarMotorV2 ? 'Este producto usa la configuración completa de abajo.' : 'Sin activar: los préstamos de este producto se crean con un equivalente francés/alemán mensual simple.'}
            </span>
          </div>

          {usarMotorV2 && (
            <Collapse
              defaultActiveKey={['frecuencia', 'tasa', 'metodo']}
              items={[
                {
                  key: 'frecuencia', label: 'Frecuencia de pago',
                  children: (
                    <>
                      <Form.Item name={['motorConfig', 'frecuencia']} label="Frecuencia" rules={[{ required: usarMotorV2 }]}>
                        <Select>{FRECUENCIAS.map(f => <Option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</Option>)}</Select>
                      </Form.Item>
                      {frecuencia === 'diaria' && (
                        <div style={{ display: 'flex', gap: 24 }}>
                          <Form.Item name={['motorConfig', 'frecuenciaDiaria', 'excluirDomingos']} label="Excluir domingos" valuePropName="checked"><Switch /></Form.Item>
                          <Form.Item name={['motorConfig', 'frecuenciaDiaria', 'excluirFeriados']} label="Excluir feriados" valuePropName="checked"><Switch /></Form.Item>
                        </div>
                      )}
                      {frecuencia === 'quincenal' && (
                        <Form.Item name={['motorConfig', 'frecuenciaQuincenal', 'modo']} label="Modo quincenal">
                          <Select>
                            <Option value="dias_fijos">Días fijos (15 y fin de mes)</Option>
                            <Option value="cada_15_dias">Cada 15 días desde el primer pago</Option>
                          </Select>
                        </Form.Item>
                      )}
                    </>
                  ),
                },
                {
                  key: 'tasa', label: 'Tasa',
                  children: (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                        <Form.Item name={['motorConfig', 'tasa', 'valor']} label="Tasa (%)" rules={[{ required: usarMotorV2 }]}>
                          <InputNumber style={{ width: '100%' }} min={0} precision={4} addonAfter="%" />
                        </Form.Item>
                        <Form.Item name={['motorConfig', 'tasa', 'tipo']} label="Tipo">
                          <Select><Option value="nominal">Nominal</Option><Option value="efectiva">Efectiva</Option></Select>
                        </Form.Item>
                        <Form.Item name={['motorConfig', 'tasa', 'periodoExpresado']} label="Expresada como">
                          <Select>
                            <Option value="diaria">Diaria</Option><Option value="semanal">Semanal</Option>
                            <Option value="quincenal">Quincenal</Option><Option value="mensual">Mensual</Option><Option value="anual">Anual</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item name={['motorConfig', 'tasa', 'baseDias']} label="Base de días">
                          <Select><Option value={360}>360 (comercial)</Option><Option value={365}>365 (real)</Option></Select>
                        </Form.Item>
                      </div>
                      <Space>
                        <Button loading={verTasa.isPending} onClick={() => verTasa.mutate()}>Ver tasa equivalente</Button>
                        {vistaTasa && (
                          <Descriptions size="small" column={1} style={{ fontSize: 12 }}>
                            <Descriptions.Item label="Por período">{(vistaTasa.tasaEquivalentePorPeriodo * 100).toFixed(4)}%</Descriptions.Item>
                            <Descriptions.Item label="Anual nominal">{(vistaTasa.tasaAnualNominal * 100).toFixed(2)}%</Descriptions.Item>
                            <Descriptions.Item label="TEA">{(vistaTasa.tea * 100).toFixed(2)}%</Descriptions.Item>
                          </Descriptions>
                        )}
                      </Space>
                    </>
                  ),
                },
                {
                  key: 'metodo', label: 'Método de amortización y gracia',
                  children: (
                    <>
                      <Form.Item name={['motorConfig', 'metodo']} label="Método" rules={[{ required: usarMotorV2 }]}>
                        <Select>{METODOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}</Select>
                      </Form.Item>
                      {metodo === 'solo_interes_luego_amortiza' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                          <Form.Item name={['motorConfig', 'periodosSoloInteres']} label="Períodos solo interés">
                            <InputNumber style={{ width: '100%' }} min={1} />
                          </Form.Item>
                          <Form.Item name={['motorConfig', 'metodoPosteriorGracia']} label="Método posterior">
                            <Select><Option value="frances">Francés</Option><Option value="aleman">Alemán</Option></Select>
                          </Form.Item>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                        <Switch checked={tieneGracia} onChange={setTieneGracia} /> <span>Período de gracia</span>
                      </div>
                      {tieneGracia && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                          <Form.Item name={['motorConfig', 'gracia', 'tipo']} label="Tipo de gracia">
                            <Select><Option value="capital">Capital (solo paga interés)</Option><Option value="total">Total (no paga nada)</Option></Select>
                          </Form.Item>
                          <Form.Item name={['motorConfig', 'gracia', 'periodos']} label="Períodos de gracia">
                            <InputNumber style={{ width: '100%' }} min={1} />
                          </Form.Item>
                          {graciaTipo === 'total' && (
                            <Form.Item name={['motorConfig', 'gracia', 'tratamientoInteresGracia']} label="Interés de la gracia">
                              <Select>
                                <Option value="prorratea">Prorratea en las cuotas restantes</Option>
                                <Option value="capitaliza">Capitaliza (interés sobre interés)</Option>
                                <Option value="primera_cuota">Cobrar en la primera cuota después</Option>
                              </Select>
                            </Form.Item>
                          )}
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: 'cargos', label: 'Cargos (apertura, gastos, seguro, otros)',
                  children: (
                    <Form.List name={['motorConfig', 'cargos']}>
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(field => {
                            const momento = cargosActuales[field.name]?.momento;
                            return (
                              <div key={field.key} style={{ border: `1px solid ${C.colorBorderSecondary}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 12px' }}>
                                  <Form.Item name={[field.name, 'concepto']} label="Concepto" rules={[{ required: true }]}>
                                    <Input placeholder="Ej. Comisión de apertura" />
                                  </Form.Item>
                                  <Form.Item name={[field.name, 'tipo']} label="Tipo" initialValue="fijo">
                                    <Select><Option value="fijo">Monto fijo</Option><Option value="porcentaje">% del monto</Option></Select>
                                  </Form.Item>
                                  <Form.Item name={[field.name, 'monto']} label="Monto/%">
                                    <InputNumber style={{ width: '100%' }} min={0} />
                                  </Form.Item>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                                  <Form.Item name={[field.name, 'momento']} label="Se cobra" initialValue="desembolso">
                                    <Select>
                                      <Option value="desembolso">Al desembolso</Option>
                                      <Option value="por_cuota">En cada cuota</Option>
                                      <Option value="unico_diferido">Una sola vez (diferido)</Option>
                                    </Select>
                                  </Form.Item>
                                  {momento === 'desembolso' && (
                                    <Form.Item name={[field.name, 'tratamientoDesembolso']} label="Tratamiento" initialValue="aparte">
                                      <Select>
                                        <Option value="descontado">Descontado del desembolso</Option>
                                        <Option value="financiado">Financiado (se suma al préstamo)</Option>
                                        <Option value="aparte">Cobrado aparte</Option>
                                      </Select>
                                    </Form.Item>
                                  )}
                                  {momento === 'unico_diferido' && (
                                    <Form.Item name={[field.name, 'momentoUnicoDiferido']} label="¿Cuándo?" initialValue="primera_cuota">
                                      <Select>
                                        <Option value="primera_cuota">Primera cuota</Option>
                                        <Option value="ultima_cuota">Última cuota</Option>
                                        <Option value="prorrateado">Prorrateado</Option>
                                      </Select>
                                    </Form.Item>
                                  )}
                                </div>
                                <Button danger size="small" icon={<Trash2 size={13} />} onClick={() => remove(field.name)}>Quitar cargo</Button>
                              </div>
                            );
                          })}
                          <Button icon={<Plus size={14} />} onClick={() => add({ tipo: 'fijo', momento: 'desembolso', tratamientoDesembolso: 'aparte' })}>
                            Agregar cargo
                          </Button>
                        </>
                      )}
                    </Form.List>
                  ),
                },
                {
                  key: 'mora', label: 'Mora',
                  children: (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                        <Form.Item name={['motorConfig', 'mora', 'base']} label="Base de cálculo">
                          <Select>
                            <Option value="capital_vencido">Capital vencido</Option>
                            <Option value="cuota_vencida">Capital + interés vencido</Option>
                            <Option value="monto_fijo">Monto fijo</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item name={['motorConfig', 'mora', 'tasaOMonto']} label={moraBase === 'monto_fijo' ? 'Monto (RD$)' : 'Tasa mensual (%)'}>
                          <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                        </Form.Item>
                        {moraBase === 'monto_fijo' && (
                          <Form.Item name={['motorConfig', 'mora', 'periodoMontoFijo']} label="Por">
                            <Select><Option value="dia">Día de atraso</Option><Option value="cuota">Cuota vencida (una vez)</Option></Select>
                          </Form.Item>
                        )}
                        <Form.Item name={['motorConfig', 'mora', 'baseDiasMora']} label="Base de días">
                          <Select><Option value={360}>360 (tasa ÷ 30)</Option><Option value={365}>365 (tasa × 12 ÷ 365)</Option></Select>
                        </Form.Item>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                        <Switch checked={tieneTope} onChange={setTieneTope} /> <span>Tope de mora</span>
                      </div>
                      {tieneTope && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                          <Form.Item name={['motorConfig', 'mora', 'topeMora', 'tipo']} label="Tipo de tope" initialValue="porcentaje_saldo">
                            <Select><Option value="monto">Monto fijo</Option><Option value="porcentaje_saldo">% del saldo de la cuota</Option></Select>
                          </Form.Item>
                          <Form.Item name={['motorConfig', 'mora', 'topeMora', 'valor']} label="Valor">
                            <InputNumber style={{ width: '100%' }} min={0} />
                          </Form.Item>
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: 'fiscal', label: 'Fiscal (pendiente de configurar)',
                  children: (
                    <>
                      <p style={{ color: C.colorTextSecondary, fontSize: 12 }}>
                        Nace vacío a propósito — define por concepto si genera comprobante, qué tipo de e-CF y el
                        tratamiento de ITBIS antes de que el motor facture algo. Ver §8 de la especificación del motor.
                      </p>
                      {CONCEPTOS_FISCALES.map(concepto => (
                        <div key={concepto} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1fr 1fr', gap: '0 12px', alignItems: 'center' }}>
                          <div>
                            {LABEL_CONCEPTO[concepto]}
                            {!form.getFieldValue(['motorConfig', 'fiscal', concepto, 'generaComprobante']) && <Tag color="orange" style={{ marginLeft: 6 }}>Pendiente</Tag>}
                          </div>
                          <Form.Item name={['motorConfig', 'fiscal', concepto, 'generaComprobante']} label="Genera comprobante">
                            <Select allowClear placeholder="Sin definir"><Option value={true}>Sí</Option><Option value={false}>No</Option></Select>
                          </Form.Item>
                          <Form.Item name={['motorConfig', 'fiscal', concepto, 'tipoEcf']} label="Tipo e-CF">
                            <Input placeholder="Sin definir" />
                          </Form.Item>
                          <Form.Item name={['motorConfig', 'fiscal', concepto, 'tratamientoItbis']} label="ITBIS">
                            <Select allowClear placeholder="Sin definir">
                              <Option value={0}>0%</Option><Option value={16}>16%</Option><Option value={18}>18%</Option><Option value="exento">Exento</Option>
                            </Select>
                          </Form.Item>
                        </div>
                      ))}
                    </>
                  ),
                },
                {
                  key: 'avanzado', label: 'Avanzado',
                  children: (
                    <Form.Item name={['motorConfig', 'permiteAjusteSolicitud']} label="Permitir ajustar tasa/frecuencia en la solicitud" valuePropName="checked" initialValue={true}>
                      <Switch />
                    </Form.Item>
                  ),
                },
              ]}
            />
          )}
        </Form>
      </Modal>
    </div>
  );
}
