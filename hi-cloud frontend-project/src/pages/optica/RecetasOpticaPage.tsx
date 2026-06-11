import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Divider, Tooltip, DatePicker,
} from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, FilePdfOutlined, SearchOutlined, ToolOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';

const { Title } = Typography;

export default function RecetasOpticaPage() {
  const { token } = theme.useToken();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);
  const [search, setSearch]   = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: recetasData, isLoading } = useQuery({
    queryKey: ['optica-recetas'],
    queryFn: () => opticaApi.recetas({ limit: 200 }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });
  const { data: medicosData } = useQuery({
    queryKey: ['optica-medicos'],
    queryFn: () => opticaApi.medicos(),
  });

  const recetas   = (recetasData?.data ?? recetasData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];
  const medicos   = (medicosData as any[]) ?? [];

  const rows = recetas.filter((r: any) =>
    `${r.pacienteNombre ?? ''} ${r.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));
  const medicoOpts   = medicos.map((m: any) => ({ value: m.id, label: `Dr(a). ${m.nombre} ${m.apellido}` }));

  // Prefill desde URL params (quick-link desde consulta)
  useEffect(() => {
    const pacienteId  = searchParams.get('pacienteId');
    const consultaId  = searchParams.get('consultaId');
    if (pacienteId) {
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        pacienteId:  Number(pacienteId),
        vigenciaAnos: 1,
        tipo: 'lentes_oftalmicos',
        fecha: dayjs(),
        ...(consultaId ? { consultaId: Number(consultaId) } : {}),
      });
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ vigenciaAnos: 1, tipo: 'lentes_oftalmicos', fecha: dayjs() }); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : dayjs() }); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        fecha: v.fecha ? dayjs(v.fecha).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      };
      return editing ? opticaApi.actualizarReceta(editing.id, payload) : opticaApi.crearReceta(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-recetas'] });
      message.success(editing ? 'Receta actualizada' : 'Receta creada');
      closeModal();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar receta');
    },
  });

  const downloadPdf = async (id: number) => {
    setPdfLoading(id);
    try {
      const blob = await opticaApi.pdfReceta(id);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `receta-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Error al generar PDF');
    } finally {
      setPdfLoading(null);
    }
  };

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    { title: 'Médico',   key: 'med', ellipsis: true, render: (_: any, r: any) => r.medicoNombre ? `Dr(a). ${r.medicoNombre}` : '—' },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    {
      title: 'Tipo', dataIndex: 'tipo', width: 140,
      render: (v: string) => v === 'lentes_contacto' ? 'Lentes de contacto' : 'Lentes oftálmicos',
    },
    {
      title: 'OD', key: 'od', width: 160,
      render: (_: any, r: any) =>
        r.esferaOD != null ? `${Number(r.esferaOD) >= 0 ? '+' : ''}${Number(r.esferaOD).toFixed(2)}` : '—',
    },
    {
      title: 'OI', key: 'oi', width: 160,
      render: (_: any, r: any) =>
        r.esferaOI != null ? `${Number(r.esferaOI) >= 0 ? '+' : ''}${Number(r.esferaOI).toFixed(2)}` : '—',
    },
    {
      title: 'PDF', key: 'pdf', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Button
          size="small"
          icon={<FilePdfOutlined />}
          loading={pdfLoading === r.id}
          onClick={() => downloadPdf(r.id)}
          type="link"
        />
      ),
    },
    {
      title: '', key: 'ot', width: 50, align: 'center' as const,
      render: (_: any, r: any) => (
        <Tooltip title="Crear orden de trabajo desde esta receta">
          <Button
            size="small" type="link" icon={<ToolOutlined />}
            onClick={() => nav(`/optica/ordenes?pacienteId=${r.pacienteId}&recetaId=${r.id}`)}
          />
        </Tooltip>
      ),
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions onView={() => openEdit(r)} viewLabel="Editar" items={[]} />
      ),
    },
  ];

  const gradRow = (prefix: string, label: string) => (
    <>
      <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>{label}</Divider>
      <Row gutter={12}>
        {[['Esfera', 'esfera'], ['Cilindro', 'cilindro'], ['Eje', 'eje'], ['Adición', 'adicion']].map(([lbl, fld]) => (
          <Col xs={12} sm={6} key={fld}>
            <Form.Item name={`${fld}${prefix}`} label={lbl}>
              <InputNumber
                style={{ width: '100%' }}
                step={fld === 'eje' ? 1 : 0.25}
                precision={fld === 'eje' ? 0 : 2}
                min={fld === 'eje' ? 0 : undefined}
                max={fld === 'eje' ? 180 : undefined}
              />
            </Form.Item>
          </Col>
        ))}
      </Row>
    </>
  );

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Recetas Ópticas</Title>
      <Card>
        <Row justify="space-between" style={{ marginBottom: 12 }}>
          <Col>
            <Input
              placeholder="Buscar por paciente o N°..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 260 }}
            />
          </Col>
          <Col>
            <Space>
              <RefreshByKeyButton queryKey={['optica-recetas']} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva receta
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={cols}
          dataSource={rows}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Editar Receta' : 'Nueva Receta Óptica'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={pacienteOpts} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="medicoId" label="Médico">
                <Select showSearch optionFilterProp="label" options={medicoOpts} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tipo" label="Tipo de lentes" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'lentes_oftalmicos', label: 'Lentes oftálmicos' },
                  { value: 'lentes_contacto',   label: 'Lentes de contacto' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="vigenciaAnos" label="Vigencia (años)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={5} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: 'Selecciona la fecha' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="consultaId" hidden><InputNumber /></Form.Item>

          {gradRow('OD', 'Ojo Derecho (OD)')}
          {gradRow('OI', 'Ojo Izquierdo (OI)')}

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13 }}>DIP</Divider>
          <Row gutter={12}>
            <Col xs={12} sm={6}>
              <Form.Item name="dipLejos" label="DIP Lejos (mm)">
                <InputNumber style={{ width: '100%' }} min={40} max={80} step={0.5} precision={1} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="dipCerca" label="DIP Cerca (mm)">
                <InputNumber style={{ width: '100%' }} min={40} max={80} step={0.5} precision={1} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="marcaContacto" label="Marca lente contacto">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tipoContacto" label="Tipo lente contacto">
                <Input placeholder="Diario, mensual, bimensual..." />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="instrucciones" label="Instrucciones">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear receta'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
