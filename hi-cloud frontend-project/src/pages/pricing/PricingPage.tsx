import { useState } from 'react';
import { Card, Button, Typography, Tag, Row, Col, List, Divider } from 'antd';
import { CheckOutlined, RocketOutlined, CrownOutlined, StarOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import DemoModal from '../auth/DemoModal';

const { Title, Text } = Typography;

const PLANES = [
  {
    nombre:    'Básico',
    precio:    'RD$ 3,500',
    periodo:   '/mes',
    descripcion: 'Ideal para microempresas y emprendedores',
    color:     '#6b7280',
    gradient:  'linear-gradient(135deg,#374151,#1f2937)',
    icon:      <StarOutlined />,
    popular:   false,
    caracteristicas: [
      '1 usuario incluido',
      'Clientes y Productos',
      'Facturación e-CF DGII',
      'Cotizaciones',
      '50 facturas/mes',
      'Inventario básico',
      'Reportes esenciales',
      'Soporte por email',
    ],
    noIncluye: ['Nómina', 'Contabilidad', 'Tesorería', 'Multi-empresa'],
  },
  {
    nombre:    'Profesional',
    precio:    'RD$ 7,500',
    periodo:   '/mes',
    descripcion: 'Para pequeñas y medianas empresas en crecimiento',
    color:     '#1a56db',
    gradient:  'linear-gradient(135deg,#1a56db,#0ea5e9)',
    icon:      <RocketOutlined />,
    popular:   true,
    caracteristicas: [
      '5 usuarios incluidos',
      'Todos los módulos operativos',
      'Contabilidad General',
      'Cuentas por Cobrar/Pagar',
      'Nómina (Ley 87-01 + TSS)',
      'Tesorería y Flujo de Caja',
      'Activos Fijos (DGII)',
      'Facturas ilimitadas',
      'POS (Punto de Venta)',
      'Auditoría completa',
      'Soporte prioritario',
      'Backups diarios',
    ],
    noIncluye: ['Multi-empresa'],
  },
  {
    nombre:    'Empresarial',
    precio:    'Cotizar',
    periodo:   '',
    descripcion: 'Para grandes empresas y grupos corporativos',
    color:     '#7c3aed',
    gradient:  'linear-gradient(135deg,#7c3aed,#a78bfa)',
    icon:      <CrownOutlined />,
    popular:   false,
    caracteristicas: [
      'Usuarios ilimitados',
      'Todo lo del plan Profesional',
      'Multi-empresa / Multi-sucursal',
      'API personalizada',
      'Integración con sistemas externos',
      'Formatos DGII 606/607/608',
      'White-label (marca propia)',
      'Gerente de cuenta dedicado',
      'SLA garantizado 99.9%',
      'Soporte 24/7',
      'Capacitación presencial',
      'Instalación on-premise opcional',
    ],
    noIncluye: [],
  },
];

export default function PricingPage() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div style={{ background: '#0d1117', minHeight: '100vh', padding: '60px 24px' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 52px' }}>
        <Tag color="blue" style={{ marginBottom: 12, fontSize: 13, padding: '4px 12px' }}>
          Planes y Precios
        </Tag>
        <Title level={1} style={{ color: '#fff', marginBottom: 12, fontSize: 40 }}>
          Invierte en el crecimiento{' '}
          <span style={{
            background: 'linear-gradient(90deg,#1a56db,#0ea5e9)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>de tu empresa</span>
        </Title>
        <Text style={{ color: 'rgba(255,255,255,.55)', fontSize: 17 }}>
          Todos los planes incluyen acceso completo al sistema, actualizaciones automáticas
          y cumplimiento total con la DGII República Dominicana.
        </Text>
      </motion.div>

      {/* Cards */}
      <Row gutter={[20, 20]} justify="center" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {PLANES.map((plan, i) => (
          <Col xs={24} md={8} key={plan.nombre}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * .12 }}
              whileHover={{ y: -6 }}
            >
              <Card
                style={{
                  background:  plan.popular ? 'rgba(26,86,219,.12)' : 'rgba(255,255,255,.04)',
                  border:      plan.popular ? '2px solid #1a56db' : '1px solid rgba(255,255,255,.1)',
                  borderRadius: 16,
                  position:    'relative',
                  overflow:    'hidden',
                }}
                styles={{ body: { padding: 28 } }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
                    padding: '4px 16px', borderBottomLeftRadius: 10,
                    fontSize: 11, fontWeight: 700, color: '#fff',
                  }}>
                    MÁS POPULAR
                  </div>
                )}

                {/* Plan header */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, marginBottom: 12,
                    background: plan.gradient,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: '#fff',
                  }}>
                    {plan.icon}
                  </div>
                  <Title level={4} style={{ color: '#fff', margin: 0 }}>{plan.nombre}</Title>
                  <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
                    {plan.descripcion}
                  </Text>
                </div>

                {/* Precio */}
                <div style={{ marginBottom: 24 }}>
                  <Text style={{ color: '#fff', fontSize: 36, fontWeight: 700 }}>
                    {plan.precio}
                  </Text>
                  {plan.periodo && (
                    <Text style={{ color: 'rgba(255,255,255,.4)', fontSize: 14 }}>
                      {plan.periodo}
                    </Text>
                  )}
                </div>

                <Button
                  block size="large"
                  onClick={() => setDemoOpen(true)}
                  style={{
                    background:   plan.popular ? plan.gradient : 'rgba(255,255,255,.08)',
                    border:       plan.popular ? 'none' : '1px solid rgba(255,255,255,.15)',
                    color:        '#fff',
                    borderRadius: 10,
                    height:       44,
                    fontWeight:   600,
                    marginBottom: 20,
                    boxShadow:    plan.popular ? '0 4px 20px rgba(26,86,219,.5)' : 'none',
                  }}
                >
                  {plan.precio === 'Cotizar' ? '📞 Contactar ventas' : '🚀 Solicitar Demo'}
                </Button>

                <Divider style={{ borderColor: 'rgba(255,255,255,.08)', margin: '0 0 16px' }} />

                {/* Features list */}
                <List
                  size="small"
                  dataSource={plan.caracteristicas}
                  renderItem={item => (
                    <List.Item style={{ border: 'none', padding: '4px 0' }}>
                      <CheckOutlined style={{ color: '#10b981', marginRight: 8, fontSize: 12 }} />
                      <Text style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>{item}</Text>
                    </List.Item>
                  )}
                />

                {plan.noIncluye.length > 0 && (
                  <List
                    size="small"
                    dataSource={plan.noIncluye}
                    renderItem={item => (
                      <List.Item style={{ border: 'none', padding: '4px 0' }}>
                        <Text style={{ color: 'rgba(255,255,255,.25)', fontSize: 12 }}>✗ {item}</Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      {/* Footer CTA */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6 }}
        style={{ textAlign: 'center', marginTop: 52 }}>
        <Text style={{ color: 'rgba(255,255,255,.4)', display: 'block', marginBottom: 12 }}>
          Todos los precios en pesos dominicanos (DOP) + ITBIS 18%. Factura fiscal incluida.
        </Text>
        <Text style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
          ¿Tienes preguntas? Escríbenos a{' '}
          <Text underline style={{ color: 'rgba(255,255,255,.4)' }}>ventas@hicloud.do</Text>
          {' '}o llámanos al{' '}
          <Text underline style={{ color: 'rgba(255,255,255,.4)' }}>809-555-CLOUD</Text>
        </Text>
      </motion.div>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
