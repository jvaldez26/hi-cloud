import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tabs, Table, Button, Tag, Select, DatePicker, Space, Typography, Empty, Popconfirm } from 'antd';
import { CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNotificacionesCentro, ItemCentro } from '../../hooks/useNotificacionesCentro';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * AD91 — Centro de Notificaciones ("Ver todas →" de la campanita). Misma
 * fuente que el bell (useNotificacionesCentro) — eventos (leído/no leído por
 * usuario) y alertas de estado (vistas hasta que cambian, o pospuestas 1 día).
 */
export default function NotificacionesPage() {
  const navigate = useNavigate();
  const {
    items, isLoading,
    marcarEventoLeido, marcarTodoLeido, marcarAlertaVista, posponerAlerta,
  } = useNotificacionesCentro();

  const [tab, setTab] = useState<'no-leidas' | 'todas' | 'alertas-activas'>('no-leidas');
  const [tipo, setTipo] = useState<string | undefined>();
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const tiposDisponibles = useMemo(
    () => Array.from(new Set(items.map(i => i.tipo))).sort(),
    [items],
  );

  const filtrados = useMemo(() => {
    let base = items;
    if (tab === 'no-leidas')      base = base.filter(i => !i.atendido);
    if (tab === 'alertas-activas') base = base.filter(i => i.origen === 'alerta');
    if (tipo)  base = base.filter(i => i.tipo === tipo);
    if (rango) {
      const [desde, hasta] = rango;
      base = base.filter(i => {
        const f = dayjs(i.fecha);
        return f.isAfter(desde.startOf('day')) && f.isBefore(hasta.endOf('day'));
      });
    }
    return base;
  }, [items, tab, tipo, rango]);

  function abrir(i: ItemCentro) {
    if (i.origen === 'evento' && !i.atendido) marcarEventoLeido(Number(i.id.replace('evento-', '')));
    navigate(i.ruta);
  }

  return (
    <div>
      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>Centro de Notificaciones</Typography.Title>
          <Button icon={<CheckOutlined />} onClick={() => marcarTodoLeido()}>
            Marcar todo como leído
          </Button>
        </Space>

        <Tabs
          activeKey={tab}
          onChange={k => setTab(k as any)}
          items={[
            { key: 'no-leidas',      label: `No leídas (${items.filter(i => !i.atendido).length})` },
            { key: 'todas',          label: 'Todas' },
            { key: 'alertas-activas', label: `Alertas activas (${items.filter(i => i.origen === 'alerta').length})` },
          ]}
        />

        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            placeholder="Tipo"
            allowClear
            value={tipo}
            onChange={setTipo}
            style={{ width: 240 }}
            options={tiposDisponibles.map(t => ({ value: t, label: t }))}
          />
          <RangePicker value={rango} onChange={v => setRango(v as any)} format="DD/MM/YYYY" />
        </Space>

        <Table<ItemCentro>
          dataSource={filtrados}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="Sin notificaciones" /> }}
          rowClassName={row => (row.atendido ? '' : 'notif-no-atendida')}
          columns={[
            {
              title: '', dataIndex: 'emoji', width: 36,
              render: (e: string) => <span style={{ fontSize: 16 }}>{e}</span>,
            },
            {
              title: 'Aviso', dataIndex: 'titulo',
              render: (_: string, row) => (
                <div>
                  <Text strong={!row.atendido}>{row.titulo}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{row.descripcion}</Text>
                </div>
              ),
            },
            {
              title: 'Tipo', dataIndex: 'origen', width: 110,
              render: (o: string) => <Tag color={o === 'evento' ? 'blue' : 'orange'}>{o === 'evento' ? 'Evento' : 'Alerta'}</Tag>,
            },
            {
              title: 'Estado', dataIndex: 'atendido', width: 110,
              render: (a: boolean) => a ? <Tag>Atendido</Tag> : <Tag color="red">Pendiente</Tag>,
            },
            {
              title: '', dataIndex: 'acciones', width: 220,
              render: (_: unknown, row) => (
                <Space>
                  <Button size="small" onClick={() => abrir(row)}>Ver</Button>
                  {row.origen === 'evento' && !row.atendido && (
                    <Button size="small" onClick={() => marcarEventoLeido(Number(row.id.replace('evento-', '')))}>
                      Marcar leído
                    </Button>
                  )}
                  {row.origen === 'alerta' && (
                    <>
                      <Button size="small" onClick={() => marcarAlertaVista(row.tipo)}>Marcar visto</Button>
                      <Popconfirm title="Posponer 1 día" onConfirm={() => posponerAlerta(row.tipo)}>
                        <Button size="small" icon={<ClockCircleOutlined />} />
                      </Popconfirm>
                    </>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
