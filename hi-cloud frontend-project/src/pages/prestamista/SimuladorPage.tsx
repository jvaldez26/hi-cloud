import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, Form, InputNumber, Select, DatePicker, Button, Table, Statistic, Row, Col, Divider, Switch, Space, Tag,
  Modal, Input, Popconfirm, message, theme,
} from 'antd';
import dayjs from 'dayjs';
import { Calculator, Printer, Save, History, Copy, Trash2, FileText, ArrowRightLeft, Plus } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';
import { imprimirHtml } from '../../utils/printUtils';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const pct = (n: any) => `${(Number(n ?? 0) * 100).toFixed(2)}%`;

const FRECUENCIAS = ['diaria', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'unico'];
const METODOS = [
  { value: 'frances', label: 'Francés (cuota fija)' },
  { value: 'aleman', label: 'Alemán (capital fijo)' },
  { value: 'americano', label: 'Americano (solo interés + capital al final)' },
  { value: 'flat', label: 'Flat (interés fijo sobre el monto original)' },
];
const LABEL_METODO = Object.fromEntries(METODOS.map(m => [m.value, m.label]));

/** Valores del formulario -> parametros (forma SimularPrestamoDto, lo que acepta /simular y /simulaciones). */
function formAParametros(vals: any): any {
  const p: any = {
    montoPrincipal: vals.montoPrincipal,
    fechaDesembolso: vals.fechaDesembolso?.format ? vals.fechaDesembolso.format('YYYY-MM-DD') : vals.fechaDesembolso,
    fechaPrimerPago: vals.fechaPrimerPago?.format ? vals.fechaPrimerPago.format('YYYY-MM-DD') : vals.fechaPrimerPago,
    plazoPeriodos: vals.plazoPeriodos,
    frecuencia: vals.frecuencia,
    metodo: vals.metodo,
    tasa: { valor: Number(vals.tasaValor) / 100, periodoExpresado: vals.tasaPeriodoExpresado, tipo: vals.tasaTipo, baseDias: vals.tasaBaseDias },
  };
  if (vals.frecuencia === 'diaria') p.frecuenciaDiaria = { excluirDomingos: !!vals.excluirDomingos, excluirFeriados: !!vals.excluirFeriados };
  return p;
}

/** parametros (de una simulación guardada) -> valores de formulario, para recuperar/duplicar. */
function parametrosAForm(p: any): any {
  return {
    montoPrincipal: p.montoPrincipal,
    fechaDesembolso: p.fechaDesembolso ? dayjs(p.fechaDesembolso) : undefined,
    fechaPrimerPago: p.fechaPrimerPago ? dayjs(p.fechaPrimerPago) : undefined,
    plazoPeriodos: p.plazoPeriodos,
    frecuencia: p.frecuencia,
    metodo: p.metodo,
    tasaValor: Number(p.tasa?.valor ?? 0) * 100,
    tasaTipo: p.tasa?.tipo,
    tasaPeriodoExpresado: p.tasa?.periodoExpresado,
    tasaBaseDias: p.tasa?.baseDias,
    excluirDomingos: p.frecuenciaDiaria?.excluirDomingos ?? true,
    excluirFeriados: p.frecuenciaDiaria?.excluirFeriados ?? false,
  };
}

function construirHtmlSimulacion(resultado: any, p: any): string {
  const filas = (resultado.tabla ?? []).map((r: any) => `
    <tr>
      <td>${r.numeroCuota}</td>
      <td>${(r.fecha ?? '').slice(0, 10)}</td>
      <td class="num">${fmt(r.capital)}</td>
      <td class="num">${fmt(r.interes)}</td>
      <td class="num">${fmt(r.cuotaTotal)}</td>
      <td class="num">${fmt(r.saldoRestante)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Simulación de Préstamo</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 20px; font-size: 11px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; margin-bottom: 16px; }
  .grid div { padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; }
  .grid .label { color: #888; font-size: 10px; text-transform: uppercase; }
  .grid .value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 11px; }
  th { background: #f5f5f5; }
  td.num, th.num { text-align: right; }
  @page { size: A4; margin: 14mm; }
  @media print { body { margin: 0; } }
</style>
</head><body>
  <h1>Simulación de Préstamo</h1>
  <p class="sub">Generada el ${new Date().toLocaleString('es-DO')} — no vinculante, sujeta a aprobación</p>

  <div class="grid">
    <div><div class="label">Monto</div><div class="value">${fmt(p.montoPrincipal)}</div></div>
    <div><div class="label">Tasa</div><div class="value">${(Number(p.tasa?.valor ?? 0) * 100).toFixed(3)}% ${p.tasa?.tipo ?? ''} ${p.tasa?.periodoExpresado ?? ''}</div></div>
    <div><div class="label">Frecuencia</div><div class="value">${p.frecuencia}</div></div>
    <div><div class="label">Plazo</div><div class="value">${p.plazoPeriodos} período(s)</div></div>
    <div><div class="label">Método</div><div class="value">${LABEL_METODO[p.metodo] ?? p.metodo}</div></div>
    <div><div class="label">Desembolso</div><div class="value">${p.fechaDesembolso}</div></div>
    <div><div class="label">Primer pago</div><div class="value">${p.fechaPrimerPago}</div></div>
    <div><div class="label">Base de días</div><div class="value">${p.tasa?.baseDias ?? ''}</div></div>
  </div>

  <div class="grid">
    <div><div class="label">Cuota Fija</div><div class="value">${resultado.cuotaFija != null ? fmt(resultado.cuotaFija) : 'Variable'}</div></div>
    <div><div class="label">Total a Pagar</div><div class="value">${fmt(resultado.totalAPagar)}</div></div>
    <div><div class="label">Total Intereses</div><div class="value">${fmt(resultado.totalInteres)}</div></div>
    <div><div class="label">Costo Total del Crédito</div><div class="value">${fmt(resultado.costoTotalCredito)}</div></div>
    <div><div class="label">Tasa por período</div><div class="value">${pct(resultado.tasaEquivalentePorPeriodo)}</div></div>
    <div><div class="label">Tasa anual nominal</div><div class="value">${pct(resultado.tasaAnualNominal)}</div></div>
    <div><div class="label">TEA</div><div class="value">${pct(resultado.tea)}</div></div>
    <div><div class="label">N° Cuotas</div><div class="value">${(resultado.tabla ?? []).length}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Vencimiento</th>
        <th class="num">Capital</th><th class="num">Interés</th>
        <th class="num">Cuota Total</th><th class="num">Saldo Restante</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
</body></html>`;
}

export default function SimuladorPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [formGuardar] = Form.useForm();
  const [formConvertir] = Form.useForm();
  const [resultado, setResultado] = useState<any>(null);
  const [parametros, setParametros] = useState<any>(null);
  const [guardarOpen, setGuardarOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [convertirSim, setConvertirSim] = useState<any>(null);
  const [escenarios, setEscenarios] = useState<{ label: string; parametros: any; resultado: any }[]>([]);
  const frecuencia = Form.useWatch('frecuencia', form);

  const { data: deudores = [] } = useQuery({
    queryKey: ['prestamista-deudores-select'],
    queryFn: () => prestamistalApi.getDeudores({ limit: 200 }),
  });
  const listaDeudores: any[] = (deudores as any)?.data ?? deudores ?? [];

  const { data: misSimulaciones = [], refetch: refetchSimulaciones } = useQuery({
    queryKey: ['prestamista-simulaciones'],
    queryFn: () => prestamistalApi.listarSimulaciones(),
    enabled: historialOpen,
  });

  const simular = useMutation({
    mutationFn: (vals: any) => prestamistalApi.simular(formAParametros(vals)),
    onSuccess: (d: any, vals: any) => { setResultado(d); setParametros(formAParametros(vals)); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al simular'),
  });

  const guardarSimulacion = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearSimulacion({
      deudorId: vals.deudorId || undefined, nombreProspecto: vals.deudorId ? undefined : vals.nombreProspecto,
      nombre: vals.nombre, parametros,
    }),
    onSuccess: () => {
      message.success('Simulación guardada');
      setGuardarOpen(false); formGuardar.resetFields();
      qc.invalidateQueries({ queryKey: ['prestamista-simulaciones'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar la simulación'),
  });

  const recuperarSimulacion = useMutation({
    mutationFn: (id: number) => prestamistalApi.obtenerSimulacion(id),
    onSuccess: (d: any) => {
      form.setFieldsValue(parametrosAForm(d.parametros));
      setParametros(d.parametros);
      setResultado(d.resultado);
      setHistorialOpen(false);
      message.success('Simulación cargada en el formulario');
    },
    onError: () => message.error('No se pudo recuperar la simulación'),
  });

  const eliminarSimulacion = useMutation({
    mutationFn: (id: number) => prestamistalApi.eliminarSimulacion(id),
    onSuccess: () => { message.success('Simulación eliminada'); refetchSimulaciones(); },
    onError: () => message.error('Error al eliminar'),
  });

  const convertirSimulacion = useMutation({
    mutationFn: (vals: any) => prestamistalApi.convertirSimulacion(convertirSim.id, vals),
    onSuccess: (d: any) => {
      message.success(`Solicitud ${d.numero} creada`);
      setConvertirSim(null); formConvertir.resetFields();
      refetchSimulaciones();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al convertir en solicitud'),
  });

  const imprimirSimulacion = () => {
    if (!resultado || !parametros) return;
    imprimirHtml(construirHtmlSimulacion(resultado, parametros));
  };

  const agregarAComparar = () => {
    if (!resultado || !parametros) return;
    const label = `${LABEL_METODO[parametros.metodo]?.split(' ')[0] ?? parametros.metodo} · ${parametros.frecuencia} · ${parametros.plazoPeriodos}p`;
    setEscenarios(prev => [...prev, { label, parametros, resultado }].slice(-4));
  };

  const cols = [
    { title: '#', dataIndex: 'numeroCuota', width: 50 },
    { title: 'Vencimiento', dataIndex: 'fecha', render: (v: string) => v?.slice(0, 10) },
    { title: 'Capital', dataIndex: 'capital', render: fmt },
    { title: 'Interés', dataIndex: 'interes', render: fmt },
    { title: 'Cuota Total', dataIndex: 'cuotaTotal', render: fmt },
    { title: 'Saldo Restante', dataIndex: 'saldoRestante', render: fmt },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Simulador de Préstamo</h2>
        <Button icon={<History size={15} />} onClick={() => setHistorialOpen(true)}>Mis simulaciones</Button>
      </div>

      <Card title="Parámetros" size="small" style={{ marginBottom: 24 }}>
        <Form form={form} layout="vertical" onFinish={v => simular.mutate(v)}
          initialValues={{ metodo: 'frances', frecuencia: 'mensual', tasaTipo: 'nominal', tasaPeriodoExpresado: 'mensual', tasaBaseDias: 360, excluirDomingos: true, excluirFeriados: false }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 16px' }}>
            <Form.Item name="montoPrincipal" label="Monto del Préstamo" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} prefix="RD$" min={1} />
            </Form.Item>
            <Form.Item name="tasaValor" label="Tasa (%)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.01} precision={4} addonAfter="%" />
            </Form.Item>
            <Form.Item name="tasaTipo" label="Tipo">
              <Select><Option value="nominal">Nominal</Option><Option value="efectiva">Efectiva</Option></Select>
            </Form.Item>
            <Form.Item name="tasaPeriodoExpresado" label="Expresada como">
              <Select>
                <Option value="diaria">Diaria</Option><Option value="semanal">Semanal</Option>
                <Option value="quincenal">Quincenal</Option><Option value="mensual">Mensual</Option><Option value="anual">Anual</Option>
              </Select>
            </Form.Item>
            <Form.Item name="tasaBaseDias" label="Base de días">
              <Select><Option value={360}>360</Option><Option value={365}>365</Option></Select>
            </Form.Item>
            <Form.Item name="frecuencia" label="Frecuencia de pago" rules={[{ required: true }]}>
              <Select>{FRECUENCIAS.map(f => <Option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</Option>)}</Select>
            </Form.Item>
            {frecuencia === 'diaria' && (
              <>
                <Form.Item name="excluirDomingos" label="Excluir domingos" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="excluirFeriados" label="Excluir feriados" valuePropName="checked"><Switch /></Form.Item>
              </>
            )}
            <Form.Item name="plazoPeriodos" label="Plazo (períodos)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={600} />
            </Form.Item>
            <Form.Item name="metodo" label="Método de Amortización">
              <Select>{METODOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="fechaDesembolso" label="Fecha Desembolso" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="fechaPrimerPago" label="Fecha Primer Pago" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" icon={<Calculator size={15} />} loading={simular.isPending}>
            Simular
          </Button>
        </Form>
      </Card>

      {resultado && (
        <Card
          title="Resultado de la Simulación" size="small" style={{ marginBottom: 24 }}
          extra={
            <Space wrap>
              <Button size="small" icon={<Plus size={14} />} onClick={agregarAComparar}>Agregar a comparar</Button>
              <Button size="small" icon={<Save size={14} />} onClick={() => setGuardarOpen(true)}>Guardar</Button>
              <Button size="small" icon={<Printer size={14} />} onClick={imprimirSimulacion}>Imprimir</Button>
            </Space>
          }
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
            <Col xs={12} md={6}>
              <Statistic title="Cuota Fija" value={resultado.cuotaFija != null ? fmt(resultado.cuotaFija) : 'Variable'} valueStyle={{ fontSize: 16, color: C.colorPrimary }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Total a Pagar" value={fmt(resultado.totalAPagar)} valueStyle={{ fontSize: 16 }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Total Intereses" value={fmt(resultado.totalInteres)} valueStyle={{ fontSize: 16, color: C.colorWarning }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Costo Total del Crédito" value={fmt(resultado.costoTotalCredito)} valueStyle={{ fontSize: 16 }} />
            </Col>
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={8} md={4}>
              <Statistic title="Tasa por período" value={pct(resultado.tasaEquivalentePorPeriodo)} valueStyle={{ fontSize: 14 }} />
            </Col>
            <Col xs={8} md={4}>
              <Statistic title="Tasa anual nominal" value={pct(resultado.tasaAnualNominal)} valueStyle={{ fontSize: 14 }} />
            </Col>
            <Col xs={8} md={4}>
              <Statistic title="TEA" value={pct(resultado.tea)} valueStyle={{ fontSize: 14, color: C.colorPrimary }} />
            </Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Table
            dataSource={(resultado.tabla ?? []).map((r: any, i: number) => ({ ...r, key: i }))}
            columns={cols} size="small" scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 10, size: 'small' }}
          />
        </Card>
      )}

      {escenarios.length > 0 && (
        <Card
          title="Comparador de escenarios" size="small"
          extra={<Button size="small" danger onClick={() => setEscenarios([])}>Limpiar</Button>}
        >
          <Table
            size="small" pagination={false} rowKey={(_r, i) => String(i)}
            dataSource={escenarios}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Escenario', dataIndex: 'label' },
              { title: 'Monto', render: (_: any, e: any) => fmt(e.parametros.montoPrincipal) },
              { title: 'Tasa', render: (_: any, e: any) => `${(Number(e.parametros.tasa?.valor ?? 0) * 100).toFixed(3)}%` },
              { title: 'Frecuencia', render: (_: any, e: any) => e.parametros.frecuencia },
              { title: 'Método', render: (_: any, e: any) => LABEL_METODO[e.parametros.metodo] ?? e.parametros.metodo },
              { title: 'Plazo', render: (_: any, e: any) => e.parametros.plazoPeriodos },
              { title: 'Cuota', render: (_: any, e: any) => e.resultado.cuotaFija != null ? fmt(e.resultado.cuotaFija) : 'Variable' },
              { title: 'Interés Total', render: (_: any, e: any) => fmt(e.resultado.totalInteres) },
              { title: 'Costo Total', render: (_: any, e: any) => fmt(e.resultado.costoTotalCredito) },
              { title: 'TEA', render: (_: any, e: any) => pct(e.resultado.tea) },
              {
                title: 'Diferencia (interés) vs. 1°', render: (_: any, e: any, i: number) => {
                  if (i === 0) return '—';
                  const diff = Number(e.resultado.totalInteres) - Number(escenarios[0].resultado.totalInteres);
                  return <span style={{ color: diff > 0 ? C.colorError : C.colorSuccess }}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>;
                },
              },
            ]}
          />
        </Card>
      )}

      {/* Guardar simulación */}
      <Modal title="Guardar Simulación" open={guardarOpen} onCancel={() => setGuardarOpen(false)}
        onOk={() => formGuardar.validateFields().then(v => guardarSimulacion.mutate(v))}
        okText="Guardar" confirmLoading={guardarSimulacion.isPending}>
        <Form form={formGuardar} layout="vertical">
          <Form.Item name="nombre" label="Nombre de la simulación" rules={[{ required: true }]}>
            <Input placeholder="Ej. Préstamo 100k a 12 meses" />
          </Form.Item>
          <Form.Item name="deudorId" label="Deudor (si ya tiene ficha)">
            <Select allowClear showSearch optionFilterProp="children" placeholder="Elegir deudor existente">
              {listaDeudores.map((d: any) => <Option key={d.id} value={d.id}>{d.nombre} {d.apellidos ?? ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.deudorId !== c.deudorId}>
            {() => !formGuardar.getFieldValue('deudorId') && (
              <Form.Item name="nombreProspecto" label="O nombre del prospecto (sin ficha todavía)">
                <Input placeholder="Ej. Juan Pérez" />
              </Form.Item>
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* Mis simulaciones */}
      <Modal title="Mis simulaciones" open={historialOpen} onCancel={() => setHistorialOpen(false)} footer={null} width={820}>
        <Table
          size="small" rowKey="id" pagination={{ pageSize: 8 }} scroll={{ x: 'max-content' }}
          dataSource={(misSimulaciones as any[]).map((s: any) => ({ ...s, key: s.id }))}
          columns={[
            { title: 'Nombre', dataIndex: 'nombre' },
            { title: 'Para', render: (_: any, s: any) => s.deudorId ? <Tag color="blue">Deudor #{s.deudorId}</Tag> : <Tag>{s.nombreProspecto ?? 'Prospecto'}</Tag> },
            { title: 'Monto', dataIndex: 'montoPrincipal', render: fmt },
            { title: 'Frecuencia', dataIndex: 'frecuencia' },
            { title: 'Método', dataIndex: 'metodo', render: (v: string) => LABEL_METODO[v] ?? v },
            { title: 'Cuota', dataIndex: 'cuotaFija', render: (v: any) => v != null ? fmt(v) : 'Variable' },
            { title: 'TEA', dataIndex: 'tea', render: pct },
            { title: 'Creada', dataIndex: 'createdAt', render: (v: string) => v?.slice(0, 10) },
            {
              title: '', key: 'acc', width: 220,
              render: (_: any, s: any) => (
                <Space size="small">
                  <Button size="small" icon={<Copy size={13} />} title="Recuperar / duplicar" onClick={() => recuperarSimulacion.mutate(s.id)} />
                  <Button size="small" icon={<FileText size={13} />} title="PDF de cotización" onClick={() => window.open(prestamistalApi.pdfCotizacion(s.id), '_blank')} />
                  <Button size="small" icon={<ArrowRightLeft size={13} />} title="Convertir en solicitud" onClick={() => setConvertirSim(s)} />
                  <Popconfirm title="¿Eliminar esta simulación?" onConfirm={() => eliminarSimulacion.mutate(s.id)}>
                    <Button size="small" danger icon={<Trash2 size={13} />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      {/* Convertir en solicitud */}
      <Modal
        title="Convertir en Solicitud" open={!!convertirSim} onCancel={() => setConvertirSim(null)}
        onOk={() => formConvertir.validateFields().then(v => convertirSimulacion.mutate(v))}
        okText="Convertir" confirmLoading={convertirSimulacion.isPending}
      >
        <p style={{ color: C.colorTextSecondary, fontSize: 13 }}>
          {convertirSim?.deudorId
            ? `Se creará una solicitud pendiente para el deudor #${convertirSim.deudorId}, con el monto y plazo de esta simulación.`
            : 'Esta simulación es de un prospecto sin ficha — elige el deudor para crear la solicitud.'}
        </p>
        <Form form={formConvertir} layout="vertical">
          {!convertirSim?.deudorId && (
            <Form.Item name="deudorId" label="Deudor" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children" placeholder="Elegir deudor">
                {listaDeudores.map((d: any) => <Option key={d.id} value={d.id}>{d.nombre} {d.apellidos ?? ''}</Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="proposito" label="Propósito (opcional)"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
