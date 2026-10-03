import { useState } from 'react';
import { Typography, Table, Input, Select, DatePicker, Button, Space, Modal, Tag, Steps, Image, message } from 'antd';
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { carWashApi } from '../../api/car-wash.api';
import { exportarExcel } from '../../utils/exportExcel';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  LABEL_TIPO_VEHICULO_CW, LABEL_ESTADO_CW, COLOR_ESTADO_CW,
  TIPOS_VEHICULO_CW, ESTADOS_TURNO_CW, type EstadoTurnoCw,
} from './tipos';
import { Tag as AntTag } from 'antd';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const F = 'YYYY-MM-DD';

const COLS_DEF = [
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'placa', label: 'Placa', defaultVisible: true },
  { key: 'tipoVehiculo', label: 'Tipo', defaultVisible: true },
  { key: 'servicios', label: 'Servicios', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'cobro', label: 'Cobro', defaultVisible: true },
  { key: 'lavadores', label: 'Lavadores', defaultVisible: false },
];

export default function CarWashTurnosPage() {
  const [rango, setRango] = useState<[Dayjs, Dayjs] | null>(null);
  const [estado, setEstado] = useState<EstadoTurnoCw | undefined>();
  const [placa, setPlaca] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState<string | undefined>();
  const [cobrado, setCobrado] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [turnoAbierto, setTurnoAbierto] = useState<number | null>(null);

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('car-wash-turnos', COLS_DEF);

  const filtros = {
    ...(rango ? { desde: rango[0].format(F), hasta: rango[1].format(F) } : {}),
    estado, placa: placa || undefined, tipoVehiculo, cobrado, page, limit: 10,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['cw-historial', filtros],
    queryFn: () => carWashApi.getHistorial(filtros),
  });

  async function exportar() {
    const todo = await carWashApi.getHistorial({ ...filtros, page: 1, limit: 10000 });
    const filas = (todo.data ?? []).map((t: any) => ({
      Código: t.codigo, Fecha: t.fechaRD, Placa: t.placa, Tipo: LABEL_TIPO_VEHICULO_CW[t.tipoVehiculo as keyof typeof LABEL_TIPO_VEHICULO_CW],
      Servicios: (t.servicios ?? []).map((s: any) => s.nombre).join(', '),
      Estado: LABEL_ESTADO_CW[t.estado as EstadoTurnoCw],
      Cobro: t.facturaFolio ?? 'Pendiente',
      Lavadores: (t.lavadoresAsignados ?? []).map((l: any) => l.nombre).join(', '),
    }));
    if (!filas.length) { message.info('No hay turnos para exportar'); return; }
    exportarExcel(filas, 'Turnos-CarWash');
  }

  const columnas = filterColumns<any>([
    { key: 'codigo', title: 'Código', dataIndex: 'codigo' },
    { key: 'fecha', title: 'Fecha', dataIndex: 'fechaRD' },
    { key: 'placa', title: 'Placa', dataIndex: 'placa' },
    { key: 'tipoVehiculo', title: 'Tipo', dataIndex: 'tipoVehiculo', render: (v: string) => LABEL_TIPO_VEHICULO_CW[v as keyof typeof LABEL_TIPO_VEHICULO_CW] },
    {
      key: 'servicios', title: 'Servicios', dataIndex: 'servicios',
      render: (s: any[]) => (s ?? []).map(x => <AntTag key={x.id}>{x.nombre}</AntTag>),
    },
    { key: 'estado', title: 'Estado', dataIndex: 'estado', render: (v: EstadoTurnoCw) => <Tag color={COLOR_ESTADO_CW[v]}>{LABEL_ESTADO_CW[v]}</Tag> },
    {
      key: 'cobro', title: 'Cobro', dataIndex: 'facturaFolio',
      render: (v: string) => v ? <Tag color="green">{v}</Tag> : <Tag color="orange">Pendiente</Tag>,
    },
    {
      key: 'lavadores', title: 'Lavadores', dataIndex: 'lavadoresAsignados',
      render: (l: any[]) => (l ?? []).map(x => x.nombre).join(', ') || '—',
    },
  ]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Turnos</Title>
        <Space wrap>
          <Input
            placeholder="Buscar por placa" prefix={<SearchOutlined />} allowClear
            value={placa} onChange={e => { setPlaca(e.target.value); setPage(1); }} style={{ width: 160 }}
          />
          <RangePicker value={rango} onChange={v => { setRango(v as [Dayjs, Dayjs]); setPage(1); }} />
          <Select
            placeholder="Estado" allowClear style={{ width: 140 }}
            value={estado} onChange={v => { setEstado(v); setPage(1); }}
            options={ESTADOS_TURNO_CW.map(e => ({ value: e, label: LABEL_ESTADO_CW[e] }))}
          />
          <Select
            placeholder="Tipo de vehículo" allowClear style={{ width: 150 }}
            value={tipoVehiculo} onChange={v => { setTipoVehiculo(v); setPage(1); }}
            options={TIPOS_VEHICULO_CW.map(t => ({ value: t, label: LABEL_TIPO_VEHICULO_CW[t] }))}
          />
          <Select
            placeholder="Cobro" allowClear style={{ width: 130 }}
            value={cobrado} onChange={v => { setCobrado(v); setPage(1); }}
            options={[{ value: 'true', label: 'Cobrado' }, { value: 'false', label: 'Pendiente' }]}
          />
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.data ?? []}
        columns={columnas}
        onRow={r => ({ onClick: () => setTurnoAbierto(r.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 10, total: data?.total ?? 0, onChange: setPage }}
      />

      {turnoAbierto && <DetalleTurnoModal turnoId={turnoAbierto} onClose={() => setTurnoAbierto(null)} />}
    </div>
  );
}

function DetalleTurnoModal({ turnoId, onClose }: { turnoId: number; onClose: () => void }) {
  const { data: turno } = useQuery({ queryKey: ['cw-turno', turnoId], queryFn: () => carWashApi.getTurno(turnoId) });
  const { data: fotos } = useQuery({ queryKey: ['cw-fotos', turnoId], queryFn: () => carWashApi.getFotos(turnoId) });
  const { data: comisiones } = useQuery({ queryKey: ['cw-comisiones', turnoId], queryFn: () => carWashApi.getComisionesDeTurno(turnoId) });

  const etapas: EstadoTurnoCw[] = ['en_espera', 'en_lavado', 'secado', 'listo', 'entregado'];
  const timestampPorEstado: Record<string, string> = {
    en_espera: 'enEsperaAt', en_lavado: 'enLavadoAt', secado: 'secadoAt', listo: 'listoAt', entregado: 'entregadoAt',
  };

  return (
    <Modal title={`Turno ${turno?.codigo ?? ''}`} open onCancel={onClose} footer={null} width={640}>
      {!turno ? 'Cargando…' : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>{turno.placa} — {LABEL_TIPO_VEHICULO_CW[turno.tipoVehiculo as keyof typeof LABEL_TIPO_VEHICULO_CW]}{turno.marca ? ` · ${turno.marca}` : ''}{turno.color ? ` · ${turno.color}` : ''}</div>

          <Steps
            size="small" direction="vertical"
            current={etapas.indexOf(turno.estado)}
            items={etapas.map(e => ({
              title: LABEL_ESTADO_CW[e],
              description: turno[timestampPorEstado[e]] ? new Date(turno[timestampPorEstado[e]]).toLocaleString('es-DO') : undefined,
            }))}
          />

          <Typography.Text strong>Servicios</Typography.Text>
          <div>{(turno.servicios ?? []).map((s: any) => <Tag key={s.id}>{s.nombre} — RD${Number(s.precio).toFixed(2)}</Tag>)}</div>

          <Typography.Text strong>Lavadores</Typography.Text>
          <div>{(turno.lavadoresAsignados ?? []).length ? (turno.lavadoresAsignados as any[]).map((l: any) => <Tag key={l.lavadorId}>{l.nombre} ({l.porcentaje}%)</Tag>) : '—'}</div>

          <Typography.Text strong>Cobro</Typography.Text>
          <div>{turno.facturaFolio ? <Tag color="green">{turno.facturaFolio}</Tag> : <Tag color="orange">Pendiente</Tag>}</div>

          {comisiones?.length > 0 && (
            <>
              <Typography.Text strong>Comisiones</Typography.Text>
              <Table
                size="small" pagination={false} rowKey="id" dataSource={comisiones}
                columns={[
                  { title: 'Lavador', dataIndex: 'lavadorId' },
                  { title: 'Servicio', dataIndex: 'servicioNombre', render: (v: string) => v || 'Todo el vehículo' },
                  { title: 'Monto', dataIndex: 'monto', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
                  { title: 'Estado', dataIndex: 'estado' },
                ]}
              />
            </>
          )}

          {fotos?.length > 0 && (
            <>
              <Typography.Text strong>Fotos de daños previos</Typography.Text>
              <Image.PreviewGroup>
                <Space wrap>
                  {fotos.map((f: any) => <Image key={f.id} src={f.url} width={80} height={80} style={{ objectFit: 'cover' }} />)}
                </Space>
              </Image.PreviewGroup>
            </>
          )}
        </Space>
      )}
    </Modal>
  );
}
