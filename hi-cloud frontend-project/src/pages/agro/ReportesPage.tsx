import { useState } from 'react';
import { Card, Button, DatePicker, Form, Row, Col, Divider, theme, message } from 'antd';
import { Download } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

const { RangePicker } = DatePicker;

interface Reporte {
  key: string;
  label: string;
  desc: string;
  extraParam?: { name: string; label: string; type: 'date-range' | 'number'; placeholder?: string };
}

const REPORTES: Reporte[] = [
  { key: 'rentabilidad-ciclos',          label: 'Rentabilidad de Ciclos',         desc: 'P&L completo por ciclo: costos, ingresos, margen' },
  { key: 'rendimiento-cultivos',          label: 'Rendimiento de Cultivos',         desc: 'Real vs estimado por cultivo y variedad' },
  { key: 'costos-por-categoria',          label: 'Costos por Categoría',            desc: 'Desglose de costos: mano de obra, insumos, maquinaria' },
  { key: 'produccion-leche',              label: 'Producción de Leche',             desc: 'Producción diaria por animal', extraParam: { name: 'dias', label: 'Días', type: 'number', placeholder: '30' } },
  { key: 'inventario-animales',           label: 'Inventario de Animales',          desc: 'Padrón completo con genealogía y pesos' },
  { key: 'trazabilidad-insumos',          label: 'Trazabilidad de Insumos',         desc: 'Registro de aplicaciones con período de carencia' },
  { key: 'consumo-insumos-ciclo',         label: 'Consumo de Insumos por Ciclo',    desc: 'Insumos consumidos agregados por ciclo de producción' },
  { key: 'calendario-sanitario',          label: 'Calendario Sanitario',            desc: 'Eventos sanitarios próximos y vencidos', extraParam: { name: 'dias', label: 'Días a futuro', type: 'number', placeholder: '60' } },
  { key: 'uso-costo-maquinaria',          label: 'Uso y Costo de Maquinaria',       desc: 'Horas y costos por maquinaria en labores' },
  { key: 'proyeccion-cosechas',           label: 'Proyección de Cosechas',          desc: 'Cosechas próximas con rendimiento estimado', extraParam: { name: 'dias', label: 'Días a futuro', type: 'number', placeholder: '90' } },
  { key: 'comparativo-parcelas',          label: 'Comparativo de Parcelas',         desc: 'Historial de ciclos por parcela con costos y rendimientos' },
  { key: 'stock-insumos',                 label: 'Stock de Insumos',                desc: 'Inventario actual con alertas de reorden' },
];

export default function ReportesPage() {
  const { token: C } = theme.useToken();
  const [loading, setLoading] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});

  const descargar = async (key: string) => {
    setLoading(key);
    try {
      const q: Record<string, any> = {};
      if (params[key]?.dias) q.dias = params[key].dias;
      if (params[key]?.rango) {
        q.desde = params[key].rango[0]?.format('YYYY-MM-DD');
        q.hasta = params[key].rango[1]?.format('YYYY-MM-DD');
      }
      const reporte = REPORTES.find(r => r.key === key);
      await agroApi.descargarReporte(key, reporte?.label ?? key, q);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al descargar reporte');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ color: C.colorText, marginBottom: 4 }}>Reportes Agro / Finca</h2>
      <p style={{ color: C.colorTextSecondary, marginBottom: 24 }}>Todos los reportes se descargan en formato CSV compatible con Excel</p>

      <Row gutter={[16, 16]}>
        {REPORTES.map(r => (
          <Col xs={24} sm={12} lg={8} key={r.key}>
            <Card size="small" style={{ height: '100%' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.label}</div>
              <div style={{ color: C.colorTextSecondary, fontSize: 12, marginBottom: 12 }}>{r.desc}</div>

              {r.extraParam?.type === 'number' && (
                <Form.Item label={r.extraParam.label} style={{ marginBottom: 8 }}>
                  <input type="number" placeholder={r.extraParam.placeholder} min={1} style={{ width: 100, padding: '2px 8px', border: `1px solid ${C.colorBorder}`, borderRadius: 4 }}
                    onChange={e => setParams(p => ({ ...p, [r.key]: { ...p[r.key], dias: e.target.value } }))} />
                </Form.Item>
              )}
              {r.extraParam?.type === 'date-range' && (
                <Form.Item label="Rango de fechas" style={{ marginBottom: 8 }}>
                  <RangePicker size="small" onChange={v => setParams(p => ({ ...p, [r.key]: { ...p[r.key], rango: v } }))} />
                </Form.Item>
              )}

              <Button block type="default" icon={<Download size={14} />}
                loading={loading === r.key} onClick={() => descargar(r.key)}>
                Descargar CSV
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      <Divider />
      <p style={{ color: C.colorTextSecondary, fontSize: 12 }}>
        Los archivos incluyen BOM UTF-8 para compatibilidad con Microsoft Excel. Para abrirlos correctamente: Archivo → Abrir → Examinar → seleccionar el CSV → Importar → UTF-8.
      </p>
    </div>
  );
}
