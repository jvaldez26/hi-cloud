import { useState } from 'react';
import { Card, Row, Col, Button, DatePicker, InputNumber, Form, message, theme, Divider } from 'antd';
import { Download } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

const { RangePicker } = DatePicker;

export default function ReportesPrestamistaPage() {
  const { token: C } = theme.useToken();
  const [loading, setLoading] = useState<string | null>(null);
  const [form] = Form.useForm();

  const descargar = async (tipo: string, nombre: string, params?: Record<string, any>) => {
    setLoading(tipo);
    try {
      await prestamistalApi.descargarReporte(tipo, nombre, params);
    } catch {
      message.error('Error al descargar el reporte');
    } finally {
      setLoading(null);
    }
  };

  const ReporteCard = ({ tipo, titulo, desc, params }: { tipo: string; titulo: string; desc: string; params?: Record<string, any> }) => (
    <Card size="small" title={titulo} style={{ height: '100%' }}>
      <p style={{ color: C.colorTextSecondary, fontSize: 13, marginBottom: 12, minHeight: 36 }}>{desc}</p>
      <Button
        icon={<Download size={14} />}
        loading={loading === tipo}
        onClick={() => descargar(tipo, titulo.toLowerCase().replace(/\s+/g, '-'), params)}
      >
        Descargar CSV
      </Button>
    </Card>
  );

  const values = form.getFieldsValue();
  const desde = values.periodo?.[0]?.format('YYYY-MM-DD');
  const hasta = values.periodo?.[1]?.format('YYYY-MM-DD');
  const diasProy = values.dias ?? 30;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 8, color: C.colorText }}>Reportes Prestamista / Financiera</h2>
      <p style={{ color: C.colorTextSecondary, marginBottom: 24 }}>
        Los reportes se descargan en formato CSV compatible con Excel y LibreOffice.
      </p>

      {/* Filtros globales */}
      <Card size="small" title="Filtros para reportes por período" style={{ marginBottom: 24 }}>
        <Form form={form} layout="inline" onValuesChange={() => {}}>
          <Form.Item name="periodo" label="Período">
            <RangePicker format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="dias" label="Días proyección" initialValue={30}>
            <InputNumber min={1} max={365} style={{ width: 90 }} />
          </Form.Item>
        </Form>
      </Card>

      <Divider orientation="left">Cartera</Divider>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="cartera-activa" titulo="Cartera Activa"
            desc="Todos los préstamos activos con saldos de capital, interés y mora." />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="cartera-mora" titulo="Cartera por Antigüedad de Mora"
            desc="Préstamos clasificados por rango de días de mora: 0, 1-30, 31-60, 61-90, +90." />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="cuotas-vencidas" titulo="Cuotas Vencidas"
            desc="Cuotas pendientes cuya fecha de vencimiento ya pasó." />
        </Col>
      </Row>

      <Divider orientation="left">Cobros</Divider>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" title="Flujo de Cobros" style={{ height: '100%' }}>
            <p style={{ color: C.colorTextSecondary, fontSize: 13, marginBottom: 12, minHeight: 36 }}>
              Pagos recibidos en el período seleccionado, desglosados por capital, interés y mora.
            </p>
            <Button icon={<Download size={14} />} loading={loading === 'flujo-cobros'}
              onClick={() => descargar('flujo-cobros', 'flujo-cobros', { desde, hasta })}>
              Descargar CSV
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" title="Proyección de Cobros" style={{ height: '100%' }}>
            <p style={{ color: C.colorTextSecondary, fontSize: 13, marginBottom: 12, minHeight: 36 }}>
              Cuotas por vencer en los próximos {diasProy} días con montos esperados.
            </p>
            <Button icon={<Download size={14} />} loading={loading === 'proyeccion-cobros'}
              onClick={() => descargar('proyeccion-cobros', 'proyeccion-cobros', { dias: diasProy })}>
              Descargar CSV
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small" title="Gestiones de Cobranza" style={{ height: '100%' }}>
            <p style={{ color: C.colorTextSecondary, fontSize: 13, marginBottom: 12, minHeight: 36 }}>
              Historial de gestiones de cobranza (llamadas, visitas, acuerdos) en el período.
            </p>
            <Button icon={<Download size={14} />} loading={loading === 'gestiones-cobranza'}
              onClick={() => descargar('gestiones-cobranza', 'gestiones-cobranza', { desde, hasta })}>
              Descargar CSV
            </Button>
          </Card>
        </Col>
      </Row>

      <Divider orientation="left">Análisis</Divider>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="por-producto" titulo="Préstamos por Producto"
            desc="Resumen agrupado por tipo de producto: capital, saldos, mora y estado." />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="indices-financieros" titulo="Índices Financieros"
            desc="KPIs clave: cartera activa, índice de morosidad, recaudado total, etc." />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="deudores-saldos" titulo="Deudores con Saldos"
            desc="Lista de deudores activos con totales prestados, pagados y nivel de riesgo." />
        </Col>
      </Row>

      <Divider orientation="left">Documentos</Divider>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="garantias" titulo="Garantías Registradas"
            desc="Inventario de garantías con tipo, valor tasado, estado y préstamo asociado." />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <ReporteCard tipo="refinanciamientos" titulo="Refinanciamientos"
            desc="Historial de refinanciamientos con préstamos originales y nuevas condiciones." />
        </Col>
      </Row>
    </div>
  );
}
