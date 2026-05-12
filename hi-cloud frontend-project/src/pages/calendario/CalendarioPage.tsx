import { useState, useMemo } from 'react';
import {
  Card, Row, Col, Typography, Tag, Statistic, Badge,
  Button, Select, Space, Tooltip, List, Avatar,
} from 'antd';
import {
  CalendarOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, DollarOutlined, SafetyCertificateOutlined,
  TeamOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const calendApi = {
  eventos: (desde: string, hasta: string) =>
    api.get(`/calendario?desde=${desde}&hasta=${hasta}`).then(r => r.data?.data ?? r.data),
  alertas: () =>
    api.get('/calendario/alertas').then(r => r.data?.data ?? r.data),
};

const TIPO_ICONO: Record<string, any> = {
  cxc:      <DollarOutlined style={{ color: '#3b82f6' }} />,
  cxp:      <DollarOutlined style={{ color: '#8b5cf6' }} />,
  dgii:     <SafetyCertificateOutlined style={{ color: '#ef4444' }} />,
  tss:      <TeamOutlined style={{ color: '#f59e0b' }} />,
  nomina:   <TeamOutlined style={{ color: '#10b981' }} />,
  contrato: <FileTextOutlined style={{ color: '#06b6d4' }} />,
};

const ESTADO_TAG: Record<string, { color: string; label: string; icon: any }> = {
  vencido:    { color: 'red',     label: 'Vencido',   icon: <WarningOutlined /> },
  proximo:    { color: 'orange',  label: 'Próximo',   icon: <ClockCircleOutlined /> },
  pendiente:  { color: 'blue',    label: 'Pendiente', icon: <CalendarOutlined /> },
  completado: { color: 'green',   label: 'Completado',icon: <CheckCircleOutlined /> },
};

// Genera una grilla de días del mes para el calendario visual
function CalendarioGrid({ mes, anio, eventos }: { mes: number; anio: number; eventos: any[] }) {
  const primerDia = new Date(anio, mes - 1, 1).getDay();
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const hoy       = new Date();
  const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const eventosPorDia = useMemo(() => {
    const mapa: Record<number, any[]> = {};
    for (const ev of eventos) {
      const f = new Date(ev.fecha);
      if (f.getMonth() + 1 === mes && f.getFullYear() === anio) {
        const d = f.getDate();
        if (!mapa[d]) mapa[d] = [];
        mapa[d].push(ev);
      }
    }
    return mapa;
  }, [eventos, mes, anio]);

  const celdas = [];
  for (let i = 0; i < primerDia; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  const esHoy = (d: number) =>
    d === hoy.getDate() && mes === hoy.getMonth() + 1 && anio === hoy.getFullYear();

  return (
    <div>
      {/* Cabecera días de semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DIAS_SEMANA.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600,
            color: '#94a3b8', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* Días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} />;
          const evsDia  = eventosPorDia[dia] ?? [];
          const hayVenc = evsDia.some(e => e.estado === 'vencido');
          const hayProx = evsDia.some(e => e.estado === 'proximo');
          return (
            <Tooltip
              key={i}
              title={evsDia.length > 0 ? (
                <div>{evsDia.map((e, j) => (
                  <div key={j} style={{ fontSize: 11 }}>• {e.titulo}</div>
                ))}</div>
              ) : undefined}
            >
              <div style={{
                minHeight: 54,
                padding:   '4px 6px',
                borderRadius: 6,
                border:    `1px solid ${esHoy(dia) ? '#1677ff' : '#f1f5f9'}`,
                background: esHoy(dia) ? '#eff6ff' : hayVenc ? '#fef2f2' : hayProx ? '#fffbeb' : '#fafafa',
                cursor:    evsDia.length > 0 ? 'pointer' : 'default',
              }}>
                <div style={{
                  fontSize:   12, fontWeight: esHoy(dia) ? 700 : 400,
                  color:      esHoy(dia) ? '#1677ff' : '#374151',
                  marginBottom: 3,
                }}>{dia}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {evsDia.slice(0, 3).map((e, j) => (
                    <span key={j} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: e.color, display: 'inline-block',
                    }} />
                  ))}
                  {evsDia.length > 3 && <span style={{ fontSize: 9, color: '#94a3b8' }}>+{evsDia.length - 3}</span>}
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarioPage() {
  const [mes,  setMes]  = useState(dayjs().month() + 1);
  const [anio, setAnio] = useState(dayjs().year());
  const [tipoF, setTipoF] = useState<string | undefined>();

  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
  const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${new Date(anio, mes, 0).getDate()}`;

  const { data: eventos = [] } = useQuery({
    queryKey: ['cal-eventos', mes, anio],
    queryFn:  () => calendApi.eventos(desde, hasta),
  });
  const { data: alertas } = useQuery({
    queryKey: ['cal-alertas'],
    queryFn:  calendApi.alertas,
    refetchInterval: 300_000,
  });

  const eventosFiltrados = tipoF ? eventos.filter((e: any) => e.tipo === tipoF) : eventos;

  const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <CalendarOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Calendario de Obligaciones
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            DGII · TSS · CxC · CxP · Nómina · Contratos
          </Text>
        </Col>
        <Col>
          <Space>
            <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
          </Space>
        </Col>
      </Row>

      {/* KPIs de alertas */}
      {alertas && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={4}>
            <Card size="small" style={{ borderColor: '#ef4444' }}>
              <Statistic title="Vencidos" value={alertas.resumen.vencidos}
                valueStyle={{ color: '#ef4444' }} prefix={<WarningOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small" style={{ borderColor: '#f59e0b' }}>
              <Statistic title="Próximos (7 días)" value={alertas.resumen.proximos}
                valueStyle={{ color: '#f59e0b' }} prefix={<ClockCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card size="small">
              <Statistic title="Pendientes" value={alertas.resumen.pendientes}
                valueStyle={{ color: '#1677ff' }} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="CxC vencida" value={alertas.resumen.montoVencidoCxC}
                formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444', fontSize: 14 }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="CxP vencida" value={alertas.resumen.montoVencidoCxP}
                formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#8b5cf6', fontSize: 14 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]}>
        {/* Calendario visual */}
        <Col xs={24} lg={14}>
          <Card title={`${MESES.find(m => m.value === mes)?.label} ${anio}`}>
            <CalendarioGrid mes={mes} anio={anio} eventos={eventosFiltrados} />

            {/* Leyenda */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {[
                { color: '#ef4444', label: 'Vencido' },
                { color: '#f59e0b', label: 'Próximo' },
                { color: '#3b82f6', label: 'CxC' },
                { color: '#8b5cf6', label: 'CxP' },
                { color: '#ef4444', label: 'DGII' },
                { color: '#10b981', label: 'Nómina' },
                { color: '#06b6d4', label: 'Contrato' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                  <Text style={{ fontSize: 11 }}>{l.label}</Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Lista de eventos */}
        <Col xs={24} lg={10}>
          <Card
            title="Agenda del mes"
            extra={
              <Select placeholder="Filtrar" allowClear style={{ width: 140 }}
                value={tipoF} onChange={setTipoF}
                options={[
                  { value: 'cxc',      label: '💰 CxC' },
                  { value: 'cxp',      label: '💳 CxP' },
                  { value: 'dgii',     label: '🏛️ DGII' },
                  { value: 'tss',      label: '🏥 TSS' },
                  { value: 'nomina',   label: '👷 Nómina' },
                  { value: 'contrato', label: '📋 Contrato' },
                ]} />
            }
            style={{ height: '100%' }}
          >
            <div style={{ maxHeight: 450, overflowY: 'auto' }}>
              {eventosFiltrados.length === 0 ? (
                <Text type="secondary">Sin eventos en este período.</Text>
              ) : (
                <List
                  size="small"
                  dataSource={eventosFiltrados}
                  renderItem={(ev: any) => {
                    const estado = ESTADO_TAG[ev.estado] ?? { color: 'default', label: ev.estado, icon: null };
                    return (
                      <List.Item style={{ padding: '8px 0' }}>
                        <List.Item.Meta
                          avatar={
                            <Avatar size={32} icon={TIPO_ICONO[ev.tipo]}
                              style={{ background: `${ev.color}20`, border: `1px solid ${ev.color}40` }} />
                          }
                          title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, fontWeight: 500 }}>{ev.titulo}</Text>
                              <Tag icon={estado.icon} color={estado.color} style={{ fontSize: 10, margin: 0 }}>
                                {estado.label}
                              </Tag>
                            </div>
                          }
                          description={
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {dayjs(ev.fecha).format('DD/MM/YYYY')}
                                {ev.monto ? ` · ${fmt.money(ev.monto)}` : ''}
                              </Text>
                            </div>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
