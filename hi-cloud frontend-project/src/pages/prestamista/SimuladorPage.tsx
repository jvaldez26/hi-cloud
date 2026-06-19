import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, Form, InputNumber, Select, DatePicker, Button, Table, Statistic, Row, Col, Divider, message, theme } from 'antd';
import { Calculator } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

export default function SimuladorPage() {
  const { token: C } = theme.useToken();
  const [form] = Form.useForm();
  const [resultado, setResultado] = useState<any>(null);

  const simular = useMutation({
    mutationFn: (vals: any) => prestamistalApi.simular({
      principal: vals.principal,
      tasaInteresMensual: vals.tasaInteresMensual,
      plazoMeses: vals.plazoMeses,
      metodoAmortizacion: vals.metodoAmortizacion,
      fechaPrimerPago: vals.fechaPrimerPago?.format('YYYY-MM-DD'),
    }),
    onSuccess: (d: any) => setResultado(d),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al simular'),
  });

  const cols = [
    { title: '#', dataIndex: 'numeroCuota', width: 50 },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
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
            <Form form={form} layout="vertical" onFinish={v => simular.mutate(v)}>
              <Form.Item name="principal" label="Monto del Préstamo" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} prefix="RD$" min={1} />
              </Form.Item>
              <Form.Item name="tasaInteresMensual" label="Tasa de Interés Mensual (%)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} max={100} precision={3} addonAfter="%" />
              </Form.Item>
              <Form.Item name="plazoMeses" label="Plazo (meses)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={360} />
              </Form.Item>
              <Form.Item name="metodoAmortizacion" label="Método de Amortización" initialValue="frances">
                <Select>
                  <Option value="frances">Francés (cuota fija)</Option>
                  <Option value="aleman">Alemán (capital fijo)</Option>
                </Select>
              </Form.Item>
              <Form.Item name="fechaPrimerPago" label="Fecha Primer Pago" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<Calculator size={15} />} block loading={simular.isPending}>
                Simular
              </Button>
            </Form>
          </Card>
        </Col>

        {resultado && (
          <Col xs={24} md={14}>
            <Card title="Resultado de la Simulación" size="small">
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <Statistic title="Cuota Fija" value={fmt(resultado.cuotaFija)} valueStyle={{ fontSize: 16, color: C.colorPrimary }} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="Total a Pagar" value={fmt(resultado.totalAPagar)} valueStyle={{ fontSize: 16 }} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="Total Intereses" value={fmt(resultado.totalInteres)} valueStyle={{ fontSize: 16, color: C.colorWarning }} />
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="N° Cuotas" value={(resultado.tabla ?? []).length} valueStyle={{ fontSize: 16 }} />
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Table
                dataSource={(resultado.tabla ?? []).map((r: any, i: number) => ({ ...r, key: i }))}
                columns={cols} size="small" scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 12, size: 'small' }}
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
