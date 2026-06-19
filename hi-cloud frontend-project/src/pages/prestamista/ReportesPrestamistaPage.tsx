import { Card, Row, Col, Button, theme } from 'antd';
import { FileText } from 'lucide-react';
import { prestamistalApi } from '../../api/prestamista.api';

export default function ReportesPrestamistaPage() {
  const { token: C } = theme.useToken();

  const reportes = [
    { titulo: 'Estado de Cuenta por Deudor', desc: 'Historial completo de pagos y cuotas', action: 'deudor' },
    { titulo: 'Tabla de Amortización', desc: 'Proyección de cuotas de un préstamo', action: 'amortizacion' },
    { titulo: 'Recibo de Pago', desc: 'Comprobante de pago individual', action: 'recibo' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24, color: C.colorText }}>Reportes Prestamista</h2>
      <Row gutter={[16, 16]}>
        {reportes.map(r => (
          <Col key={r.titulo} xs={24} sm={12} md={8}>
            <Card size="small" title={r.titulo} style={{ height: '100%' }}>
              <p style={{ color: C.colorTextSecondary, fontSize: 13, marginBottom: 12 }}>{r.desc}</p>
              <Button icon={<FileText size={14} />} disabled>Próximamente</Button>
            </Card>
          </Col>
        ))}
      </Row>
      <div style={{ marginTop: 24, padding: 16, background: C.colorFillTertiary, borderRadius: C.borderRadius }}>
        <p style={{ color: C.colorTextSecondary, margin: 0 }}>
          Los PDFs de amortización, recibo y estado de cuenta están disponibles directamente desde el detalle del préstamo y la ficha del deudor.
        </p>
      </div>
    </div>
  );
}
