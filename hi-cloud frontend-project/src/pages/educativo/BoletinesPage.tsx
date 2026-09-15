import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Select, Button, Table, Space, Tag, message, Typography, Row, Col,
  Card, Statistic, Alert, Modal,
} from 'antd';
import { ThunderboltOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { descargarPDFDesdeURL } from '../../utils/printUtils';

const { Title, Text } = Typography;

function useEdList(path: string, params?: any, enabled = true) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled,
  });
}

export default function BoletinesPage() {
  const qc = useQueryClient();
  const [anioId, setAnioId] = useState<number | undefined>();
  const [periodoId, setPeriodoId] = useState<number | undefined>();
  const [gradoId, setGradoId] = useState<number | undefined>();
  const [seccionId, setSeccionId] = useState<number | undefined>();

  const { data: anios = [] } = useEdList('anios-escolares');
  const { data: periodos = [] } = useEdList('periodos', anioId ? { anioEscolarId: anioId } : undefined, !!anioId);
  const { data: grados = [] } = useEdList('grados');
  const { data: secciones = [] } = useEdList('secciones', gradoId ? { gradoId } : undefined, !!gradoId);

  const listo = !!(seccionId && periodoId);

  const { data: resumen, isLoading: cargandoResumen } = useQuery<any>({
    queryKey: ['educativo', 'notas-periodo', 'resumen', seccionId, periodoId],
    queryFn: () => api.get('/educativo/notas-periodo/resumen', { params: { seccionId, periodoId } }).then(r => r.data?.data ?? r.data),
    enabled: listo,
    staleTime: 10_000,
  });

  const consolidarMut = useMutation({
    mutationFn: () => api.post('/educativo/notas-periodo/calcular', { seccionId, periodoId }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      message.success(`Notas consolidadas: ${d?.completos ?? 0} completas, ${d?.incompletos ?? 0} incompletas (${d?.estudiantes ?? 0} estudiantes × ${d?.asignaturas ?? 0} asignaturas)`);
      qc.invalidateQueries({ queryKey: ['educativo', 'notas-periodo', 'resumen', seccionId, periodoId] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al consolidar'),
  });

  const [descargando, setDescargando] = useState<number | 'seccion' | null>(null);

  const descargarIndividual = async (estudianteId: number, nombre: string) => {
    setDescargando(estudianteId);
    try {
      await descargarPDFDesdeURL(
        `/api/v1/educativo/estudiantes/${estudianteId}/boletin-pdf?periodoId=${periodoId}`,
        `boletin-${nombre}`,
      );
    } catch (e: any) {
      message.error(e?.message ?? 'Error al descargar el boletín');
    } finally {
      setDescargando(null);
    }
  };

  const descargarSeccion = async () => {
    setDescargando('seccion');
    try {
      await descargarPDFDesdeURL(
        `/api/v1/educativo/secciones/${seccionId}/boletines-pdf?periodoId=${periodoId}`,
        `boletines-seccion-${seccionId}`,
      );
    } catch (e: any) {
      message.error(e?.message ?? 'Error al descargar los boletines');
    } finally {
      setDescargando(null);
    }
  };

  const confirmarDescargaSeccion = () => {
    if (resumen?.incompletos > 0) {
      Modal.confirm({
        title: '¿Descargar de todas formas?',
        content: `${resumen.incompletos} de ${resumen.estudiantes?.length ?? 0} estudiantes tienen asignaturas sin calificar — sus boletines saldrán con esas notas vacías.`,
        okText: 'Descargar de todas formas',
        cancelText: 'Cancelar',
        onOk: descargarSeccion,
      });
    } else {
      descargarSeccion();
    }
  };

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ margin: 0, marginBottom: 4 }}>Boletines</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        El boletín se genera con las notas ya consolidadas de ed_notas_periodo — consolida el período antes de imprimir si acabas de registrar calificaciones nuevas.
      </Text>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} placeholder="Año escolar" allowClear
          options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={v => { setAnioId(v); setPeriodoId(undefined); }} />
        <Select style={{ width: 160 }} placeholder="Período" allowClear disabled={!anioId}
          options={periodos.map((p: any) => ({ value: p.id, label: `${p.nombre}${p.estado === 'cerrado' ? ' 🔒' : ''}` }))}
          onChange={setPeriodoId} />
        <Select style={{ width: 160 }} placeholder="Grado" allowClear
          options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))}
          onChange={v => { setGradoId(v); setSeccionId(undefined); }} />
        <Select style={{ width: 130 }} placeholder="Sección" allowClear disabled={!gradoId}
          options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
          onChange={setSeccionId} />
      </Space>

      {!listo ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          Selecciona año, período, grado y sección para continuar
        </div>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={consolidarMut.isPending} onClick={() => consolidarMut.mutate()}>
              Consolidar notas del período
            </Button>
            <Button icon={<FilePdfOutlined />} loading={descargando === 'seccion'} onClick={confirmarDescargaSeccion}>
              Descargar boletines de la sección
            </Button>
          </Space>

          {resumen && (
            <>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col>
                  <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
                    <Statistic title="Notas completas" value={resumen.completos} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
                  </Card>
                </Col>
                <Col>
                  <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
                    <Statistic title="Con asignaturas sin calificar" value={resumen.incompletos} valueStyle={{ fontSize: 18, color: resumen.incompletos > 0 ? '#faad14' : undefined }} />
                  </Card>
                </Col>
                <Col>
                  <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
                    <Statistic title="Asignaturas en el pensum" value={resumen.totalAsignaturas} valueStyle={{ fontSize: 18 }} />
                  </Card>
                </Col>
              </Row>

              {resumen.totalAsignaturas === 0 && (
                <Alert
                  type="warning" showIcon style={{ marginBottom: 16 }}
                  message="Este grado no tiene pensum configurado"
                  description="Los boletines saldrán sin asignaturas. Configúralo en Estructura Académica → Pensum."
                />
              )}
              {resumen.incompletos > 0 && resumen.totalAsignaturas > 0 && (
                <Alert
                  type="warning" showIcon style={{ marginBottom: 16 }}
                  message={`${resumen.incompletos} estudiante(s) tienen asignaturas sin calificar en este período`}
                  description="Consolida las notas después de completar todas las calificaciones, o revisa quién falta en la tabla de abajo."
                />
              )}

              <Table
                dataSource={resumen.estudiantes}
                rowKey="estudianteId"
                loading={cargandoResumen}
                size="small"
                scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Estudiante', dataIndex: 'nombre' },
                  { title: 'Cédula', dataIndex: 'cedula', render: (v: any) => v ?? '—' },
                  {
                    title: 'Notas',
                    render: (_: any, r: any) => `${r.conNota} / ${r.totalAsignaturas}`,
                  },
                  {
                    title: 'Estado',
                    render: (_: any, r: any) => r.completo
                      ? <Tag color="green">Completo</Tag>
                      : <Tag color="orange">Sin calificar</Tag>,
                  },
                  {
                    title: '',
                    render: (_: any, r: any) => (
                      <Button size="small" icon={<DownloadOutlined />} loading={descargando === r.estudianteId}
                        onClick={() => descargarIndividual(r.estudianteId, r.nombre)}>
                        Boletín
                      </Button>
                    ),
                  },
                ]}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
