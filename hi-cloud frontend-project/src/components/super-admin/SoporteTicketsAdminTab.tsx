import { useState } from 'react';
import {
  Table, Tag, Button, Modal, Select, Input, Space, Typography,
  Col, Row, DatePicker, Descriptions, Form, message,
} from 'antd';
import { Eye, Send, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  soporteApi, ASUNTO_SOPORTE_OPTIONS,
  type SoporteTicket, type EstadoTicketSoporte, type PrioridadTicketSoporte,
} from '../../api/soporte.api';
import { AdvancedFilters } from '../ui/AdvancedFilters';
import { dRD } from '../../utils/fechaRD';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const ESTADO_TAG: Record<EstadoTicketSoporte, { color: string; label: string }> = {
  abierto:    { color: 'blue',    label: 'Abierto' },
  en_proceso: { color: 'gold',    label: 'En proceso' },
  resuelto:   { color: 'green',   label: 'Resuelto' },
  cerrado:    { color: 'default', label: 'Cerrado' },
};

const PRIORIDAD_TAG: Record<PrioridadTicketSoporte, { color: string; label: string }> = {
  baja:  { color: 'default', label: 'Baja' },
  media: { color: 'orange',  label: 'Media' },
  alta:  { color: 'red',     label: 'Alta' },
};

const asuntoLabel = (a: string) => ASUNTO_SOPORTE_OPTIONS.find(o => o.value === a)?.label ?? a;

// ─── Detalle + respuesta ───────────────────────────────────────────────────

function DetalleTicketModal({ ticket, onClose }: { ticket: SoporteTicket; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const ctx = ticket.contextoAutomatico ?? {};

  const responderMut = useMutation({
    mutationFn: (respuestaAdmin: string) => soporteApi.responder(ticket.id, respuestaAdmin),
    onSuccess: () => {
      message.success('Respuesta enviada — el ticket pasó a Resuelto.');
      qc.invalidateQueries({ queryKey: ['soporte-tickets-admin'] });
      onClose();
    },
    onError: () => message.error('No se pudo enviar la respuesta'),
  });

  const cambiarEstadoMut = useMutation({
    mutationFn: (estado: EstadoTicketSoporte) => soporteApi.cambiarEstado(ticket.id, estado),
    onSuccess: () => {
      message.success('Estado actualizado');
      qc.invalidateQueries({ queryKey: ['soporte-tickets-admin'] });
    },
  });

  const cambiarPrioridadMut = useMutation({
    mutationFn: (prioridad: PrioridadTicketSoporte) => soporteApi.cambiarPrioridad(ticket.id, prioridad),
    onSuccess: () => {
      message.success('Prioridad asignada');
      qc.invalidateQueries({ queryKey: ['soporte-tickets-admin'] });
    },
  });

  return (
    <Modal open onCancel={onClose} footer={null} width={640}
      title={`Ticket #${ticket.id} — ${asuntoLabel(ticket.asunto)}`}>
      <Space style={{ marginBottom: 16 }}>
        <Tag color={ESTADO_TAG[ticket.estado].color}>{ESTADO_TAG[ticket.estado].label}</Tag>
        <Select
          size="small" placeholder="Prioridad" style={{ width: 110 }}
          value={ticket.prioridad ?? undefined}
          onChange={v => cambiarPrioridadMut.mutate(v)}
          options={[
            { value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' },
          ]}
        />
        <Select
          size="small" style={{ width: 130 }}
          value={ticket.estado}
          onChange={v => cambiarEstadoMut.mutate(v)}
          options={[
            { value: 'abierto', label: 'Abierto' }, { value: 'en_proceso', label: 'En proceso' },
            { value: 'resuelto', label: 'Resuelto' }, { value: 'cerrado', label: 'Cerrado' },
          ]}
        />
      </Space>

      <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Usuario">{String(ctx.usuarioNombre ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Correo">{String(ctx.usuarioEmail ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Empresa">#{ticket.empresaId ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Rol">{String(ctx.rol ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Módulo">{String(ctx.modulo ?? ctx.url ?? '—')}</Descriptions.Item>
        <Descriptions.Item label="Fecha">{dRD(ticket.createdAt).format('DD/MM/YYYY HH:mm')}</Descriptions.Item>
        <Descriptions.Item label="Navegador" span={2}>
          <Text style={{ fontSize: 11 }} type="secondary">{String(ctx.navegador ?? '—')}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Build" span={2}>
          <Text code style={{ fontSize: 11 }}>{String(ctx.buildId ?? '—')}</Text>
        </Descriptions.Item>
      </Descriptions>

      <Text type="secondary" style={{ fontSize: 12 }}>Mensaje</Text>
      <Paragraph style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap' }}>
        {ticket.mensaje}
      </Paragraph>

      {ticket.respuestaAdmin && (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>Respuesta ya enviada</Text>
          <Paragraph style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap' }}>
            {ticket.respuestaAdmin}
          </Paragraph>
        </>
      )}

      <Form form={form} layout="vertical" onFinish={v => responderMut.mutate(v.respuestaAdmin)}>
        <Form.Item name="respuestaAdmin" label={ticket.respuestaAdmin ? 'Nueva respuesta' : 'Responder'}
          rules={[{ required: true, min: 2, message: 'Escribe una respuesta' }]}>
          <TextArea rows={4} placeholder="Escribe la respuesta para el usuario..." maxLength={2000} showCount />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<Send size={14} />} loading={responderMut.isPending}>
          Enviar respuesta y marcar como Resuelto
        </Button>
      </Form>
    </Modal>
  );
}

// ─── Listado ────────────────────────────────────────────────────────────────

export function SoporteTicketsAdminTab() {
  const [pagina, setPagina]     = useState(1);
  const [busq, setBusq]         = useState('');
  const [estado, setEstado]     = useState<EstadoTicketSoporte | undefined>();
  const [prioridad, setPrioridad] = useState<PrioridadTicketSoporte | undefined>();
  const [empresaId, setEmpresaId] = useState<number | undefined>();
  const [rango, setRango]       = useState<[any, any] | null>(null);
  const [ticketVer, setTicketVer] = useState<SoporteTicket | null>(null);

  const filtrosActivos = (estado ? 1 : 0) + (prioridad ? 1 : 0) + (empresaId ? 1 : 0) + (rango ? 1 : 0);
  const limpiarFiltros = () => { setEstado(undefined); setPrioridad(undefined); setEmpresaId(undefined); setRango(null); };

  const { data, isLoading } = useQuery({
    queryKey: ['soporte-tickets-admin', pagina, estado, prioridad, empresaId, rango],
    queryFn: () => soporteApi.listarAdmin(pagina, 10, {
      estado, prioridad, empresaId,
      desde: rango?.[0]?.format('YYYY-MM-DD'),
      hasta: rango?.[1]?.format('YYYY-MM-DD'),
    }),
  });

  const tickets = (data?.data ?? []).filter(t => {
    if (!busq.trim()) return true;
    const q = busq.trim().toLowerCase();
    return t.mensaje.toLowerCase().includes(q)
      || String(t.contextoAutomatico?.usuarioNombre ?? '').toLowerCase().includes(q)
      || String(t.contextoAutomatico?.usuarioEmail ?? '').toLowerCase().includes(q);
  });

  const columns = [
    {
      title: 'Ticket', key: 'ticket', width: 220,
      render: (_: any, r: SoporteTicket) => (
        <Space direction="vertical" size={2}>
          <Text strong>#{r.id} — {asuntoLabel(r.asunto)}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {String(r.contextoAutomatico?.usuarioNombre ?? '—')} · Empresa #{r.empresaId ?? '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Mensaje', dataIndex: 'mensaje', key: 'mensaje',
      render: (v: string) => <Text ellipsis style={{ maxWidth: 320 }}>{v}</Text>,
    },
    {
      title: 'Prioridad', key: 'prioridad', width: 100,
      render: (_: any, r: SoporteTicket) => r.prioridad
        ? <Tag color={PRIORIDAD_TAG[r.prioridad].color}>{PRIORIDAD_TAG[r.prioridad].label}</Tag>
        : <Text type="secondary" style={{ fontSize: 12 }}>Sin asignar</Text>,
    },
    {
      title: 'Estado', key: 'estado', width: 110,
      render: (_: any, r: SoporteTicket) => <Tag color={ESTADO_TAG[r.estado].color}>{ESTADO_TAG[r.estado].label}</Tag>,
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 140,
      render: (v: string) => dRD(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: '', key: 'acc', width: 50,
      render: (_: any, r: SoporteTicket) => (
        <Button type="text" size="small" icon={<Eye size={14} />} onClick={() => setTicketVer(r)} />
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 0' }}>
      <Typography.Title level={5} style={{ margin: '0 0 16px' }}>Tickets de Soporte</Typography.Title>

      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="Buscar por mensaje, usuario o correo..."
          value={busq} onChange={e => setBusq(e.target.value)}
          allowClear style={{ width: 300 }} prefix={<Search size={14} color="#8c8c8c" />}
        />
      </div>

      <AdvancedFilters activeCount={filtrosActivos} onClear={limpiarFiltros}>
        <Col xs={24} sm={6}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Estado</div>
          <Select allowClear placeholder="Todos" style={{ width: '100%' }} value={estado}
            onChange={v => { setEstado(v); setPagina(1); }}
            options={[
              { value: 'abierto', label: 'Abierto' }, { value: 'en_proceso', label: 'En proceso' },
              { value: 'resuelto', label: 'Resuelto' }, { value: 'cerrado', label: 'Cerrado' },
            ]} />
        </Col>
        <Col xs={24} sm={6}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Prioridad</div>
          <Select allowClear placeholder="Todas" style={{ width: '100%' }} value={prioridad}
            onChange={v => { setPrioridad(v); setPagina(1); }}
            options={[{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }]} />
        </Col>
        <Col xs={24} sm={6}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Empresa (ID)</div>
          <Input type="number" placeholder="Ej. 42" style={{ width: '100%' }}
            value={empresaId} onChange={e => { setEmpresaId(e.target.value ? Number(e.target.value) : undefined); setPagina(1); }} />
        </Col>
        <Col xs={24} sm={6}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Rango de fecha</div>
          <DatePicker.RangePicker style={{ width: '100%' }} value={rango as any}
            onChange={v => { setRango(v as any); setPagina(1); }} />
        </Col>
      </AdvancedFilters>

      <Table
        dataSource={tickets}
        columns={columns as any}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ current: pagina, pageSize: 10, total: data?.meta?.total ?? 0, onChange: setPagina }}
        scroll={{ x: 'max-content' }}
      />

      {ticketVer && <DetalleTicketModal ticket={ticketVer} onClose={() => setTicketVer(null)} />}
    </div>
  );
}
