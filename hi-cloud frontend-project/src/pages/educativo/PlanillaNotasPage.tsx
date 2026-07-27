import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Select, Button, Table, InputNumber, Space, Tag, message,
  Typography, Modal, Form, Input, DatePicker,
} from 'antd';
import { PlusOutlined, SaveOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const TIPO_EVAL = ['examen', 'tarea', 'proyecto', 'quiz', 'participacion', 'otro']
  .map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
    enabled: !params || Object.values(params).some(v => v !== undefined),
  });
}

// ── Modal nueva evaluación ───────────────────────────────────────────────────

function EvaluacionModal({ open, seccionId, asignaturaId, periodoId, onClose }: {
  open: boolean; seccionId?: number; asignaturaId?: number; periodoId?: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/academico/evaluaciones', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'academico', 'planilla'] });
      message.success('Evaluación creada');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Modal open={open} title="Nueva evaluación" onCancel={onClose}
      onOk={() => form.validateFields().then(vals => {
        if (vals.fecha) vals.fecha = vals.fecha.format('YYYY-MM-DD');
        mut.mutate({ ...vals, seccionId, asignaturaId, periodoId });
      })}
      confirmLoading={mut.isPending} destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}>
      <Form form={form} layout="vertical"
        initialValues={{ tipo: 'examen', valorMaximo: 100, porcentaje: 100 }}>
        <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="tipo" label="Tipo">
          <Select options={TIPO_EVAL} />
        </Form.Item>
        <Form.Item name="fecha" label="Fecha">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="valorMaximo" label="Valor máximo">
          <InputNumber min={1} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="porcentaje" label="Peso (%)">
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function PlanillaNotasPage() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<{ seccionId?: number; asignaturaId?: number; periodoId?: number }>({});
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [evalModal, setEvalModal] = useState(false);

  const { data: anios = [] } = useEdList('anios-escolares');
  const [anioId, setAnioId] = useState<number | undefined>();

  const { data: grados = [] } = useEdList('grados');
  const [gradoId, setGradoId] = useState<number | undefined>();

  const { data: secciones = [] } = useEdList('secciones', gradoId ? { gradoId } : undefined);
  const { data: asignaturas = [] } = useEdList('asignaturas');
  const { data: periodos = [] } = useEdList('periodos', anioId ? { anioEscolarId: anioId } : undefined);

  const canLoad = !!(sel.seccionId && sel.asignaturaId);

  const { data: planilla, isLoading } = useQuery<any>({
    queryKey: ['educativo', 'academico', 'planilla', sel],
    queryFn: () =>
      api.get('/educativo/academico/planilla', {
        params: { seccionId: sel.seccionId, asignaturaId: sel.asignaturaId, periodoId: sel.periodoId },
      }).then(r => r.data?.data ?? r.data),
    enabled: canLoad,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!planilla) return;
    const map: Record<string, number> = {};
    planilla.calificaciones?.forEach((c: any) => {
      map[`${c.evaluacionId}_${c.estudianteId}`] = c.nota;
    });
    setNotas(map);
  }, [planilla]);

  const saveMut = useMutation({
    mutationFn: (items: any[]) => api.post('/educativo/academico/calificaciones/bulk', { items }),
    onSuccess: (_, items) => {
      qc.invalidateQueries({ queryKey: ['educativo', 'academico', 'planilla'] });
      message.success(`${items.length} calificaciones guardadas`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const handleSave = () => {
    if (!planilla) return;
    const items: any[] = [];
    for (const [key, nota] of Object.entries(notas)) {
      const [evalId, estId] = key.split('_').map(Number);
      if (nota !== undefined && nota !== null && !isNaN(nota)) {
        items.push({ evaluacionId: evalId, estudianteId: estId, nota });
      }
    }
    if (!items.length) { message.info('Sin cambios'); return; }
    saveMut.mutate(items);
  };

  const setNota = useCallback((evalId: number, estId: number, val: number | null) => {
    setNotas(prev => {
      const key = `${evalId}_${estId}`;
      if (val === null || val === undefined) {
        const next = { ...prev }; delete next[key]; return next;
      }
      return { ...prev, [key]: val };
    });
  }, []);

  const evaluaciones: any[] = planilla?.evaluaciones ?? [];
  const estudiantes: any[] = planilla?.estudiantes ?? [];

  const columns: any[] = [
    {
      title: 'Estudiante',
      dataIndex: 'apellidos',
      fixed: 'left',
      width: 200,
      render: (_: any, r: any) => `${r.apellidos}, ${r.nombres}`,
    },
    ...evaluaciones.map((ev: any) => ({
      title: (
        <div style={{ textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.nombre}</div>
          <Text type="secondary" style={{ fontSize: 10 }}>{ev.tipo} · /{ev.valorMaximo}</Text>
        </div>
      ),
      key: `eval_${ev.id}`,
      width: 100,
      align: 'center' as const,
      render: (_: any, r: any) => (
        <InputNumber
          size="small"
          min={0}
          max={ev.valorMaximo}
          step={0.5}
          style={{ width: 70 }}
          value={notas[`${ev.id}_${r.id}`] ?? undefined}
          onChange={v => setNota(ev.id, r.id, v)}
        />
      ),
    })),
    {
      title: 'Promedio',
      key: 'promedio',
      fixed: 'right',
      width: 80,
      align: 'center' as const,
      render: (_: any, r: any) => {
        if (!evaluaciones.length) return '—';
        const vals = evaluaciones
          .map((ev: any) => notas[`${ev.id}_${r.id}`])
          .filter(v => v !== undefined && v !== null);
        if (!vals.length) return '—';
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const color = avg >= 70 ? '#52c41a' : avg >= 60 ? '#faad14' : '#ff4d4f';
        return <span style={{ fontWeight: 700, color }}>{avg.toFixed(1)}</span>;
      },
    },
  ];

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Planilla de Calificaciones</Title>
        <Space>
          {canLoad && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => setEvalModal(true)}>
              Nueva evaluación
            </Button>
          )}
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saveMut.isPending}
            disabled={!canLoad}>
            Guardar notas
          </Button>
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} placeholder="Año escolar" allowClear
          options={anios.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={v => { setAnioId(v); setSel(p => ({ ...p, periodoId: undefined })); }} />
        <Select style={{ width: 140 }} placeholder="Grado" allowClear
          options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))}
          onChange={v => { setGradoId(v); setSel(p => ({ ...p, seccionId: undefined })); }} />
        <Select style={{ width: 130 }} placeholder="Sección" allowClear
          options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))}
          onChange={v => setSel(p => ({ ...p, seccionId: v }))} />
        <Select style={{ width: 180 }} placeholder="Asignatura" allowClear showSearch
          filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
          options={asignaturas.map((a: any) => ({ value: a.id, label: a.nombre }))}
          onChange={v => setSel(p => ({ ...p, asignaturaId: v }))} />
        <Select style={{ width: 150 }} placeholder="Período" allowClear
          options={periodos.map((p: any) => ({ value: p.id, label: p.nombre }))}
          onChange={v => setSel(p => ({ ...p, periodoId: v }))} />
      </Space>

      {!canLoad ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          Selecciona sección y asignatura para ver la planilla
        </div>
      ) : (
        <Table
          dataSource={estudiantes}
          rowKey="id"
          loading={isLoading}
          columns={columns}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: evaluaciones.length ? 'Sin estudiantes matriculados' : 'Crea evaluaciones primero' }}
        />
      )}

      <EvaluacionModal
        open={evalModal}
        seccionId={sel.seccionId}
        asignaturaId={sel.asignaturaId}
        periodoId={sel.periodoId}
        onClose={() => setEvalModal(false)}
      />
    </div>
  );
}
