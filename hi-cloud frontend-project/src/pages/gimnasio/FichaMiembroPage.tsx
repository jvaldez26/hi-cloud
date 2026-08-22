import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Tag, Descriptions, Button, Table, Empty, Spin, Avatar, Badge, Divider } from 'antd';
import { ArrowLeftOutlined, UserOutlined, TrophyOutlined, ClockCircleOutlined, FireOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import dayjs from 'dayjs';
import { dRD } from '../../utils/fechaRD';

const ESTADO_COLOR: Record<string, string> = {
  activo: 'green', inactivo: 'default', suspendido: 'orange', vencido: 'red',
};

const OBJETIVO_LABEL: Record<string, string> = {
  perder_peso: 'Perder peso', ganar_masa: 'Ganar masa', tonificar: 'Tonificar',
  mantenimiento: 'Mantenimiento', rendimiento: 'Rendimiento',
};

export default function FichaMiembroPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const miembroId = Number(id);

  const { data: miembro, isLoading: loadM } = useQuery({
    queryKey: ['gimnasio-miembro', miembroId],
    queryFn:  () => gimnasioApi.getMiembro(miembroId),
    enabled:  !!miembroId,
  });

  const { data: membresiaActiva } = useQuery({
    queryKey: ['gimnasio-membresia-activa', miembroId],
    queryFn:  () => gimnasioApi.getMembresiaActiva(miembroId),
    enabled:  !!miembroId,
  });

  const { data: accesosData } = useQuery({
    queryKey: ['gimnasio-accesos-miembro', miembroId],
    queryFn:  () => gimnasioApi.getHistorialAccesos(miembroId),
    enabled:  !!miembroId,
  });
  const accesos: any[] = Array.isArray(accesosData) ? accesosData : [];

  const { data: rutina } = useQuery({
    queryKey: ['gimnasio-rutina-activa', miembroId],
    queryFn:  () => gimnasioApi.getRutinaActiva(miembroId),
    enabled:  !!miembroId,
  });

  const { data: progresoData } = useQuery({
    queryKey: ['gimnasio-progreso-miembro', miembroId],
    queryFn:  () => gimnasioApi.getProgresoMiembro(miembroId),
    enabled:  !!miembroId,
  });
  const progreso: any[] = Array.isArray(progresoData) ? progresoData : [];
  const ultimoProg = progreso[0];

  if (loadM) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>;
  }

  if (!miembro) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/gimnasio/miembros')} style={{ marginBottom: 16 }}>
          Volver
        </Button>
        <Empty description="Miembro no encontrado" />
      </div>
    );
  }

  const nombre = `${miembro.nombre ?? ''} ${miembro.apellidos ?? ''}`.trim();
  const inicial = nombre.charAt(0).toUpperCase();

  // Días restantes membresía
  let diasRestantes: number | null = null;
  let pctMembresia = 0;
  if (membresiaActiva) {
    const hoy = dayjs();
    const fin = dayjs(membresiaActiva.fechaFin);
    const ini = dayjs(membresiaActiva.fechaInicio);
    diasRestantes = fin.diff(hoy, 'day');
    const total = fin.diff(ini, 'day') || 1;
    const transcurridos = hoy.diff(ini, 'day');
    pctMembresia = Math.min(100, Math.round((transcurridos / total) * 100));
  }

  return (
    <div style={{ padding: 24 }}>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/gimnasio/miembros')} style={{ marginBottom: 16 }}>
        Volver a Miembros
      </Button>

      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Avatar size={80} style={{ background: '#3b82f6', fontSize: 32, flexShrink: 0 }}>{inicial}</Avatar>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{nombre}</span>
              <Tag color={ESTADO_COLOR[miembro.estado] ?? 'default'} style={{ fontSize: 12 }}>
                {miembro.estado}
              </Tag>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: '#64748b', fontSize: 13 }}>
              {miembro.numero    && <span>Nº {miembro.numero}</span>}
              {miembro.cedula    && <span>Cédula: {miembro.cedula}</span>}
              {miembro.telefono  && <span>Tel: {miembro.telefono}</span>}
              {miembro.email     && <span>{miembro.email}</span>}
            </div>
            {miembro.objetivo && (
              <div style={{ marginTop: 6 }}>
                <Tag icon={<FireOutlined />} color="volcano">
                  Objetivo: {OBJETIVO_LABEL[miembro.objetivo] ?? miembro.objetivo}
                </Tag>
                {miembro.nivelFitness && (
                  <Tag color="blue">{miembro.nivelFitness}</Tag>
                )}
              </div>
            )}
          </div>

          {/* Membresía activa */}
          {membresiaActiva ? (
            <Card size="small" style={{ minWidth: 220, background: '#f0fdf4', borderColor: '#86efac' }}>
              <div style={{ fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                <TrophyOutlined /> Membresía Activa
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{membresiaActiva.planNombre ?? membresiaActiva.plan?.nombre ?? 'Plan'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Vence: {dayjs(membresiaActiva.fechaFin).format('DD/MM/YYYY')}
              </div>
              {diasRestantes !== null && (
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  <Badge
                    color={diasRestantes > 7 ? '#10b981' : diasRestantes > 0 ? '#f59e0b' : '#ef4444'}
                    text={diasRestantes > 0 ? `${diasRestantes} días restantes` : 'Vencida'}
                  />
                </div>
              )}
            </Card>
          ) : (
            <Card size="small" style={{ minWidth: 200, background: '#fff7ed', borderColor: '#fed7aa' }}>
              <div style={{ fontWeight: 600, color: '#ea580c' }}>Sin membresía activa</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Ve a Membresías para crear una nueva
              </div>
            </Card>
          )}
        </div>
      </Card>

      <Row gutter={16}>
        {/* Datos personales */}
        <Col xs={24} lg={12}>
          <Card title={<><UserOutlined /> Datos Personales</>} size="small" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={1} bordered>
              {miembro.fechaNacimiento && (
                <Descriptions.Item label="Fecha Nacimiento">
                  {dayjs(miembro.fechaNacimiento).format('DD/MM/YYYY')}
                </Descriptions.Item>
              )}
              {miembro.sexo && (
                <Descriptions.Item label="Sexo">{miembro.sexo === 'M' ? 'Masculino' : 'Femenino'}</Descriptions.Item>
              )}
              {miembro.direccion && (
                <Descriptions.Item label="Dirección">{miembro.direccion}</Descriptions.Item>
              )}
              {miembro.contactoEmergencia && (
                <Descriptions.Item label="Contacto Emergencia">
                  {miembro.contactoEmergencia} {miembro.telefonoEmergencia ? `· ${miembro.telefonoEmergencia}` : ''}
                </Descriptions.Item>
              )}
              {miembro.condicionesMedicas && (
                <Descriptions.Item label="Condiciones Médicas">{miembro.condicionesMedicas}</Descriptions.Item>
              )}
              {miembro.lesiones && (
                <Descriptions.Item label="Lesiones">{miembro.lesiones}</Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Medidas iniciales */}
          {(miembro.pesoInicial || miembro.tallaInicial) && (
            <Card title="Medidas Iniciales" size="small" style={{ marginBottom: 16 }}>
              <Row gutter={12}>
                {miembro.pesoInicial  && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700 }}>{miembro.pesoInicial} kg</div><div style={{ fontSize: 11, color: '#888' }}>Peso</div></div></Col>}
                {miembro.tallaInicial && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700 }}>{miembro.tallaInicial} cm</div><div style={{ fontSize: 11, color: '#888' }}>Talla</div></div></Col>}
                {miembro.imcInicial   && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 700 }}>{miembro.imcInicial}</div><div style={{ fontSize: 11, color: '#888' }}>IMC</div></div></Col>}
              </Row>
            </Card>
          )}

          {/* Última medición */}
          {ultimoProg && (
            <Card title="Última Medición" size="small" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                {dayjs(ultimoProg.fecha).format('DD/MM/YYYY')}
              </div>
              <Row gutter={12}>
                {ultimoProg.peso  && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 700 }}>{ultimoProg.peso} kg</div><div style={{ fontSize: 11, color: '#888' }}>Peso</div></div></Col>}
                {ultimoProg.talla && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 700 }}>{ultimoProg.talla} cm</div><div style={{ fontSize: 11, color: '#888' }}>Talla</div></div></Col>}
                {ultimoProg.imc   && <Col span={8}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 700 }}>{ultimoProg.imc}</div><div style={{ fontSize: 11, color: '#888' }}>IMC</div></div></Col>}
              </Row>
            </Card>
          )}
        </Col>

        <Col xs={24} lg={12}>
          {/* Rutina activa */}
          <Card
            title={<><FireOutlined /> Rutina Activa</>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            {rutina ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{rutina.nombre}</div>
                {rutina.objetivo && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{rutina.objetivo}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rutina.nivel && <Tag>{rutina.nivel}</Tag>}
                  {rutina.duracionSemanas && <Tag color="blue">{rutina.duracionSemanas} semanas</Tag>}
                  {rutina.diasSemana && <Tag color="green">{rutina.diasSemana} días/semana</Tag>}
                </div>
                {rutina.dias?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Divider orientation="left" orientationMargin={0} style={{ fontSize: 12 }}>Días de entrenamiento</Divider>
                    {rutina.dias.map((d: any) => (
                      <div key={d.id} style={{ marginBottom: 4 }}>
                        <Tag style={{ fontSize: 11 }}>Día {d.numeroDia}</Tag>
                        <span style={{ fontSize: 12 }}>{d.nombre ?? d.grupoMuscular ?? ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Empty description="Sin rutina activa asignada" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          {/* Accesos recientes */}
          <Card title={<><ClockCircleOutlined /> Últimos Accesos</>} size="small">
            {accesos.length === 0 ? (
              <Empty description="Sin accesos registrados" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                dataSource={accesos.slice(0, 10)}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: 'Fecha / Hora',
                    dataIndex: 'fechaHora',
                    render: (v: string) => dRD(v).format('DD/MM/YY HH:mm'),
                  },
                  {
                    title: 'Tipo',
                    dataIndex: 'tipo',
                    width: 90,
                    render: (v: string) => (
                      <Tag color={v === 'entrada' ? 'green' : 'blue'}>{v}</Tag>
                    ),
                  },
                  {
                    title: '',
                    dataIndex: 'autorizado',
                    width: 70,
                    render: (v: boolean) => v
                      ? <Badge status="success" text="OK" />
                      : <Badge status="error" text="Negado" />,
                  },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
