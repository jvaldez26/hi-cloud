import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, Form, InputNumber, Select, DatePicker, Button, Table, Statistic, Row, Col, Divider, Switch, message, theme } from 'antd';
import { Calculator } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

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

export default function SimuladorPage() {
  const { token: C } = theme.useToken();
  const [form] = Form.useForm();
  const [resultado, setResultado] = useState<any>(null);
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
      return prestamistalApi.simular(body);
    },
    onSuccess: (d: any) => setResultado(d),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al simular'),
  });

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

      <Row gutter={[24, 24]}>
        <Col xs={24} md={10}>
          <Card title="Parámetros" size="small">
            <Form form={form} layout="vertical" onFinish={v => simular.mutate(v)}
              initialValues={{ metodo: 'frances', frecuencia: 'mensual', tasaTipo: 'nominal', tasaPeriodoExpresado: 'mensual', tasaBaseDias: 360, excluirDomingos: true, excluirFeriados: false }}>
              <Form.Item name="montoPrincipal" label="Monto del Préstamo" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} prefix="RD$" min={1} />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
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
              </div>

              <Form.Item name="frecuencia" label="Frecuencia de pago" rules={[{ required: true }]}>
                <Select>{FRECUENCIAS.map(f => <Option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</Option>)}</Select>
              </Form.Item>
              {frecuencia === 'diaria' && (
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <Form.Item name="excluirDomingos" label="Excluir domingos" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="excluirFeriados" label="Excluir feriados" valuePropName="checked"><Switch /></Form.Item>
                </div>
              )}

              <Form.Item name="plazoPeriodos" label="Plazo (en períodos de la frecuencia elegida)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={600} />
              </Form.Item>
              <Form.Item name="metodo" label="Método de Amortización">
                <Select>{METODOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}</Select>
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <Form.Item name="fechaDesembolso" label="Fecha Desembolso" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
                <Form.Item name="fechaPrimerPago" label="Fecha Primer Pago" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
              </div>
              <Button type="primary" htmlType="submit" icon={<Calculator size={15} />} block loading={simular.isPending}>
                Simular
              </Button>
            </Form>
          </Card>
        </Col>

        {resultado && (
          <Col xs={24} md={14}>
            <Card title="Resultado de la Simulación" size="small">
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
                <Col xs={8}>
                  <Statistic title="Tasa por período" value={pct(resultado.tasaEquivalentePorPeriodo)} valueStyle={{ fontSize: 14 }} />
                </Col>
                <Col xs={8}>
                  <Statistic title="Tasa anual nominal" value={pct(resultado.tasaAnualNominal)} valueStyle={{ fontSize: 14 }} />
                </Col>
                <Col xs={8}>
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
          </Col>
        )}
      </Row>
    </div>
  );
}
