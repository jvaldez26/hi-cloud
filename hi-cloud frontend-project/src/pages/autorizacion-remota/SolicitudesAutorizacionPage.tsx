import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Modal, Input, Typography, Empty, Space, message } from 'antd';
import { CheckOutlined, CloseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { autorizacionRemotaApi, type SolicitudAutorizacionRemota } from '../../api/autorizacionRemota.api';
import { mensajeDeError } from '../../utils/mensajeDeError';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const ESTADO_TAG: Record<string, { color: string; label: string }> = {
  pendiente: { color: 'orange', label: 'Pendiente' },
  aprobada:  { color: 'green',  label: 'Aprobada' },
  rechazada: { color: 'red',    label: 'Rechazada' },
  expirada:  { color: 'default', label: 'Expirada' },
  cancelada: { color: 'default', label: 'Cancelada' },
};

function Countdown({ expiraEn }: { expiraEn: string }) {
  const [restante, setRestante] = useState(() => Math.max(0, new Date(expiraEn).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRestante(Math.max(0, new Date(expiraEn).getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiraEn]);
  const segs = Math.floor(restante / 1000);
  return <Text type={segs <= 30 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
    <ClockCircleOutlined /> {Math.floor(segs / 60)}:{String(segs % 60).padStart(2, '0')}
  </Text>;
}

function detalleCorto(s: SolicitudAutorizacionRemota): string {
  const partes: string[] = [];
  if (s.monto != null) partes.push(`Monto: ${fmt.money(Number(s.monto))}`);
  if (s.clienteId != null) partes.push(`Cliente #${s.clienteId}`);
  if (s.facturaId != null) partes.push(`Factura #${s.facturaId}`);
  return partes.join(' · ');
}

export default function SolicitudesAutorizacionPage() {
  const qc = useQueryClient();
  const [decidiendo, setDecidiendo] = useState<{ solicitud: SolicitudAutorizacionRemota; decision: 'aprobada' | 'rechazada' } | null>(null);
  const [comentario, setComentario] = useState('');

  const { data: pendientes, isLoading: cargandoPendientes } = useQuery({
    queryKey: ['autorizacion-remota-pendientes'],
    queryFn:  autorizacionRemotaApi.pendientes,
    refetchInterval: 10_000, // respaldo del WebSocket
  });

  const { data: historial, isLoading: cargandoHistorial } = useQuery({
    queryKey: ['autorizacion-remota-historial'],
    queryFn:  autorizacionRemotaApi.historial,
  });

  const decidirMut = useMutation({
    mutationFn: ({ id, decision, comentario }: { id: number; decision: 'aprobada' | 'rechazada'; comentario?: string }) =>
      autorizacionRemotaApi.decidir(id, decision, comentario),
    onSuccess: () => {
      message.success('Respuesta registrada');
      setDecidiendo(null); setComentario('');
      qc.invalidateQueries({ queryKey: ['autorizacion-remota-pendientes'] });
      qc.invalidateQueries({ queryKey: ['autorizacion-remota-historial'] });
    },
    onError: (e: any) => {
      message.error(mensajeDeError(e, { fallback: 'No se pudo registrar la respuesta' }));
      qc.invalidateQueries({ queryKey: ['autorizacion-remota-pendientes'] }); // por si "ya fue respondida por X"
    },
  });

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 4 }}>Solicitudes de autorización</Title>
      <Text type="secondary">Autorizaciones remotas de Modo Supervisor pedidas desde el POS.</Text>

      <Card title="Pendientes" style={{ marginTop: 16 }} loading={cargandoPendientes}>
        {!pendientes?.length ? (
          <Empty description="No hay solicitudes pendientes" />
        ) : (
          <Table
            rowKey="id"
            dataSource={pendientes}
            pagination={false}
            columns={[
              { title: 'Cajero', dataIndex: 'cajeroNombre' },
              { title: 'Acción', dataIndex: 'clave', render: (v: string) => <Tag>{v}</Tag> },
              { title: 'Motivo', dataIndex: 'motivo', render: (v: string, s) => (
                <div>
                  <div>{v}</div>
                  {detalleCorto(s) && <Text type="secondary" style={{ fontSize: 12 }}>{detalleCorto(s)}</Text>}
                </div>
              ) },
              { title: 'Vence en', dataIndex: 'expiraEn', render: (v: string) => <Countdown expiraEn={v} /> },
              { title: 'Acciones', key: 'acciones', render: (_: unknown, s: SolicitudAutorizacionRemota) => (
                <Space>
                  <Button size="small" type="primary" icon={<CheckOutlined />}
                    onClick={() => setDecidiendo({ solicitud: s, decision: 'aprobada' })}>
                    Aprobar
                  </Button>
                  <Button size="small" danger icon={<CloseOutlined />}
                    onClick={() => setDecidiendo({ solicitud: s, decision: 'rechazada' })}>
                    Rechazar
                  </Button>
                </Space>
              ) },
            ]}
          />
        )}
      </Card>

      <Card title="Historial" style={{ marginTop: 16 }} loading={cargandoHistorial}>
        <Table
          rowKey="id"
          dataSource={historial ?? []}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Fecha', dataIndex: 'createdAt', render: (v: string) => new Date(v).toLocaleString('es-DO') },
            { title: 'Cajero', dataIndex: 'cajeroNombre' },
            { title: 'Acción', dataIndex: 'clave', render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Estado', dataIndex: 'estado', render: (v: string) => {
              const cfg = ESTADO_TAG[v] ?? { color: 'default', label: v };
              return <Tag color={cfg.color}>{cfg.label}</Tag>;
            } },
            { title: 'Origen', key: 'origen', render: () => <Tag color="purple">Remota</Tag> },
            { title: 'Supervisor', dataIndex: 'supervisorNombre', render: (v?: string | null) => v ?? '—' },
            { title: 'Comentario', dataIndex: 'comentario', render: (v?: string | null) => v ?? '—' },
          ]}
        />
      </Card>

      <Modal
        open={!!decidiendo}
        title={decidiendo?.decision === 'aprobada' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
        onCancel={() => { setDecidiendo(null); setComentario(''); }}
        onOk={() => decidiendo && decidirMut.mutate({ id: decidiendo.solicitud.id, decision: decidiendo.decision, comentario: comentario.trim() || undefined })}
        okText={decidiendo?.decision === 'aprobada' ? 'Aprobar' : 'Rechazar'}
        okButtonProps={{ danger: decidiendo?.decision === 'rechazada', loading: decidirMut.isPending }}
        destroyOnClose
      >
        {decidiendo && (
          <div>
            <p><strong>{decidiendo.solicitud.cajeroNombre}</strong> — {decidiendo.solicitud.clave}</p>
            <p>{decidiendo.solicitud.motivo}</p>
            {detalleCorto(decidiendo.solicitud) && <p><Text type="secondary">{detalleCorto(decidiendo.solicitud)}</Text></p>}
            <Input.TextArea
              rows={2}
              placeholder="Comentario (opcional)"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              maxLength={500}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
