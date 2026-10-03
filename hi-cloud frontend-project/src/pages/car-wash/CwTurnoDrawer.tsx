import { useState } from 'react';
import {
  Drawer, Typography, Space, Tag, Steps, Image, Button, Popover, Input, InputNumber,
  Select, Form, message, Divider,
} from 'antd';
import { PrinterOutlined, DollarOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carWashApi } from '../../api/car-wash.api';
import { imprimirTicketCarWash } from './imprimirTicketCarWash';
import {
  LABEL_TIPO_VEHICULO_CW, LABEL_ESTADO_CW, type EstadoTurnoCw,
} from './tipos';
import { TIMESTAMP_POR_ESTADO, siguienteEstado } from './tableroHelpers';

const { Text } = Typography;

export default function CwTurnoDrawer({
  turnoId, onClose, usaSecado, onCobrar,
}: {
  turnoId: number;
  onClose: () => void;
  usaSecado: boolean;
  onCobrar: (turno: any) => void;
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [formEditar] = Form.useForm();

  const { data: turno } = useQuery({ queryKey: ['cw-turno', turnoId], queryFn: () => carWashApi.getTurno(turnoId) });
  const { data: fotos } = useQuery({ queryKey: ['cw-fotos', turnoId], queryFn: () => carWashApi.getFotos(turnoId) });
  const { data: comisiones } = useQuery({ queryKey: ['cw-comisiones', turnoId], queryFn: () => carWashApi.getComisionesDeTurno(turnoId) });
  const { data: lavadoresDisponibles } = useQuery({ queryKey: ['cw-lavadores'], queryFn: () => carWashApi.getLavadores(true) });

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['cw-turno', turnoId] });
    qc.invalidateQueries({ queryKey: ['cw-turnos'] });
  }

  const cambiarEstado = useMutation({
    mutationFn: (body: any) => carWashApi.cambiarEstado(turnoId, body),
    onSuccess: invalidar,
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'No se pudo cambiar el estado'),
  });
  const asignarBahia = useMutation({
    mutationFn: (body: any) => carWashApi.asignarBahia(turnoId, body),
    onSuccess: invalidar,
  });
  const asignarLavadores = useMutation({
    mutationFn: (lavadores: any) => carWashApi.asignarLavadores(turnoId, lavadores),
    onSuccess: () => { invalidar(); message.success('Lavadores asignados'); },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'No se pudo asignar'),
  });
  const editarTurno = useMutation({
    mutationFn: (body: any) => carWashApi.editarTurno(turnoId, body),
    onSuccess: () => { invalidar(); message.success('Turno actualizado'); setEditando(false); },
  });

  if (!turno) return <Drawer open onClose={onClose} width={420}>Cargando…</Drawer>;

  const etapas: EstadoTurnoCw[] = usaSecado
    ? ['en_espera', 'en_lavado', 'secado', 'listo', 'entregado']
    : ['en_espera', 'en_lavado', 'listo', 'entregado'];
  const siguiente = siguienteEstado(turno.estado, usaSecado);
  const puedeCancelar = turno.estado !== 'entregado' && turno.estado !== 'cancelado';

  return (
    <Drawer
      title={`Turno ${turno.codigo}`}
      open
      onClose={onClose}
      width={440}
      extra={
        <Space>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => imprimirTicketCarWash({
              codigo: turno.codigo, placa: turno.placa, tipoVehiculo: turno.tipoVehiculo,
              marca: turno.marca, color: turno.color,
              servicios: (turno.servicios ?? []).map((s: any) => ({ nombre: s.nombre, precio: Number(s.precio) })),
              urlPublica: turno.urlPublica,
            })}
          >
            Reimprimir
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Tag color={turno.estado === 'cancelado' ? 'red' : undefined}>{LABEL_ESTADO_CW[turno.estado as EstadoTurnoCw]}</Tag>
          {turno.facturaFolio ? <Tag color="green">{turno.facturaFolio}</Tag> : <Tag color="orange">Pendiente de cobro</Tag>}
        </div>

        {editando ? (
          <Form form={formEditar} layout="vertical" initialValues={turno} onFinish={v => editarTurno.mutate(v)}>
            <Form.Item name="marca" label="Marca / modelo"><Input /></Form.Item>
            <Form.Item name="color" label="Color"><Input /></Form.Item>
            <Form.Item name="telefono" label="Teléfono"><Input /></Form.Item>
            <Form.Item name="notasDanos" label="Notas / daños previos"><Input.TextArea rows={2} /></Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={editarTurno.isPending}>Guardar</Button>
              <Button onClick={() => setEditando(false)}>Cancelar</Button>
            </Space>
          </Form>
        ) : (
          <div>
            <Text strong>{turno.placa}</Text> — {LABEL_TIPO_VEHICULO_CW[turno.tipoVehiculo as keyof typeof LABEL_TIPO_VEHICULO_CW]}
            {turno.marca ? ` · ${turno.marca}` : ''}{turno.color ? ` · ${turno.color}` : ''}
            {turno.telefono ? <div><Text type="secondary">Tel: {turno.telefono}</Text></div> : null}
            {turno.notasDanos ? <div><Text type="secondary">Notas: {turno.notasDanos}</Text></div> : null}
            <br />
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditando(true)} style={{ marginTop: 6 }}>Editar</Button>
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <Steps
          size="small" direction="vertical"
          current={etapas.indexOf(turno.estado)}
          items={etapas.map(e => ({
            title: LABEL_ESTADO_CW[e],
            description: turno[TIMESTAMP_POR_ESTADO[e]] ? new Date(turno[TIMESTAMP_POR_ESTADO[e]]).toLocaleString('es-DO') : undefined,
          }))}
        />

        <div>
          <Text strong>Servicios</Text>
          <div>{(turno.servicios ?? []).map((s: any) => <Tag key={s.id}>{s.nombre} — RD${Number(s.precio).toFixed(2)}</Tag>)}</div>
        </div>

        <div>
          <Text strong>Bahía</Text>
          <br />
          <Popover
            trigger="click"
            content={
              <InputNumber
                placeholder="Bahía" defaultValue={turno.bahia}
                onChange={v => asignarBahia.mutate({ bahia: v })}
              />
            }
          >
            <Button size="small">{turno.bahia ? `Bahía ${turno.bahia}` : 'Asignar bahía'}</Button>
          </Popover>
        </div>

        <div>
          <Text strong>Lavadores</Text>
          <br />
          <Popover
            trigger="click"
            content={
              <AsignarLavadoresForm
                asignados={turno.lavadoresAsignados ?? []}
                disponibles={lavadoresDisponibles ?? []}
                onGuardar={lavs => asignarLavadores.mutate(lavs)}
              />
            }
          >
            <Button size="small">
              {(turno.lavadoresAsignados ?? []).length ? (turno.lavadoresAsignados as any[]).map(l => l.nombre).join(', ') : 'Asignar lavadores'}
            </Button>
          </Popover>
        </div>

        {comisiones?.length > 0 && (
          <div>
            <Text strong>Comisiones</Text>
            {comisiones.map((c: any) => (
              <div key={c.id}>
                <Text type="secondary">{c.servicioNombre ?? 'Todo el vehículo'} — RD${Number(c.monto).toFixed(2)} ({c.estado})</Text>
              </div>
            ))}
          </div>
        )}

        {fotos?.length > 0 && (
          <div>
            <Text strong>Fotos de daños previos</Text>
            <Image.PreviewGroup>
              <Space wrap style={{ marginTop: 6 }}>
                {fotos.map((f: any) => <Image key={f.id} src={f.url} width={64} height={64} style={{ objectFit: 'cover' }} />)}
              </Space>
            </Image.PreviewGroup>
          </div>
        )}

        <Divider style={{ margin: '4px 0' }} />

        <Space wrap>
          {!turno.facturaFolio && <Button icon={<DollarOutlined />} onClick={() => onCobrar(turno)}>Cobrar</Button>}
          {siguiente && (
            <Button type="primary" onClick={() => cambiarEstado.mutate({ estado: siguiente })} loading={cambiarEstado.isPending}>
              → {LABEL_ESTADO_CW[siguiente]}
            </Button>
          )}
          {puedeCancelar && (
            <Button
              danger icon={<StopOutlined />}
              onClick={() => {
                const motivo = window.prompt('Motivo de cancelación:');
                if (motivo) cambiarEstado.mutate({ estado: 'cancelado', motivo });
              }}
            >
              Cancelar
            </Button>
          )}
        </Space>
      </Space>
    </Drawer>
  );
}

function AsignarLavadoresForm({ asignados, disponibles, onGuardar }: {
  asignados: Array<{ lavadorId: number; porcentaje: number }>;
  disponibles: any[];
  onGuardar: (lavadores: Array<{ lavadorId: number; porcentaje: number }>) => void;
}) {
  const [seleccionados, setSeleccionados] = useState<number[]>(asignados.map(a => a.lavadorId));
  const [porcentajes, setPorcentajes] = useState<Record<number, number>>(() => {
    const inicial: Record<number, number> = {};
    for (const a of asignados) inicial[a.lavadorId] = a.porcentaje;
    return inicial;
  });

  function cambiarSeleccion(ids: number[]) {
    setSeleccionados(ids);
    const parte = Math.round((100 / Math.max(1, ids.length)) * 100) / 100;
    const nuevo: Record<number, number> = {};
    ids.forEach((id, i) => { nuevo[id] = porcentajes[id] ?? (i === ids.length - 1 ? Math.round((100 - parte * (ids.length - 1)) * 100) / 100 : parte); });
    setPorcentajes(nuevo);
  }

  const suma = seleccionados.reduce((s, id) => s + (porcentajes[id] ?? 0), 0);

  return (
    <Space direction="vertical" style={{ width: 260 }}>
      <Select
        mode="multiple" placeholder="Elige lavadores" value={seleccionados} onChange={cambiarSeleccion}
        options={disponibles.map(l => ({ value: l.id, label: l.nombre }))} style={{ width: '100%' }}
      />
      {seleccionados.map(id => (
        <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Text>{disponibles.find(l => l.id === id)?.nombre}</Text>
          <InputNumber min={0} max={100} size="small" value={porcentajes[id] ?? 0} onChange={v => setPorcentajes(p => ({ ...p, [id]: v ?? 0 }))} addonAfter="%" />
        </div>
      ))}
      {seleccionados.length > 0 && <Text type={Math.abs(suma - 100) > 0.01 ? 'danger' : 'secondary'}>Suma: {suma.toFixed(2)}%</Text>}
      <Button
        type="primary" size="small" block
        disabled={seleccionados.length === 0 || Math.abs(suma - 100) > 0.01}
        onClick={() => onGuardar(seleccionados.map(id => ({ lavadorId: id, porcentaje: porcentajes[id] ?? 0 })))}
      >
        Guardar
      </Button>
    </Space>
  );
}
