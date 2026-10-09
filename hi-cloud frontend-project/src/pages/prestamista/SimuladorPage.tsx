import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, Form, InputNumber, Select, DatePicker, Button, Table, Statistic, Row, Col, Divider, Switch, message, theme } from 'antd';
import { Calculator, Printer } from 'lucide-react';
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

function construirHtmlSimulacion(resultado: any, params: Record<string, any>): string {
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
    <div><div class="label">Monto</div><div class="value">${fmt(params.montoPrincipal)}</div></div>
    <div><div class="label">Tasa</div><div class="value">${params.tasaValor}% ${params.tasaTipo} ${params.tasaPeriodoExpresado}</div></div>
    <div><div class="label">Frecuencia</div><div class="value">${params.frecuencia}</div></div>
    <div><div class="label">Plazo</div><div class="value">${params.plazoPeriodos} período(s)</div></div>
    <div><div class="label">Método</div><div class="value">${LABEL_METODO[params.metodo] ?? params.metodo}</div></div>
    <div><div class="label">Desembolso</div><div class="value">${params.fechaDesembolso}</div></div>
    <div><div class="label">Primer pago</div><div class="value">${params.fechaPrimerPago}</div></div>
    <div><div class="label">Base de días</div><div class="value">${params.tasaBaseDias}</div></div>
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
  const [form] = Form.useForm();
  const [resultado, setResultado] = useState<any>(null);
  const [parametros, setParametros] = useState<Record<string, any> | null>(null);
  const frecuencia = Form.useWatch('frecuencia', form);

  const simular = useMutation({
    mutationFn: (vals: any) => {
      const body: any = {
        montoPrincipal: vals.montoPrincipal,
        fechaDesembolso: vals.fechaDesembolso?.format('YYYY-MM-DD'),
        fechaPrimerPago: vals.fechaPrimerPago?.format('YYYY-MM-DD'),
        plazoPeriodos: vals.plazoPeriodos,
        frecuencia: vals.frecuencia,
        metodo: vals.metodo,
        tasa: { valor: Number(vals.tasaValor) / 100, periodoExpresado: vals.tasaPeriodoExpresado, tipo: vals.tasaTipo, baseDias: vals.tasaBaseDias },
      };
      if (vals.frecuencia === 'diaria') body.frecuenciaDiaria = { excluirDomingos: !!vals.excluirDomingos, excluirFeriados: !!vals.excluirFeriados };
      setParametros({
        montoPrincipal: vals.montoPrincipal, tasaValor: vals.tasaValor, tasaTipo: vals.tasaTipo,
        tasaPeriodoExpresado: vals.tasaPeriodoExpresado, tasaBaseDias: vals.tasaBaseDias,
        frecuencia: vals.frecuencia, metodo: vals.metodo, plazoPeriodos: vals.plazoPeriodos,
        fechaDesembolso: body.fechaDesembolso, fechaPrimerPago: body.fechaPrimerPago,
      });
      return prestamistalApi.simular(body);
    },
    onSuccess: (d: any) => setResultado(d),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al simular'),
  });

  const imprimirSimulacion = () => {
    if (!resultado || !parametros) return;
    imprimirHtml(construirHtmlSimulacion(resultado, parametros));
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
      <h2 style={{ marginBottom: 24, color: C.colorText }}>Simulador de Préstamo</h2>

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
          title="Resultado de la Simulación" size="small"
          extra={<Button size="small" icon={<Printer size={14} />} onClick={imprimirSimulacion}>Imprimir</Button>}
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
    </div>
  );
}
