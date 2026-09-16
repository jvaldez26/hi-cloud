import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, Row, Col, Select, DatePicker, Button, Table, Typography,
  Space, Tag, theme, Statistic, InputNumber, Empty,
} from 'antd';
import {
  FileExcelOutlined, WalletOutlined, WarningOutlined, DollarOutlined,
  TrophyOutlined, FallOutlined, StarOutlined, CalendarOutlined,
  ClockCircleOutlined, RiseOutlined, AlertOutlined, BankOutlined,
  TeamOutlined, GiftOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const fmtMoneda = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

type FiltroKey = 'anioEscolarId' | 'gradoId' | 'seccionId' | 'periodoId' | 'rango' | 'umbral' | 'limite' | 'retencion';

const REPORTES: { id: string; label: string; icon: React.ReactNode; endpoint: string; filtros: FiltroKey[] }[] = [
  { id: 'cartera',       label: 'Cartera de colegiatura',        icon: <WalletOutlined />,       endpoint: 'cartera-colegiatura',       filtros: ['anioEscolarId'] },
  { id: 'morosidad',     label: 'Morosidad por grado',           icon: <WarningOutlined />,       endpoint: 'morosidad-por-grado',       filtros: ['anioEscolarId'] },
  { id: 'cobros',        label: 'Cobros del período',            icon: <DollarOutlined />,        endpoint: 'cobros-periodo',            filtros: ['rango'] },
  { id: 'rendimiento',   label: 'Rendimiento académico',         icon: <TrophyOutlined />,        endpoint: 'rendimiento-academico',     filtros: ['periodoId', 'gradoId', 'seccionId'] },
  { id: 'riesgo',        label: 'Estudiantes en riesgo',         icon: <FallOutlined />,          endpoint: 'estudiantes-riesgo',        filtros: ['periodoId', 'gradoId', 'seccionId', 'umbral'] },
  { id: 'honor',         label: 'Cuadro de honor',               icon: <StarOutlined />,          endpoint: 'cuadro-honor',              filtros: ['periodoId', 'gradoId', 'seccionId', 'limite'] },
  { id: 'asistencia',    label: 'Asistencia por grado',          icon: <CalendarOutlined />,      endpoint: 'asistencia-grado-periodo',  filtros: ['gradoId', 'seccionId', 'rango'] },
  { id: 'ausencias',     label: 'Exceso de ausencias',           icon: <ClockCircleOutlined />,   endpoint: 'exceso-ausencias',          filtros: ['gradoId', 'seccionId', 'rango', 'umbral'] },
  { id: 'matricula',     label: 'Matrícula y crecimiento',       icon: <RiseOutlined />,          endpoint: 'matricula-crecimiento',     filtros: ['gradoId'] },
  { id: 'disciplina',    label: 'Incidentes disciplinarios',     icon: <AlertOutlined />,         endpoint: 'incidentes-disciplinarios', filtros: ['rango'] },
  { id: 'ingresos',      label: 'Ingresos por concepto',         icon: <BankOutlined />,          endpoint: 'ingresos-por-concepto',     filtros: ['rango'] },
  { id: 'retencion',     label: 'Retención de estudiantes',      icon: <TeamOutlined />,          endpoint: 'retencion-estudiantes',     filtros: ['retencion'] },
  { id: 'becas',         label: 'Becas otorgadas',               icon: <GiftOutlined />,          endpoint: 'becas-otorgadas',           filtros: ['anioEscolarId'] },
  { id: 'docentes',      label: 'Productividad docente',         icon: <UserOutlined />,          endpoint: 'productividad-docente',     filtros: ['anioEscolarId'] },
];

export default function ReportesPage() {
  const { token } = theme.useToken();
  const [reporteId, setReporteId] = useState('cartera');
  const [anioEscolarId, setAnioEscolarId] = useState<number | undefined>();
  const [gradoId, setGradoId] = useState<number | undefined>();
  const [seccionId, setSeccionId] = useState<number | undefined>();
  const [periodoId, setPeriodoId] = useState<number | undefined>();
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [umbral, setUmbral] = useState<number | undefined>();
  const [limite, setLimite] = useState<number>(10);
  const [anioBaseId, setAnioBaseId] = useState<number | undefined>();
  const [anioSiguienteId, setAnioSiguienteId] = useState<number | undefined>();

  const { data: grados = [] } = useEdList('grados');
  const { data: secciones = [] } = useEdList('secciones');
  const { data: periodos = [] } = useEdList('periodos');
  const { data: anios = [] } = useEdList('anios-escolares');

  const reporte = REPORTES.find(r => r.id === reporteId)!;

  const params = useMemo(() => {
    const p: Record<string, any> = {};
    if (reporte.filtros.includes('anioEscolarId') && anioEscolarId) p.anioEscolarId = anioEscolarId;
    if (reporte.filtros.includes('gradoId') && gradoId) p.gradoId = gradoId;
    if (reporte.filtros.includes('seccionId') && seccionId) p.seccionId = seccionId;
    if (reporte.filtros.includes('periodoId') && periodoId) p.periodoId = periodoId;
    if (reporte.filtros.includes('rango') && rango) { p.desde = rango[0].format('YYYY-MM-DD'); p.hasta = rango[1].format('YYYY-MM-DD'); }
    if (reporte.filtros.includes('umbral') && umbral !== undefined) p.umbral = umbral;
    if (reporte.filtros.includes('limite')) p.limite = limite;
    if (reporte.filtros.includes('retencion')) {
      if (anioBaseId) p.anioBaseId = anioBaseId;
      if (anioSiguienteId) p.anioSiguienteId = anioSiguienteId;
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporte, anioEscolarId, gradoId, seccionId, periodoId, rango, umbral, limite, anioBaseId, anioSiguienteId]);

  const { data: raw, isLoading } = useQuery<any>({
    queryKey: ['educativo', 'reportes', reporte.endpoint, params],
    queryFn: () => api.get(`/educativo/reportes/${reporte.endpoint}`, { params }).then(r => r.data?.data ?? r.data),
  });

  // Reportes con forma anidada (KPIs + tabla) vs. arreglo plano.
  const { filas, kpis } = useMemo(() => {
    if (!raw) return { filas: [] as any[], kpis: null as any };
    if (reporteId === 'cartera') return { filas: raw.porEstudiante ?? [], kpis: raw.resumen };
    if (reporteId === 'retencion') return { filas: raw.noRetenidos ?? [], kpis: raw };
    if (reporteId === 'becas') return { filas: raw.listado ?? [], kpis: { montoTotalOtorgado: raw.montoTotalOtorgado } };
    return { filas: Array.isArray(raw) ? raw : [], kpis: null };
  }, [raw, reporteId]);

  const columns = useMemo((): any[] => {
    switch (reporteId) {
      case 'cartera': return [
        { title: 'Estudiante', dataIndex: 'estudiante' },
        { title: 'Cédula', dataIndex: 'cedula', render: (v: any) => v ?? '—' },
        { title: 'Pendiente', dataIndex: 'pendiente', align: 'right', render: (v: any) => fmtMoneda(Number(v)) },
        { title: 'Vencido', dataIndex: 'vencido', align: 'right', render: (v: any) => Number(v) > 0 ? <Text type="danger">{fmtMoneda(Number(v))}</Text> : fmtMoneda(0) },
      ];
      case 'morosidad': return [
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Estudiantes', dataIndex: 'totalEstudiantes', align: 'right' },
        { title: 'Morosos', dataIndex: 'estudiantesMorosos', align: 'right' },
        { title: 'Índice de morosidad', dataIndex: 'indiceMorosidad', align: 'right', render: (v: any) => <Tag color={v > 30 ? 'red' : v > 10 ? 'gold' : 'green'}>{v}%</Tag> },
        { title: 'Monto vencido', dataIndex: 'montoVencido', align: 'right', render: (v: any) => fmtMoneda(Number(v)) },
      ];
      case 'cobros': return [
        { title: 'Mes', dataIndex: 'mes' },
        { title: 'Proyectado', dataIndex: 'proyectado', align: 'right', render: (v: any) => fmtMoneda(Number(v)) },
        { title: 'Real', dataIndex: 'real', align: 'right', render: (v: any) => fmtMoneda(Number(v)) },
        { title: '% cobrado', key: 'pct', align: 'right', render: (_: any, r: any) => {
          const pct = Number(r.proyectado) > 0 ? Math.round((Number(r.real) / Number(r.proyectado)) * 1000) / 10 : null;
          return pct === null ? '—' : <Tag color={pct >= 90 ? 'green' : pct >= 60 ? 'gold' : 'red'}>{pct}%</Tag>;
        } },
      ];
      case 'rendimiento': return [
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Sección', dataIndex: 'seccion' },
        { title: 'Estudiantes', dataIndex: 'estudiantes', align: 'right' },
        { title: 'Promedio', dataIndex: 'promedio', align: 'right' },
        { title: '% aprobación', dataIndex: 'pctAprobacion', align: 'right', render: (v: any) => v == null ? '—' : <Tag color={v >= 80 ? 'green' : v >= 60 ? 'gold' : 'red'}>{v}%</Tag> },
      ];
      case 'riesgo': return [
        { title: 'Estudiante', dataIndex: 'estudiante' },
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Sección', dataIndex: 'seccion' },
        { title: 'Promedio', dataIndex: 'promedio', align: 'right', render: (v: any) => <Text type="danger">{v}</Text> },
        { title: 'Asignaturas reprobadas', dataIndex: 'asignaturasReprobadas', align: 'right' },
      ];
      case 'honor': return [
        { title: '#', key: 'pos', width: 50, render: (_: any, __: any, i: number) => i + 1 },
        { title: 'Estudiante', dataIndex: 'estudiante' },
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Sección', dataIndex: 'seccion' },
        { title: 'Promedio', dataIndex: 'promedio', align: 'right', render: (v: any) => <Text strong style={{ color: token.colorPrimary }}>{v}</Text> },
      ];
      case 'asistencia': return [
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Sección', dataIndex: 'seccion' },
        { title: 'Presentes', dataIndex: 'presentes', align: 'right' },
        { title: 'Ausentes', dataIndex: 'ausentes', align: 'right' },
        { title: 'Tardanzas', dataIndex: 'tardanzas', align: 'right' },
        { title: '% asistencia', dataIndex: 'pctAsistencia', align: 'right', render: (v: any) => v == null ? '—' : <Tag color={v >= 90 ? 'green' : v >= 75 ? 'gold' : 'red'}>{v}%</Tag> },
      ];
      case 'ausencias': return [
        { title: 'Estudiante', dataIndex: 'estudiante' },
        { title: 'Grado', dataIndex: 'grado' },
        { title: 'Sección', dataIndex: 'seccion' },
        { title: 'Ausencias', dataIndex: 'ausencias', align: 'right', render: (v: any) => <Text type="danger">{v}</Text> },
      ];
      case 'matricula': return [
        { title: 'Año escolar', dataIndex: 'anio' },
        { title: 'Matrícula', dataIndex: 'total', align: 'right' },
        { title: 'Crecimiento', dataIndex: 'crecimientoPct', align: 'right', render: (v: any) => v == null ? '—' : <Tag color={v >= 0 ? 'green' : 'red'}>{v > 0 ? '+' : ''}{v}%</Tag> },
      ];
      case 'disciplina': return [
        { title: 'Tipo', dataIndex: 'tipo' },
        { title: 'Cantidad', dataIndex: 'cantidad', align: 'right' },
      ];
      case 'ingresos': return [
        { title: 'Concepto', dataIndex: 'concepto', render: (v: any) => <Tag>{v}</Tag> },
        { title: 'Cantidad de pagos', dataIndex: 'cantidad', align: 'right' },
        { title: 'Total', dataIndex: 'total', align: 'right', render: (v: any) => <Text strong>{fmtMoneda(Number(v))}</Text> },
      ];
      case 'retencion': return [
        { title: 'Estudiante no retenido', dataIndex: 'estudiante' },
      ];
      case 'becas': return [
        { title: 'Estudiante', dataIndex: 'estudiante' },
        { title: 'Beca', dataIndex: 'beca' },
        { title: 'Tipo', dataIndex: 'tipo', render: (v: any) => v === 'porcentaje' ? 'Porcentaje' : 'Monto fijo' },
        { title: 'Valor', dataIndex: 'valor', align: 'right', render: (v: any, r: any) => r.tipo === 'porcentaje' ? `${v}%` : fmtMoneda(Number(v)) },
        { title: 'Asignada', dataIndex: 'fechaAsignacion', render: (v: any) => v?.substring(0, 10) },
        { title: 'Motivo', dataIndex: 'motivo', render: (v: any) => v ?? '—' },
      ];
      case 'docentes': return [
        { title: 'Docente', dataIndex: 'docente' },
        { title: 'Especialidad', dataIndex: 'especialidad', render: (v: any) => v ?? '—' },
        { title: 'Secciones', dataIndex: 'secciones', align: 'right' },
        { title: 'Asignaturas', dataIndex: 'asignaturas', align: 'right' },
        { title: 'Estudiantes', dataIndex: 'estudiantes', align: 'right' },
      ];
      default: return [];
    }
  }, [reporteId, token]);

  const onExportar = () => {
    if (!filas.length) return;
    const rows = filas.map((row: any) => Object.fromEntries(
      columns.map((c: any) => [
        typeof c.title === 'string' ? c.title : c.key,
        c.dataIndex ? row[c.dataIndex] : '',
      ]),
    ));
    exportarExcel(rows, `${reporte.label.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}`);
  };

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Reportes</Title>
          <Text type="secondary">14 reportes del módulo educativo — datos en vivo, exportables a Excel</Text>
        </div>
        <Button icon={<FileExcelOutlined />} style={{ color: '#217346', borderColor: '#217346' }} disabled={!filas.length} onClick={onExportar}>
          Excel
        </Button>
      </div>

      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {REPORTES.map(r => (
          <Col key={r.id}>
            <Tag
              onClick={() => setReporteId(r.id)}
              style={{
                cursor: 'pointer', padding: '6px 12px', fontSize: 13,
                fontWeight: reporteId === r.id ? 600 : 400,
                background: reporteId === r.id ? token.colorPrimary : token.colorFillAlter,
                color: reporteId === r.id ? '#fff' : token.colorText,
                border: `1px solid ${reporteId === r.id ? token.colorPrimary : token.colorBorderSecondary}`,
                borderRadius: 8,
              }}
            >
              {r.icon} {r.label}
            </Tag>
          </Col>
        ))}
      </Row>

      {reporte.filtros.length > 0 && (
        <Card size="small" style={{ marginBottom: 16, background: token.colorFillAlter }} bordered={false}>
          <Space wrap>
            {reporte.filtros.includes('anioEscolarId') && (
              <Select allowClear placeholder="Año escolar" style={{ width: 180 }} value={anioEscolarId}
                options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} onChange={setAnioEscolarId} />
            )}
            {reporte.filtros.includes('gradoId') && (
              <Select allowClear placeholder="Grado" style={{ width: 160 }} value={gradoId}
                options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))} onChange={setGradoId} />
            )}
            {reporte.filtros.includes('seccionId') && (
              <Select allowClear placeholder="Sección" style={{ width: 160 }} value={seccionId}
                options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))} onChange={setSeccionId} />
            )}
            {reporte.filtros.includes('periodoId') && (
              <Select allowClear placeholder="Período (todos si vacío)" style={{ width: 220 }} value={periodoId}
                options={periodos.map((p: any) => ({ value: p.id, label: p.nombre }))} onChange={setPeriodoId} />
            )}
            {reporte.filtros.includes('rango') && (
              <RangePicker value={rango as any} onChange={v => setRango(v as any)} format="DD/MM/YYYY" />
            )}
            {reporte.filtros.includes('umbral') && (
              <InputNumber
                addonBefore={reporteId === 'riesgo' ? 'Nota mínima' : 'Mín. ausencias'}
                value={umbral} onChange={v => setUmbral(v ?? undefined)}
                placeholder={reporteId === 'riesgo' ? 'de la escala' : '5'}
              />
            )}
            {reporte.filtros.includes('limite') && (
              <InputNumber addonBefore="Top" value={limite} min={1} onChange={v => setLimite(v ?? 10)} />
            )}
            {reporte.filtros.includes('retencion') && (
              <>
                <Select allowClear placeholder="Año base" style={{ width: 180 }} value={anioBaseId}
                  options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} onChange={setAnioBaseId} />
                <Select allowClear placeholder="Año siguiente (default: actual)" style={{ width: 220 }} value={anioSiguienteId}
                  options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))} onChange={setAnioSiguienteId} />
              </>
            )}
          </Space>
        </Card>
      )}

      {kpis && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {reporteId === 'cartera' && (
            <>
              <Col xs={12} md={6}><Card size="small" bordered={false}><Statistic title="Cobrado este mes" value={fmtMoneda(Number(kpis.cobradoMes))} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small" bordered={false}><Statistic title="Cobrado total" value={fmtMoneda(Number(kpis.cobrado))} valueStyle={{ fontSize: 18, color: token.colorPrimary }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small" bordered={false}><Statistic title="Pendiente" value={fmtMoneda(Number(kpis.pendiente))} valueStyle={{ fontSize: 18, color: '#faad14' }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small" bordered={false}><Statistic title="Vencido" value={fmtMoneda(Number(kpis.vencido))} valueStyle={{ fontSize: 18, color: '#ff4d4f' }} /></Card></Col>
            </>
          )}
          {reporteId === 'retencion' && (
            <>
              <Col xs={12} md={8}><Card size="small" bordered={false}><Statistic title="Matriculados año base" value={kpis.totalAnioBase} /></Card></Col>
              <Col xs={12} md={8}><Card size="small" bordered={false}><Statistic title="Retenidos" value={kpis.retenidos} valueStyle={{ color: '#52c41a' }} /></Card></Col>
              <Col xs={12} md={8}><Card size="small" bordered={false}><Statistic title="% retención" value={kpis.pctRetencion == null ? '—' : `${kpis.pctRetencion}%`} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
            </>
          )}
          {reporteId === 'becas' && (
            <Col xs={24} md={8}><Card size="small" bordered={false}><Statistic title="Monto total otorgado" value={fmtMoneda(Number(kpis.montoTotalOtorgado))} valueStyle={{ color: token.colorPrimary }} /></Card></Col>
          )}
        </Row>
      )}

      <Card bordered={false} style={{ borderRadius: 12 }} title={reporte.label}>
        {!isLoading && filas.length === 0
          ? <Empty description="Sin datos para estos filtros" />
          : (
            <Table
              dataSource={filas}
              columns={columns}
              loading={isLoading}
              rowKey={(_: any, i?: number) => String(i)}
              size="small"
              pagination={{ pageSize: 10, showTotal: (t: number) => `${t} filas` }}
              scroll={{ x: 'max-content' }}
            />
          )}
      </Card>
    </div>
  );
}
