import { useState } from 'react';
import { Table, Tag, Button, Space, Typography, Modal, Input, message, Tooltip, Select } from 'antd';
import { EyeOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { fecha, fechaHora } from '../../utils/fechaRD';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Text } = Typography;

/**
 * Solicitudes de activación de facturación electrónica — vista de plataforma.
 *
 * Aquí NO hay ningún certificado: el PFX se valida en memoria al recibirlo y se
 * descarta. Lo que se ve son los metadatos (si era válido, cuándo vence, a
 * nombre de quién), que es lo que hace falta para saber qué se está vendiendo.
 *
 * Marcar "activada" NO activa nada: es Jean quien configura MSeller a mano y
 * luego deja constancia aquí.
 */

const ESTADOS = [
  { value: 'pendiente_pago', label: 'Pendiente de pago', color: 'orange' },
  { value: 'pago_recibido',  label: 'Pago recibido',     color: 'blue' },
  { value: 'en_proceso',     label: 'En proceso',        color: 'processing' },
  { value: 'activada',       label: 'Activada',          color: 'green' },
  { value: 'rechazada',      label: 'Rechazada',         color: 'red' },
];
const infoEstado = (v: string) => ESTADOS.find(e => e.value === v);

export function ActivacionEcfAdminTab() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<string | undefined>();

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['admin-activacion-ecf', filtro],
    queryFn:  () => api.get(`/admin/activacion-ecf${filtro ? `?estado=${filtro}` : ''}`)
      .then(r => r.data?.data ?? r.data),
    refetchInterval: 60_000,
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado, motivo }: { id: number; estado: string; motivo?: string }) =>
      api.patch(`/admin/activacion-ecf/${id}/estado`, { estado, motivo }),
    onSuccess: () => {
      message.success('Estado actualizado');
      qc.invalidateQueries({ queryKey: ['admin-activacion-ecf'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo actualizar'),
  });

  /** URL firmada a 15 min. El comprobante nunca es público. */
  const verComprobante = async (id: number) => {
    try {
      const r = await api.get(`/admin/activacion-ecf/${id}/comprobante`);
      const url = (r.data?.data ?? r.data)?.url;
      if (url) window.open(url, '_blank');
      else message.info('Esta solicitud aún no tiene comprobante');
    } catch { message.error('No se pudo obtener el comprobante'); }
  };

  const rechazar = (id: number) => {
    let motivo = '';
    Modal.confirm({
      title: 'Rechazar solicitud',
      content: (
        <Input.TextArea rows={3} placeholder="Motivo del rechazo — lo verá el cliente"
          onChange={e => { motivo = e.target.value; }} />
      ),
      okText: 'Rechazar', okButtonProps: { danger: true },
      onOk: () => {
        if (!motivo.trim()) { message.error('El motivo es obligatorio'); return Promise.reject(); }
        return estadoMut.mutateAsync({ id, estado: 'rechazada', motivo });
      },
    });
  };

  const COLS_DEF = [
    { key: 'empresaNombre', label: 'Empresa'     },
    { key: 'createdAt',     label: 'Fecha'       },
    { key: 'certificado',   label: 'Certificado' },
    { key: 'montoAcordado', label: 'Monto'       },
    { key: 'comprobante',   label: 'Comprobante' },
    { key: 'estado',        label: 'Estado'      },
  ];
  const { visibleColumns, updateVisibility, filterColumns } =
    useColumnVisibility('sa-activacion-ecf', COLS_DEF);

  const cols = [
    {
      title: 'Empresa', dataIndex: 'empresaNombre', key: 'empresaNombre',
      render: (v: string, r: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>RNC {r.empresaRnc ?? '—'}</Text>
        </div>
      ),
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 140,
      render: (v: string) => <span style={{ fontSize: 12 }}>{fechaHora(v)}</span>,
    },
    {
      title: 'Certificado', key: 'certificado', width: 170, align: 'center' as const,
      render: (_: any, r: any) => {
        if (r.tieneCertificado) {
          return (
            <Tooltip title={
              (r.certificadoTitular ? `A nombre de: ${r.certificadoTitular}` : 'Sin titular en el certificado') +
              ' · El archivo no se almacenó'
            }>
              <Tag color="green">Propio{r.certificadoVenceEn ? ` · vence ${fecha(r.certificadoVenceEn)}` : ''}</Tag>
            </Tooltip>
          );
        }
        if (r.certificadoVencido) return <Tag color="red">Subió uno vencido</Tag>;
        return <Tag>Hay que gestionarlo</Tag>;
      },
    },
    {
      title: 'Monto', dataIndex: 'montoAcordado', key: 'montoAcordado', width: 120, align: 'right' as const,
      render: (v: number) => (
        <Tooltip title="Congelado al crear la solicitud — no cambia si sube la tarifa">
          <Text strong>{fmt.money(Number(v))}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Comprobante', key: 'comprobante', width: 120, align: 'center' as const,
      render: (_: any, r: any) => r.comprobantePagoKey
        ? <Button size="small" icon={<EyeOutlined />} onClick={() => verComprobante(r.id)}>Ver</Button>
        : <Tag color="orange">Sin subir</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 150,
      render: (v: string) => {
        const i = infoEstado(v);
        return <Tag color={i?.color}>{i?.label ?? v}</Tag>;
      },
    },
    {
      title: '', key: 'acc', width: 210, align: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          {r.estado === 'pendiente_pago' && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              onClick={() => estadoMut.mutate({ id: r.id, estado: 'pago_recibido' })}>
              Pago recibido
            </Button>
          )}
          {r.estado === 'pago_recibido' && (
            <Button size="small" onClick={() => estadoMut.mutate({ id: r.id, estado: 'en_proceso' })}>
              En proceso
            </Button>
          )}
          {r.estado === 'en_proceso' && (
            <Tooltip title="Marca la solicitud como completada. NO configura MSeller: eso se hace a mano.">
              <Button size="small" type="primary"
                onClick={() => estadoMut.mutate({ id: r.id, estado: 'activada' })}>
                Marcar activada
              </Button>
            </Tooltip>
          )}
          {r.estado !== 'activada' && r.estado !== 'rechazada' && (
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => rechazar(r.id)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Select
          allowClear placeholder="Todos los estados" style={{ width: 200 }}
          value={filtro} onChange={setFiltro}
          options={ESTADOS.map(e => ({ value: e.value, label: e.label }))}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Los certificados no se almacenan — aquí solo se ven sus metadatos.
        </Text>
        <div style={{ marginLeft: 'auto' }}>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
        </div>
      </div>

      {/* 7 columnas. Sin scroll horizontal, en pantalla estrecha se corta la
          columna de acciones y se pierden justo los botones de gestión. */}
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data ?? []}
        columns={filterColumns(cols as any)}
        size="small"
        pagination={{ pageSize: 10 }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}
