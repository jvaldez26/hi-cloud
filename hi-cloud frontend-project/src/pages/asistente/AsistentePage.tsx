import { useState, useRef, useEffect } from 'react';
import {
  Card, Input, Button, Typography, Space, Spin, Tag, Divider, Alert,
  theme, Avatar, message,
} from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
// Renderizador simple de markdown (negritas, código, listas)
function SimpleMarkdown({ children }: { children: string }) {
  const lines = children.split('\n');
  return (
    <div style={{ fontSize: 13, lineHeight: 1.65 }}>
      {lines.map((line, i) => {
        // Encabezados
        if (/^#{1,3}\s/.test(line)) {
          const text = line.replace(/^#+\s/, '');
          return <div key={i} style={{ fontWeight: 700, marginTop: 8, marginBottom: 2 }}>{text}</div>;
        }
        // Lista
        if (/^[-*•]\s/.test(line)) {
          const text = line.replace(/^[-*•]\s/, '');
          return (
            <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>
              · <span dangerouslySetInnerHTML={{ __html: renderInline(text) }} />
            </div>
          );
        }
        // Línea vacía
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
        // Párrafo normal con inline formatting
        return (
          <div key={i} style={{ marginBottom: 2 }}>
            <span dangerouslySetInnerHTML={{ __html: renderInline(line) }} />
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,.08);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/RD\$\s*([\d,.]+)/g, '<strong>RD$ $1</strong>');
}
import api from '../../api/client';

const { Text, Title } = Typography;
const { useToken } = theme;

interface Mensaje {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const SUGERENCIAS = [
  '¿Cuál es mi utilidad bruta del mes?',
  '¿Cuánto me deben mis clientes en total?',
  '¿Qué facturas están vencidas?',
  '¿Cómo está mi flujo de caja?',
  'Analiza mi situación financiera actual',
  '¿Qué debo priorizar esta semana?',
];

export default function AsistentePage() {
  const { token } = useToken();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: statusData } = useQuery({
    queryKey: ['asistente-status'],
    queryFn: () => api.get('/asistente/status').then(r => r.data?.data ?? r.data),
    staleTime: Infinity,
  });
  const disponible: boolean = statusData?.disponible ?? false;

  const { mutate: pyl, isPending: pylLoading } = useMutation({
    mutationFn: () => api.get('/asistente/pyl').then(r => r.data?.data ?? r.data),
    onSuccess: (data) => {
      setMensajes(prev => [...prev, {
        role: 'assistant',
        content: data.analisis ?? 'No se pudo generar el análisis.',
        ts: Date.now(),
      }]);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.message ?? 'Error al procesar tu mensaje. Intenta de nuevo.'),
  });

  const { mutate: sendMsg, isPending: chatLoading } = useMutation({
    mutationFn: (mensaje: string) =>
      api.post('/asistente/chat', {
        historial: mensajes.slice(-10).map(m => ({ role: m.role, content: m.content })),
        mensaje,
      }).then(r => r.data?.data ?? r.data),
    onSuccess: (data, mensaje) => {
      setMensajes(prev => [
        ...prev,
        { role: 'user', content: mensaje, ts: Date.now() },
        { role: 'assistant', content: data.respuesta ?? '...', ts: Date.now() + 1 },
      ]);
      setInput('');
    },
    onError: () => message.error('Error al procesar tu mensaje. Intenta de nuevo.'),
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || chatLoading) return;
    sendMsg(msg);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 24px' }}>
      <Space style={{ marginBottom: 20 }} align="center">
        <Avatar
          size={40}
          style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', flexShrink: 0 }}
          icon={<RobotOutlined />}
        />
        <div>
          <Title level={4} style={{ margin: 0 }}>Asistente Financiero IA</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Powered by Claude AI · Datos actualizados en tiempo real
          </Text>
        </div>
        {disponible ? (
          <Tag color="green" style={{ marginLeft: 8 }}>Activo</Tag>
        ) : (
          <Tag color="red" style={{ marginLeft: 8 }}>Sin configurar</Tag>
        )}
      </Space>

      {!disponible && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Asistente no configurado"
          description={
            <span>
              Agrega tu <strong>ANTHROPIC_API_KEY</strong> en el archivo <code>.env</code> del servidor.
              Obtén tu clave en <strong>console.anthropic.com</strong>
            </span>
          }
        />
      )}

      {/* Acciones rápidas */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 10 }}
        bodyStyle={{ padding: 12 }}
      >
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>Acciones rápidas:</Text>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={pylLoading}
            disabled={!disponible}
            onClick={() => pyl()}
            type="primary"
            style={{ borderRadius: 6 }}
          >
            Análisis P&L completo
          </Button>
          {SUGERENCIAS.map((s) => (
            <Button
              key={s}
              size="small"
              style={{ borderRadius: 6, fontSize: 11 }}
              disabled={!disponible || chatLoading}
              onClick={() => { setInput(s); }}
            >
              {s}
            </Button>
          ))}
        </Space>
      </Card>

      {/* Historial de chat */}
      <Card
        style={{ borderRadius: 12, minHeight: 400, marginBottom: 12 }}
        bodyStyle={{ padding: 16, maxHeight: 500, overflowY: 'auto' }}
      >
        {mensajes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: token.colorTextSecondary }}>
            <RobotOutlined style={{ fontSize: 48, opacity: 0.3, display: 'block', marginBottom: 12 }} />
            <Text type="secondary">
              Hola! Soy tu asistente financiero. Pregúntame sobre tus ventas, cobros,
              pagos o cualquier duda financiera.
            </Text>
          </div>
        ) : (
          mensajes.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              marginBottom: 16,
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            }}>
              <Avatar
                size={28}
                icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                style={{
                  flexShrink: 0,
                  background: m.role === 'user' ? token.colorPrimary : 'linear-gradient(135deg,#667eea,#764ba2)',
                }}
              />
              <div style={{
                maxWidth: '80%',
                background: m.role === 'user' ? token.colorPrimaryBg : token.colorFillAlter,
                borderRadius: m.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                padding: '10px 14px',
                fontSize: 13,
                lineHeight: 1.6,
              }}>
                {m.role === 'assistant' ? (
                  <SimpleMarkdown>{m.content}</SimpleMarkdown>
                ) : (
                  <Text style={{ fontSize: 13 }}>{m.content}</Text>
                )}
              </div>
            </div>
          ))
        )}
        {(chatLoading || pylLoading) && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Avatar size={28} icon={<RobotOutlined />}
              style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', flexShrink: 0 }} />
            <div style={{
              background: token.colorFillAlter, borderRadius: '2px 12px 12px 12px',
              padding: '10px 14px',
            }}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>Analizando datos...</Text>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </Card>

      {/* Input */}
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder={disponible ? 'Pregunta algo sobre tus finanzas...' : 'Asistente no configurado'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={handleSend}
          disabled={!disponible || chatLoading}
          size="large"
          style={{ borderRadius: '8px 0 0 8px' }}
          maxLength={500}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={chatLoading}
          disabled={!disponible || !input.trim()}
          size="large"
          style={{ borderRadius: '0 8px 8px 0' }}
        >
          Enviar
        </Button>
      </Space.Compact>

      {mensajes.length > 0 && (
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => setMensajes([])}
            style={{ fontSize: 11 }}
          >
            Limpiar conversación
          </Button>
        </div>
      )}
    </div>
  );
}
