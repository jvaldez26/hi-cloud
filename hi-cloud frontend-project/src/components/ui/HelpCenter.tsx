import { useState, useEffect } from 'react';
import { Modal, Tabs, Typography, Tag, Row, Col, Divider, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

// Atajos de teclado
const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],     desc: 'Abrir búsqueda global (Command Palette)' },
  { keys: ['Escape'],         desc: 'Cerrar modal / panel activo' },
  { keys: ['↑', '↓'],        desc: 'Navegar resultados del Command Palette' },
  { keys: ['Enter'],          desc: 'Seleccionar / confirmar' },
];

// Guía de módulos
const MODULES_GUIDE = [
  { emoji: '⚡', name: 'Punto de Venta',   url: '/pos',            desc: 'Ventas rápidas en mostrador con cálculo automático de ITBIS' },
  { emoji: '📝', name: 'Cotizaciones',     url: '/cotizaciones',   desc: 'Crea presupuestos y conviértelos a factura con 1 clic' },
  { emoji: '🧾', name: 'Facturas',         url: '/facturas',       desc: 'Facturación electrónica e-CF DGII E31/E32 automática' },
  { emoji: '🔄', name: 'Recurrentes',      url: '/facturas-recurrentes', desc: 'Auto-facturación mensual/semanal para servicios continuos' },
  { emoji: '🔒', name: 'e-CF DGII',        url: '/ecf',            desc: 'Gestiona tus comprobantes fiscales E31 al E47' },
  { emoji: '💰', name: 'CxC',              url: '/cxc',            desc: 'Cuentas por cobrar con alertas de vencimiento automáticas' },
  { emoji: '💳', name: 'CxP',              url: '/cxp',            desc: 'Cuentas por pagar con recordatorios automáticos' },
  { emoji: '📊', name: 'Contabilidad',     url: '/contabilidad',   desc: 'Balance General y Estado de Resultados en tiempo real' },
  { emoji: '👥', name: 'Nómina',           url: '/nomina',         desc: 'TSS (Ley 87-01) e ISR calculados automáticamente' },
  { emoji: '📦', name: 'Inventario',       url: '/inventario',     desc: 'Trazabilidad completa de entradas, salidas y devoluciones' },
  { emoji: '🏦', name: 'Tesorería',        url: '/tesoreria',      desc: 'Bancos, movimientos y flujo de caja consolidado' },
  { emoji: '📈', name: 'Reportes',         url: '/reportes',       desc: 'KPIs, ventas por período, ITBIS DGII y exportación Excel' },
];

// Tips de productividad
const TIPS = [
  { icon: '🚀', tip: 'Presiona Ctrl+K desde cualquier pantalla para buscar módulos, clientes o facturas.' },
  { icon: '📄', tip: 'En una factura emitida, usa "Enviar por email" para entregar el comprobante al cliente directamente.' },
  { icon: '⚡', tip: 'El Punto de Venta (POS) es la forma más rápida de crear ventas en mostrador. Accede desde el menú o Ctrl+K → "Punto de Venta".' },
  { icon: '🔄', tip: 'Crea Facturas Recurrentes para servicios mensuales y el sistema las generará automáticamente.' },
  { icon: '📊', tip: 'El Balance General y el Estado de Resultados se calculan automáticamente desde los asientos contables.' },
  { icon: '📧', tip: 'Configura SMTP en el .env para enviar facturas y alertas automáticas por email.' },
  { icon: '💚', tip: 'WhatsApp Business: configura WHATSAPP_API_URL en el .env para enviar facturas por WhatsApp.' },
  { icon: '🎯', tip: 'Usa el Pipeline de Demos en /demo-requests para hacer seguimiento a prospectos.' },
];

interface Props { open: boolean; onClose: () => void; }

export default function HelpCenter({ open, onClose }: Props) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filteredModules = MODULES_GUIDE.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.desc.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>❓</span>
          <Title level={4} style={{ margin: 0 }}>Centro de Ayuda</Title>
          <Tag color="blue" style={{ fontSize: 10, marginLeft: 4 }}>HiCloud ERP v1.0</Tag>
        </div>
      }
    >
      <Tabs defaultActiveKey="modulos" items={[
        {
          key: 'modulos',
          label: '📚 Módulos',
          children: (
            <>
              <Input
                prefix={<SearchOutlined />}
                placeholder="Buscar módulo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ marginBottom: 16 }}
                allowClear
              />
              <Row gutter={[10, 10]}>
                {filteredModules.map((m, i) => (
                  <Col span={12} key={m.name}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * .03 }}
                    >
                      <div onClick={() => { onClose(); navigate(m.url); }} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                        <div style={{
                          padding: '10px 12px', borderRadius: 8,
                          border: '1px solid rgba(0,0,0,.08)',
                          cursor: 'pointer', transition: 'all .15s',
                        }}
                          className="help-module-card"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 16 }}>{m.emoji}</span>
                            <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.4 }}>
                            {m.desc}
                          </Text>
                        </div>
                      </div>
                    </motion.div>
                  </Col>
                ))}
              </Row>
            </>
          ),
        },
        {
          key: 'shortcuts',
          label: '⌨️ Atajos',
          children: (
            <>
              <div style={{ marginBottom: 16 }}>
                {SHORTCUTS.map(s => (
                  <Row key={s.desc} justify="space-between" align="middle"
                    style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                    <Text style={{ fontSize: 13 }}>{s.desc}</Text>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {s.keys.map(k => (
                        <Tag key={k} style={{
                          fontFamily: 'monospace', fontSize: 12,
                          background: 'rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.12)',
                        }}>{k}</Tag>
                      ))}
                    </div>
                  </Row>
                ))}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 En el Command Palette (Ctrl+K) puedes navegar con las flechas y confirmar con Enter.
              </Text>
            </>
          ),
        },
        {
          key: 'tips',
          label: '💡 Tips',
          children: (
            <div>
              {TIPS.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * .06 }}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,.06)',
                  }}
                >
                  <span style={{ fontSize: 20, minWidth: 28 }}>{t.icon}</span>
                  <Text style={{ fontSize: 13, lineHeight: 1.6 }}>{t.tip}</Text>
                </motion.div>
              ))}
            </div>
          ),
        },
        {
          key: 'soporte',
          label: '🆘 Soporte',
          children: (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🇩🇴</div>
              <Title level={4}>Soporte HiCloud ERP</Title>
              <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                Nuestro equipo está disponible para ayudarte.
              </Text>
              {[
                { icon: '📧', label: 'Email', value: 'soporte@hicloud.do' },
                { icon: '💚', label: 'WhatsApp', value: '+1 (809) 555-CLOUD' },
                { icon: '🌐', label: 'Documentación', value: 'docs.hicloud.do' },
              ].map(c => (
                <div key={c.label} style={{ padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,.06)', display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{c.icon} {c.label}</Text>
                  <Text strong>{c.value}</Text>
                </div>
              ))}
            </div>
          ),
        },
      ]} />
    </Modal>
  );
}
