import { useState } from 'react';
import {
  Card, Row, Col, Button, Tabs, DatePicker, Space, Typography,
  Statistic, Table, Tag, Divider, Spin, Alert, Select, theme,
} from 'antd';
import {
  BarChartOutlined, PrinterOutlined, DownloadOutlined,
  BankOutlined, DollarOutlined, RiseOutlined, FallOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import BalanceGeneralDetallado from './BalanceGeneralDetallado';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const fmt = (v: number, decimals = 0) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(v ?? 0);

const pct = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

function FilaCuenta({ cuentas, tipo }: { cuentas: any[]; tipo: string }) {
  const { token } = theme.useToken();
  if (!cuentas?.length) return null;
  const subtotal = cuentas.reduce((s: number, c: any) => s + Number(c.saldo), 0);
  return (
    <>
      {cuentas.map((c: any) => (
        <tr key={c.codigo} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <td style={{ padding: '6px 12px', paddingLeft: 32, color: token.colorText, fontSize: 13 }}>
            <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>{c.codigo}</Text>
            {c.nombre}
          </td>
          <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: 13, fontFamily: 'monospace', color: token.colorText }}>
            {fmt(Number(c.saldo))}
          </td>
        </tr>
      ))}
      <tr style={{ background: token.colorFillAlter, borderBottom: `2px solid ${token.colorBorderSecondary}` }}>
        <td style={{ padding: '8px 12px', paddingLeft: 16, fontWeight: 600, color: token.colorText }}>
          Subtotal {tipo}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: token.colorText }}>
          {fmt(subtotal)}
        </td>
      </tr>
    </>
  );
}

export default function ReportesFinancierosPage() {
  const { token } = theme.useToken();
  const hoy       = dayjs();
  const inicioAno = dayjs().startOf('year');

  const [tabActiva, setTabActiva] = useState('estado-resultados');
  const [rango, setRango]         = useState<[dayjs.Dayjs, dayjs.Dayjs]>([inicioAno, hoy]);

  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  const { data: er, isLoading: loadingER } = useQuery<any>({
    queryKey: ['estado-resultados', desde, hasta],
    queryFn:  () => api.get(`/reportes-financieros/estado-resultados?desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  tabActiva === 'estado-resultados',
  });

  const handlePrint = () => window.print();

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarChartOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Reportes Financieros</Title>
            <Text type="secondary">Estado de Resultados · Balance General · Flujo de Efectivo</Text>
          </div>
        </div>
        <Space>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Imprimir</Button>
          {tabActiva === 'estado-resultados' && (
            <Button icon={<FilePdfOutlined />} type="primary" danger
              onClick={async () => {
                const empresaId = localStorage.getItem('empresaId') ?? '';
                const res = await fetch(
                  `/api/v1/reportes-financieros/estado-resultados/pdf?desde=${desde}&hasta=${hasta}`,
                  { headers: { 'X-Empresa-ID': empresaId } }
                );
                if (!res.ok) { alert('Error generando PDF'); return; }
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `Estado-Resultados-${desde}-${hasta}.pdf`;
                a.click(); URL.revokeObjectURL(a.href);
              }}>
              Descargar PDF
            </Button>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={tabActiva}
        onChange={setTabActiva}
        tabBarExtraContent={
          tabActiva === 'estado-resultados' ? (
            <RangePicker
              value={rango}
              onChange={v => v && setRango(v as [dayjs.Dayjs, dayjs.Dayjs])}
              format="DD/MM/YYYY"
              picker="month"
              style={{ width: 240 }}
            />
          ) : null
        }
        items={[
          {
            key: 'estado-resultados',
            label: 'Estado de Resultados',
            children: (
              <Spin spinning={loadingER}>
                {er && (
                  <>
                    {/* Tabla de Estado de Resultados */}
                    <Card bordered={false} style={{ borderRadius: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Title level={5} style={{ margin: 0 }}>Estado de Resultados</Title>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Período: {rango[0].format('DD/MM/YYYY')} — {rango[1].format('DD/MM/YYYY')}
                        </Text>
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {/* INGRESOS */}
                          <tr style={{ background: '#1a56db', color: '#fff' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13 }}>
                              INGRESOS
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} />
                          </tr>
                          <FilaCuenta cuentas={er.ingresos.cuentas} tipo="Ingresos" />

                          {/* Utilidad Bruta */}
                          <tr style={{ background: '#dbeafe' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: '#1e40af' }}>
                              UTILIDAD BRUTA
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#1e40af', fontFamily: 'mono' }}>
                              {fmt(er.resultados.utilidadBruta)}
                              <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>
                                {pct(er.resultados.margenBruto)}
                              </Tag>
                            </td>
                          </tr>

                          {/* COSTOS */}
                          <tr style={{ background: token.colorWarningBg, color: token.colorWarning }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13 }}>
                              COSTOS DE VENTAS
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} />
                          </tr>
                          <FilaCuenta cuentas={er.costos.cuentas} tipo="Costos" />

                          {/* GASTOS */}
                          <tr style={{ background: 'rgba(249,115,22,0.08)', color: token.colorWarning }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13 }}>
                              GASTOS OPERATIVOS
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} />
                          </tr>
                          <FilaCuenta cuentas={er.gastos.cuentas} tipo="Gastos" />

                          {/* Utilidad Neta */}
                          <tr style={{ background: er.resultados.utilidadNeta >= 0 ? '#dcfce7' : '#fee2e2' }}>
                            <td style={{ padding: '12px 12px', fontWeight: 700, fontSize: 14, color: er.resultados.utilidadNeta >= 0 ? '#166534' : '#991b1b' }}>
                              UTILIDAD NETA ANTES DE ISR
                            </td>
                            <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, fontSize: 16, color: er.resultados.utilidadNeta >= 0 ? '#166534' : '#991b1b', fontFamily: 'mono' }}>
                              {fmt(er.resultados.utilidadNeta)}
                            </td>
                          </tr>
                          <tr style={{ background: token.colorFillAlter }}>
                            <td style={{ padding: '8px 12px', paddingLeft: 32, fontSize: 12, color: token.colorTextSecondary }}>
                              ISR Estimado 27% (Ley 11-92 RD)
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#dc2626', fontFamily: 'mono' }}>
                              -{fmt(er.resultados.isrEstimado)}
                            </td>
                          </tr>
                          <tr style={{ background: er.resultados.utilidadDespuesIsr >= 0 ? '#14532d' : '#7f1d1d', color: '#fff' }}>
                            <td style={{ padding: '12px 12px', fontWeight: 700, fontSize: 14 }}>
                              UTILIDAD NETA DESPUÉS DE ISR
                            </td>
                            <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, fontSize: 16, fontFamily: 'mono' }}>
                              {fmt(er.resultados.utilidadDespuesIsr)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </Card>
                  </>
                )}
                {!er && !loadingER && (
                  <Alert type="info" message="Selecciona un período para generar el Estado de Resultados." />
                )}
              </Spin>
            ),
          },
          {
            key: 'balance-general',
            label: 'Balance General',
            children: <BalanceGeneralDetallado />,
          },
        ]}
      />
    </div>
  );
}
