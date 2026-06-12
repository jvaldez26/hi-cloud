import { Card, Button, Tag, Typography, Row, Col, Badge, message, Empty } from 'antd';
import { CheckCircleOutlined, PlayCircleOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';

const { Title, Text } = Typography;

function timerColor(mins: number) {
  if (mins > 20) return '#ff4d4f';
  if (mins > 10) return '#fa8c16';
  return '#52c41a';
}

function formatMins(mins: number) {
  const m = Math.floor(mins);
  const s = Math.round((mins - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Agrupar items por comanda
function agruparPorComanda(items: any[]) {
  const map = new Map<number, any>();
  for (const item of items) {
    const key = item.comandaId;
    if (!map.has(key)) {
      map.set(key, {
        comandaId: key,
        comandaNumero: item.comandaNumero,
        mesaNumero: item.mesaNumero,
        areaNombre: item.areaNombre,
        minEspera: item.minutosEspera,
        items: [],
      });
    }
    const grupo = map.get(key);
    grupo.minEspera = Math.max(grupo.minEspera ?? 0, item.minutosEspera ?? 0);
    grupo.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => (b.minEspera ?? 0) - (a.minEspera ?? 0));
}

export default function KDSPage() {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['restaurante-kds'],
    queryFn: restauranteApi.kdsItemsPendientes,
    refetchInterval: 10_000,
  });

  const iniciar = useMutation({
    mutationFn: (id: number) => restauranteApi.kdsIniciarItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-kds'] }),
    onError: () => message.error('Error'),
  });

  const marcarListo = useMutation({
    mutationFn: (id: number) => restauranteApi.kdsMarcarListo(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-kds'] }); message.success('✅ Marcado como listo'); },
    onError: () => message.error('Error'),
  });

  const grupos = agruparPorComanda(items as any[]);

  return (
    <div style={{ background: '#1a1a2e', minHeight: '100vh', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>🍳 Cocina — KDS</Title>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge status="processing" text={<Text style={{ color: '#aaa', fontSize: 12 }}>Auto-actualiza cada 10s</Text>} />
          <Button
            size="small"
            icon={<FullscreenOutlined />}
            onClick={() => document.documentElement.requestFullscreen?.()}
            style={{ color: '#aaa', borderColor: '#444', background: 'transparent' }}
          >
            Pantalla completa
          </Button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <Empty description={<Text style={{ color: '#666' }}>✅ No hay pedidos pendientes</Text>} />
        </div>
      ) : (
        <Row gutter={[12, 12]}>
          {grupos.map((grupo: any) => {
            const mins = Number(grupo.minEspera ?? 0);
            const urgente = mins > 20;
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={grupo.comandaId}>
                <Card
                  size="small"
                  style={{
                    background: '#16213e',
                    border: `2px solid ${timerColor(mins)}`,
                    borderRadius: 12,
                  }}
                  bodyStyle={{ padding: 12 }}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ color: '#fff', fontSize: 14 }}>
                        {grupo.comandaNumero} | Mesa {grupo.mesaNumero}
                      </Text>
                      {urgente && <Tag color="red">🔴 URGENTE</Tag>}
                    </div>
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20, color: timerColor(mins) }}>⏱</span>
                    <Text style={{ color: timerColor(mins), fontSize: 16, fontWeight: 700 }}>
                      {formatMins(mins)}
                    </Text>
                    {grupo.areaNombre && <Text style={{ color: '#888', fontSize: 11 }}>{grupo.areaNombre}</Text>}
                  </div>

                  <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginBottom: 8 }}>
                    {grupo.items.map((item: any) => (
                      <div key={item.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: '#ddd', fontSize: 13 }}>
                            {item.cantidad}x {item.itemNombre}
                          </Text>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {item.estadoCocina === 'pendiente' && (
                              <Button
                                size="small"
                                icon={<PlayCircleOutlined />}
                                style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
                                onClick={() => iniciar.mutate(item.id)}
                                loading={iniciar.isPending}
                              />
                            )}
                            <Button
                              size="small"
                              type="primary"
                              icon={<CheckCircleOutlined />}
                              style={{ background: '#52c41a', borderColor: '#52c41a' }}
                              onClick={() => marcarListo.mutate(item.id)}
                              loading={marcarListo.isPending}
                            />
                          </div>
                        </div>
                        {(item.modificaciones ?? []).map((m: any, i: number) => (
                          <Text key={i} style={{ color: '#888', fontSize: 11, display: 'block', paddingLeft: 8 }}>
                            → {m.nombre ?? m}
                          </Text>
                        ))}
                        {item.notasEspeciales && (
                          <Text style={{ color: '#f5a623', fontSize: 11, display: 'block', paddingLeft: 8 }}>
                            ⚠ {item.notasEspeciales}
                          </Text>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    block
                    type="primary"
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                    icon={<CheckCircleOutlined />}
                    onClick={() => grupo.items.forEach((it: any) => marcarListo.mutate(it.id))}
                    loading={marcarListo.isPending}
                  >
                    ✅ MARCAR TODO LISTO
                  </Button>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
