import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Select, Button, Table, DatePicker, Space, Tag, message,
  Typography, Radio, Avatar, Row, Col, Card, Statistic,
} from 'antd';
import { SaveOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title } = Typography;

const ESTADOS = [
  { value: 'presente',    label: 'P', color: '#52c41a', full: 'Presente' },
  { value: 'ausente',     label: 'A', color: '#ff4d4f', full: 'Ausente' },
  { value: 'tardanza',    label: 'T', color: '#faad14', full: 'Tardanza' },
  { value: 'justificado', label: 'J', color: '#1677ff', full: 'Justificado' },
];

function useEdList(path: string, params?: any, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled,
  });
}

export default function AsistenciaPage() {
  const qc = useQueryClient();
  const [gradoId, setGradoId] = useState<number | undefined>();
  const [seccionId, setSeccionId] = useState<number | undefined>();
  const [fecha, setFecha] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const { data: grados = [] } = useEdList('grados');
  const { data: secciones = [] } = useEdList('secciones', gradoId ? { gradoId } : undefined, !!gradoId);

  const canLoad = !!(seccionId && fecha);

  const { data: registros = [], isLoading } = useQuery<any[], Error, any[]>({
    queryKey: ['educativo', 'academico', 'asistencia', seccionId, fecha],
    queryFn: () =>
      api.get('/educativo/academico/asistencia', { params: { seccionId, fecha } })
        .then(r => (r.data?.data ?? r.data ?? []) as any[]),
    enabled: canLoad,
    staleTime: 10_000,
  });

  useEffect(() => { setOverrides({}); }, [seccionId, fecha]);

  const saveMut = useMutation({
    mutationFn: (items: any[]) =>
      api.post('/educativo/academico/asistencia/bulk', { seccionId, fecha, items }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'academico', 'asistencia', seccionId, fecha] });
      message.success('Asistencia guardada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const getEstado = (row: any): string =>
    overrides[row.id] ?? row.asistencia?.estado ?? 'presente';

  const handleSave = () => {
    const items = registros.map((r: any) => ({
      estudianteId: r.id,
      estado: getEstado(r),
    }));
    saveMut.mutate(items);
  };

  const marcarTodos = (estado: string) => {
    const map: Record<number, string> = {};
    registros.forEach((r: any) => { map[r.id] = estado; });
    setOverrides(map);
  };

  const counts = ESTADOS.reduce((acc, e) => {
    acc[e.value] = registros.filter((r: any) => getEstado(r) === e.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Registro de Asistencia</Title>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
          loading={saveMut.isPending} disabled={!canLoad || !registros.length}>
          Guardar asistencia
        </Button>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select style={{ width: 140 }} placeholder="Grado" allowClear
          options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))}
          onChange={v => { setGradoId(v); setSeccionId(undefined); }} />
        <Select style={{ width: 130 }} placeholder="Sección" allowClear
          options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
          value={seccionId}
          onChange={setSeccionId}
          disabled={!gradoId} />
        <DatePicker
          value={dayjs(fecha)}
          format="YYYY-MM-DD"
          onChange={d => { if (d) setFecha(d.format('YYYY-MM-DD')); }}
          allowClear={false}
        />
        {canLoad && registros.length > 0 && (
          <Space>
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => marcarTodos('presente')}>
              Todos presentes
            </Button>
            <Button size="small" danger onClick={() => marcarTodos('ausente')}>
              Todos ausentes
            </Button>
          </Space>
        )}
      </Space>

      {canLoad && registros.length > 0 && (
        <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
          {ESTADOS.map(e => (
            <Col key={e.value}>
              <Card size="small" styles={{ body: { padding: '6px 14px' } }}>
                <Statistic
                  title={e.full}
                  value={counts[e.value] ?? 0}
                  valueStyle={{ fontSize: 16, color: e.color }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {!canLoad ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          Selecciona sección y fecha para registrar asistencia
        </div>
      ) : (
        <Table
          dataSource={registros}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Estudiante',
              width: 250,
              render: (_: any, r: any) => (
                <Space>
                  <Avatar size="small" icon={<UserOutlined />} src={r.foto} />
                  <span style={{ fontWeight: 500 }}>{r.apellidos}, {r.nombres}</span>
                </Space>
              ),
            },
            {
              title: 'Estado',
              render: (_: any, r: any) => (
                <Radio.Group
                  value={getEstado(r)}
                  onChange={e => setOverrides(prev => ({ ...prev, [r.id]: e.target.value }))}
                  size="small"
                >
                  {ESTADOS.map(e => (
                    <Radio.Button key={e.value} value={e.value}>
                      <span style={{ color: getEstado(r) === e.value ? e.color : undefined, fontWeight: 600 }}>
                        {e.label}
                      </span>
                    </Radio.Button>
                  ))}
                </Radio.Group>
              ),
            },
            {
              title: 'Guardado',
              width: 100,
              render: (_: any, r: any) =>
                r.asistencia
                  ? <Tag color={ESTADOS.find(e => e.value === r.asistencia.estado)?.color}>{r.asistencia.estado}</Tag>
                  : <Tag color="default">Sin registro</Tag>,
            },
          ]}
        />
      )}
    </div>
  );
}
