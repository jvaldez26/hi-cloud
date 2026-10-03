import { useParams } from 'react-router-dom';
import { Typography, Card, Steps, Tag, Spin, Result, Avatar } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { carWashPublicoApi } from '../../api/car-wash.api';
import { LABEL_ESTADO_CW, COLOR_ESTADO_CW, type EstadoTurnoCw } from './tipos';

const { Title, Text } = Typography;

export default function CarWashSeguimientoPublicoPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cw-publico', token],
    queryFn: () => carWashPublicoApi.getPorToken(token!),
    enabled: !!token,
    refetchInterval: 10_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Result status="404" title="Enlace no disponible" subTitle="Este enlace de seguimiento no existe o ya caducó." />
      </div>
    );
  }

  const estadoActual: EstadoTurnoCw = data.estado;

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {data.negocio?.logo && <Avatar src={data.negocio.logo} size={48} />}
        <div>
          <Title level={4} style={{ margin: 0 }}>{data.negocio?.nombre ?? 'Car Wash'}</Title>
          <Text type="secondary">Turno {data.codigo}</Text>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Tag color={COLOR_ESTADO_CW[estadoActual]} style={{ fontSize: 14, padding: '4px 10px' }}>
          {LABEL_ESTADO_CW[estadoActual]}
        </Tag>
        <Text style={{ display: 'block', marginTop: 8 }}>Vehículo {data.placaEnmascarada}</Text>

        <Steps
          direction="vertical"
          size="small"
          style={{ marginTop: 20 }}
          current={data.lineaTiempo.findIndex((p: any) => p.estado === estadoActual)}
          items={data.lineaTiempo.map((p: any) => ({
            title: LABEL_ESTADO_CW[p.estado as EstadoTurnoCw],
            description: p.en ? new Date(p.en).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : undefined,
          }))}
        />
      </Card>

      {estadoActual === 'en_espera' && (
        <Card>
          <Text strong>Hay {data.vehiculosDelante} vehículo{data.vehiculosDelante === 1 ? '' : 's'} delante</Text>
          <br />
          <Text type="secondary">Tiempo estimado: ~{data.minutosEstimados} min</Text>
        </Card>
      )}

      {data.servicios?.length > 0 && (
        <Card style={{ marginTop: 16 }} title="Servicios">
          {data.servicios.map((s: string, i: number) => <Tag key={i}>{s}</Tag>)}
        </Card>
      )}
    </div>
  );
}
