import { useMemo, useState } from 'react';
import {
  Tabs, Card, Table, Button, Tag, Select, Input, DatePicker, Space, Typography,
  Alert, Switch, message, Popconfirm, Tooltip, Badge, Checkbox, Empty,
} from 'antd';
import {
  WarningOutlined, CheckOutlined, EyeOutlined, FormOutlined, InboxOutlined,
  UndoOutlined, LinkOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  xlinkApi, XlinkDocumentoFila, XlinkTipoDocumento, XlinkEstadoReceptor,
  RecibirXlinkResultadoItem, FaltanteMapeo, tipoDocumentoLabel,
} from '../../api/xlink.api';
import { configuracionApi } from '../../api/configuracion.api';
import { ahoraRD, fecha as fmtFecha } from '../../utils/fechaRD';
import { fmt } from '../../utils/formatters';
import { useAuthStore } from '../../store/auth.store';
import XlinkHomologacionModal from './XlinkHomologacionModal';
import { filtrarPorRelacionado } from './filtrarPorRelacionado';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const TIPO_GASTO_606 = [
  { value: '01', label: '01 — Gastos de personal' },
  { value: '02', label: '02 — Gastos por trabajo, suministros y servicios' },
  { value: '03', label: '03 — Arrendamientos' },
  { value: '04', label: '04 — Gastos de activos fijos' },
  { value: '05', label: '05 — Gastos de representación' },
  { value: '06', label: '06 — Otras deducciones admitidas' },
  { value: '07', label: '07 — Gastos financieros' },
  { value: '08', label: '08 — Gastos extraordinarios' },
  { value: '09', label: '09 — Compras y gastos que forman parte del costo de venta' },
  { value: '10', label: '10 — Adquisiciones de activos' },
  { value: '11', label: '11 — Gastos de seguro' },
];

interface FiltrosComunes {
  rango: [dayjs.Dayjs, dayjs.Dayjs];
  relacionado: string;
  numeroOrigen: string;
  ncfOrigen: string;
  tipoDocumento?: XlinkTipoDocumento;
}

function useFiltrosComunes() {
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([ahoraRD().startOf('month'), ahoraRD().endOf('month')]);
  const [relacionado, setRelacionado] = useState('');
  const [numeroOrigen, setNumeroOrigen] = useState('');
  const [ncfOrigen, setNcfOrigen] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<XlinkTipoDocumento | undefined>();
  return { rango, setRango, relacionado, setRelacionado, numeroOrigen, setNumeroOrigen, ncfOrigen, setNcfOrigen, tipoDocumento, setTipoDocumento };
}

function FiltrosBar({ f, mostrarTipo = true }: { f: ReturnType<typeof useFiltrosComunes>; mostrarTipo?: boolean }) {
  return (
    <Space wrap style={{ marginBottom: 12 }}>
      <RangePicker value={f.rango} onChange={(v) => v && f.setRango(v as [dayjs.Dayjs, dayjs.Dayjs])} format="DD/MM/YYYY" />
      <Input placeholder="Empresa relacionada" value={f.relacionado} onChange={e => f.setRelacionado(e.target.value)} style={{ width: 180 }} allowClear />
      <Input placeholder="Número" value={f.numeroOrigen} onChange={e => f.setNumeroOrigen(e.target.value)} style={{ width: 140 }} allowClear />
      <Input placeholder="NCF" value={f.ncfOrigen} onChange={e => f.setNcfOrigen(e.target.value)} style={{ width: 160 }} allowClear />
      {mostrarTipo && (
        <Select
          placeholder="Tipo de documento" allowClear style={{ width: 200 }}
          value={f.tipoDocumento} onChange={f.setTipoDocumento}
          options={[
            { value: 'factura_credito', label: 'Factura a Crédito' },
            { value: 'nota_credito', label: 'Nota de Crédito' },
            { value: 'orden_compra', label: 'Orden de Compra' },
          ]}
        />
      )}
    </Space>
  );
}

export default function XlinkPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const esAdmin = user?.role === 'admin';

  const { data: empresa, isLoading: cargandoEmpresa } = useQuery({ queryKey: ['empresa'], queryFn: configuracionApi.getEmpresa });
  const xlinkVisible = (empresa as any)?.xlinkVisible === true;

  // Mismo mecanismo que el badge del sidebar (AppLayout) — MISMA queryKey a
  // propósito: comparten caché, y las mutations de RecibidosTab invalidan
  // esta clave, así que el badge del sidebar se refresca solo, sin polling.
  const { data: pendientes } = useQuery({
    queryKey: ['xlink-pendientes-conteo'],
    queryFn: xlinkApi.contarPendientes,
    enabled: !!user,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 4 }}>HiCloud Xlink</Title>
      <Paragraph type="secondary">Intercambia facturas, notas de crédito y órdenes de compra directamente con otras empresas HiCloud.</Paragraph>

      {!xlinkVisible && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Tu empresa no está activada en HiCloud Xlink"
          description="Actívala para poder enviar y recibir documentos con otras empresas."
          action={esAdmin ? <ActivarBoton onDone={() => qc.invalidateQueries({ queryKey: ['empresa'] })} /> : undefined}
        />
      )}

      {!cargandoEmpresa && (
      <Tabs
        defaultActiveKey={xlinkVisible ? 'porProcesar' : 'activar'}
        items={[
          { key: 'porProcesar', label: <Badge count={pendientes?.total ?? 0} size="small" offset={[8, -2]}>Por Procesar</Badge>, children: <RecibidosTab estado="pendiente" /> },
          { key: 'procesados', label: 'Procesados', children: <RecibidosTab estado="procesado" /> },
          { key: 'descartados', label: 'Descartados', children: <RecibidosTab estado="descartado" /> },
          { key: 'enviados', label: 'Documentos Enviados', children: <EnviadosTab /> },
          { key: 'directorio', label: 'Directorio de Empresas', children: <DirectorioTab /> },
          { key: 'activar', label: 'Activar', children: <ActivarTab xlinkVisible={xlinkVisible} esAdmin={esAdmin} empresa={empresa} /> },
          { key: 'comoFunciona', label: 'Cómo funciona', children: <ComoFuncionaTab /> },
        ]}
      />
      )}
    </div>
  );
}

// ── Activar ──────────────────────────────────────────────────────────────────

function ActivarBoton({ onDone }: { onDone: () => void }) {
  const mut = useMutation({
    mutationFn: () => xlinkApi.actualizarVisibilidad(true),
    onSuccess: () => { message.success('Tu empresa ya aparece en el Directorio de HiCloud Xlink'); onDone(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo activar'),
  });
  return <Button type="primary" size="small" loading={mut.isPending} onClick={() => mut.mutate()}>Mostrar en el Directorio</Button>;
}

function ActivarTab({ xlinkVisible, esAdmin, empresa }: { xlinkVisible: boolean; esAdmin: boolean; empresa: any }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (visible: boolean) => xlinkApi.actualizarVisibilidad(visible),
    onSuccess: (_, visible) => {
      message.success(visible ? 'Activado — tu empresa ya aparece en el Directorio' : 'Desactivado — tu empresa ya no aparece en el Directorio');
      qc.invalidateQueries({ queryKey: ['empresa'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo cambiar la visibilidad'),
  });

  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch checked={xlinkVisible} disabled={!esAdmin} loading={mut.isPending} onChange={(v) => mut.mutate(v)} />
        <div>
          <Text strong>Visible en el Directorio de HiCloud Xlink</Text><br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Otras empresas HiCloud podrán encontrarte, vincularte y enviarte/recibir documentos.
            {!esAdmin && ' Solo un ADMIN puede cambiar esto.'}
          </Text>
        </div>
      </div>
      {empresa?.xlinkVisibleDesde && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          En el directorio desde {fmtFecha(empresa.xlinkVisibleDesde)}
        </Text>
      )}
    </Card>
  );
}

// ── Cómo funciona ────────────────────────────────────────────────────────────

function ComoFuncionaTab() {
  return (
    <Card style={{ maxWidth: 760 }}>
      <Title level={5}>¿Qué es HiCloud Xlink?</Title>
      <Paragraph>
        Un buzón para intercambiar documentos directamente con otra empresa que también usa HiCloud —
        sin redigitar nada. La empresa A publica un documento y la empresa B lo recibe con un clic,
        ya lleno, del lado que le corresponde.
      </Paragraph>
      <Title level={5}>Los 4 documentos y su equivalente</Title>
      <ul>
        <li><Text strong>Factura a Crédito</Text> → se recibe como Compra / Factura de Proveedor</li>
        <li><Text strong>Nota de Crédito</Text> a cliente → se recibe como Nota de Crédito de Proveedor</li>
        <li><Text strong>Orden de Compra</Text> → se recibe como Cotización en borrador (pedido a preparar)</li>
      </ul>
      <Title level={5}>Pasos</Title>
      <ol>
        <li>Activa tu empresa en la pestaña <Text strong>Activar</Text>.</li>
        <li>Busca a la otra empresa en el <Text strong>Directorio</Text> y vincúlala como cliente o proveedor.</li>
        <li>Desde el detalle de una Factura/NC/OC ya emitida, usa el botón <Text strong>"Enviar por HiCloud Xlink"</Text>.</li>
        <li>La otra empresa lo verá en <Text strong>"Por Procesar"</Text> y lo recibe con un clic.</li>
      </ol>
      <Title level={5}>Errores comunes</Title>
      <ul>
        <li><Text strong>"No tienes un proveedor/cliente vinculado"</Text>: vincula a la empresa desde el Directorio primero.</li>
        <li><Text strong>Faltan homologar productos</Text>: elige un producto existente o crea uno nuevo — queda guardado para la próxima vez.</li>
        <li>Solo se pueden enviar facturas <Text strong>a crédito</Text>, con su comprobante fiscal <Text strong>aceptado</Text> por la DGII.</li>
      </ul>
    </Card>
  );
}

// ── Directorio ───────────────────────────────────────────────────────────────

function DirectorioTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [soloRegistradas, setSoloRegistradas] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ['xlink-directorio', q, soloRegistradas, page],
    queryFn: () => xlinkApi.directorio({ q: q || undefined, soloRegistradas, page }),
    placeholderData: (prev) => prev,
  });

  const vincularMut = useMutation({
    mutationFn: ({ xlinkId, rol }: { xlinkId: string; rol: 'proveedor' | 'cliente' }) => xlinkApi.vincular(xlinkId, rol),
    onSuccess: () => {
      message.success('Vinculado correctamente');
      qc.invalidateQueries({ queryKey: ['xlink-directorio'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo vincular'),
  });

  const renderRelacion = (rel: { estado: string; id?: number; nombre?: string }, rol: 'proveedor' | 'cliente', xlinkId: string) => {
    if (rel.estado === 'vinculado') return <Tag color="green">{rel.nombre}</Tag>;
    if (rel.estado === 'coincide_sin_vincular') {
      return (
        <Space>
          <Tag color="orange">{rel.nombre}</Tag>
          <Button size="small" icon={<LinkOutlined />} loading={vincularMut.isPending} onClick={() => vincularMut.mutate({ xlinkId, rol })}>Vincular</Button>
        </Space>
      );
    }
    return <Button size="small" icon={<PlusOutlined />} loading={vincularMut.isPending} onClick={() => vincularMut.mutate({ xlinkId, rol })}>Crear</Button>;
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Buscar por nombre o RNC" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} allowClear />
        <Checkbox checked={soloRegistradas} onChange={e => setSoloRegistradas(e.target.checked)}>Solo empresas que ya tengo registradas</Checkbox>
      </Space>
      <Table
        rowKey="xlinkId"
        loading={isFetching}
        dataSource={data?.data ?? []}
        pagination={{ current: page, pageSize: 20, total: data?.meta?.total ?? 0, onChange: setPage }}
        columns={[
          { title: 'Empresa', dataIndex: 'nombreComercial' },
          { title: 'RNC', dataIndex: 'rnc' },
          { title: 'Industria', dataIndex: 'industria', render: (v) => v ?? '—' },
          { title: 'Proveedor relacionado', render: (_, r) => renderRelacion(r.proveedorRelacionado, 'proveedor', r.xlinkId) },
          { title: 'Cliente relacionado', render: (_, r) => renderRelacion(r.clienteRelacionado, 'cliente', r.xlinkId) },
        ]}
      />
    </div>
  );
}

// ── Recibidos (Por Procesar / Procesados / Descartados) ─────────────────────

function RecibidosTab({ estado }: { estado: XlinkEstadoReceptor }) {
  const qc = useQueryClient();
  const f = useFiltrosComunes();
  const [page, setPage] = useState(1);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [tipoGasto606Masivo, setTipoGasto606Masivo] = useState<string | undefined>();
  const [tipoRetencionIsrMasivo, setTipoRetencionIsrMasivo] = useState<'si' | 'no' | undefined>();
  const [config, setConfig] = useState<Record<number, { tipoGasto606?: string; tipoRetencionIsr?: 'si' | 'no' }>>({});
  const [homologacion, setHomologacion] = useState<{ contraparteXlinkId: string; faltantes: FaltanteMapeo[] } | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['xlink-recibidos', estado, page, f.rango[0].format('YYYY-MM-DD'), f.rango[1].format('YYYY-MM-DD'), f.numeroOrigen, f.ncfOrigen, f.tipoDocumento],
    queryFn: () => xlinkApi.listarRecibidos(estado, {
      page,
      desde: f.rango[0].format('YYYY-MM-DD'), hasta: f.rango[1].format('YYYY-MM-DD'),
      numeroOrigen: f.numeroOrigen || undefined, ncfOrigen: f.ncfOrigen || undefined, tipoDocumento: f.tipoDocumento,
    }),
    placeholderData: (prev) => prev,
  });

  const filas = useMemo(() => filtrarPorRelacionado(data?.data ?? [], f.relacionado), [data, f.relacionado]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['xlink-recibidos'] });
    qc.invalidateQueries({ queryKey: ['xlink-pendientes-conteo'] });
  };

  const recibirMut = useMutation({
    mutationFn: (items: { xlinkDocumentoId: number; tipoGasto606?: string; tipoRetencionIsr?: 'si' | 'no' }[]) => xlinkApi.recibir(items),
    onSuccess: (resultados: RecibirXlinkResultadoItem[]) => {
      invalidar();
      const ok = resultados.filter(r => r.ok).length;
      const conFaltantes = resultados.find(r => !r.ok && r.faltantes?.length);
      if (ok > 0) message.success(`${ok} recibido(s) correctamente`);
      const fallidos = resultados.filter(r => !r.ok && !r.faltantes?.length);
      if (fallidos.length > 0) message.warning(`${fallidos.length} con problemas — revisa el ícono de advertencia en la fila`);
      if (conFaltantes) {
        const fila = filas.find(x => x.id === conFaltantes.xlinkDocumentoId);
        if (fila) setHomologacion({ contraparteXlinkId: fila.contraparteXlinkId, faltantes: conFaltantes.faltantes! });
      }
      setUltimosResultados(resultados);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo recibir'),
  });

  const [ultimosResultados, setUltimosResultados] = useState<RecibirXlinkResultadoItem[]>([]);
  const errorDe = (id: number) => ultimosResultados.find(r => r.xlinkDocumentoId === id && !r.ok)?.error;

  const marcarProcesadoMut = useMutation({
    mutationFn: (id: number) => xlinkApi.marcarProcesado(id),
    onSuccess: () => { message.success('Marcado como procesado'); invalidar(); },
  });
  const descartarMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => xlinkApi.descartar(id, motivo),
    onSuccess: () => { message.success('Descartado'); invalidar(); },
  });
  const regresarMut = useMutation({
    mutationFn: (id: number) => xlinkApi.regresarPendiente(id),
    onSuccess: () => { message.success('De regreso en Por Procesar'); invalidar(); },
  });

  const aplicarASeleccionados = () => {
    setConfig(prev => {
      const next = { ...prev };
      for (const id of seleccionados) next[id] = { tipoGasto606: tipoGasto606Masivo, tipoRetencionIsr: tipoRetencionIsrMasivo };
      return next;
    });
    message.success(`Aplicado a ${seleccionados.length} documento(s)`);
  };

  const recibirSeleccionados = () => {
    recibirMut.mutate(seleccionados.map(id => ({ xlinkDocumentoId: id, ...config[id] })));
  };

  const esFactura = (r: XlinkDocumentoFila) => r.tipoDocumento === 'factura_credito';

  return (
    <div>
      <FiltrosBar f={f} />

      {estado === 'pendiente' && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Select placeholder="Tipo de gasto (606)" style={{ width: 260 }} options={TIPO_GASTO_606} value={tipoGasto606Masivo} onChange={setTipoGasto606Masivo} allowClear />
          <Select placeholder="Retención ISR" style={{ width: 140 }} options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]} value={tipoRetencionIsrMasivo} onChange={setTipoRetencionIsrMasivo} allowClear />
          <Button disabled={seleccionados.length === 0} onClick={aplicarASeleccionados}>Aplicar a seleccionados</Button>
          <Popconfirm title={`¿Recibir ${seleccionados.length} documento(s)?`} onConfirm={recibirSeleccionados} disabled={seleccionados.length === 0}>
            <Button type="primary" icon={<CheckOutlined />} disabled={seleccionados.length === 0} loading={recibirMut.isPending}>
              Recibir documentos seleccionados
            </Button>
          </Popconfirm>
        </Space>
      )}

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={filas}
        pagination={{ current: page, pageSize: 10, total: data?.meta?.total ?? 0, onChange: setPage }}
        rowSelection={estado === 'pendiente' ? { selectedRowKeys: seleccionados, onChange: (k) => setSeleccionados(k as number[]) } : undefined}
        columns={[
          { title: 'Empresa', dataIndex: 'contraparteNombre' },
          { title: 'Tipo', dataIndex: 'tipoDocumento', render: (v: XlinkTipoDocumento) => tipoDocumentoLabel(v) },
          { title: 'Número', dataIndex: 'numeroOrigen' },
          { title: 'NCF', dataIndex: 'ncfOrigen', render: (v) => v ?? '—' },
          { title: 'Fecha', dataIndex: 'fechaOrigen', render: (v) => fmtFecha(v) },
          { title: 'Total', dataIndex: 'totalOrigen', render: (v) => fmt.money(v) },
          ...(estado === 'pendiente' ? [{
            title: 'Config.',
            render: (_: unknown, r: XlinkDocumentoFila) => esFactura(r) ? (
              <Space direction="vertical" size={2}>
                <Select
                  size="small" placeholder="Gasto 606" style={{ width: 160 }} options={TIPO_GASTO_606}
                  value={config[r.id]?.tipoGasto606}
                  onChange={(v) => setConfig(prev => ({ ...prev, [r.id]: { ...prev[r.id], tipoGasto606: v } }))}
                />
                <Select
                  size="small" placeholder="Retención ISR" style={{ width: 160 }}
                  options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]}
                  value={config[r.id]?.tipoRetencionIsr}
                  onChange={(v) => setConfig(prev => ({ ...prev, [r.id]: { ...prev[r.id], tipoRetencionIsr: v } }))}
                />
              </Space>
            ) : <Text type="secondary">—</Text>,
          }] : []),
          { title: 'Generó', dataIndex: 'numeroGenerado', render: (v) => v ?? '—' },
          {
            title: '',
            render: (_: unknown, r: XlinkDocumentoFila) => {
              const err = errorDe(r.id);
              return (
                <Space>
                  {err && <Tooltip title={err}><WarningOutlined style={{ color: '#faad14' }} /></Tooltip>}
                  {estado === 'pendiente' && (
                    <>
                      <Tooltip title="Recibir">
                        <Button size="small" icon={<CheckOutlined />} onClick={() => recibirMut.mutate([{ xlinkDocumentoId: r.id, ...config[r.id] }])} />
                      </Tooltip>
                      <Tooltip title="Abrir formulario">
                        <Button size="small" icon={<FormOutlined />} onClick={() => window.open(`/xlink/${r.id}/formulario-preview`, '_blank')} />
                      </Tooltip>
                      <Tooltip title="Descartar">
                        <Popconfirm title="Motivo del descarte" onConfirm={() => descartarMut.mutate({ id: r.id, motivo: 'Descartado desde HiCloud Xlink' })}>
                          <Button size="small" danger icon={<InboxOutlined />} />
                        </Popconfirm>
                      </Tooltip>
                      <Tooltip title="Marcar procesado (sin generar nada)">
                        <Button size="small" onClick={() => marcarProcesadoMut.mutate(r.id)}>✓ Manual</Button>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip title="Ver PDF original">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(xlinkApi.urlPdfOriginal(r.id), '_blank')} />
                  </Tooltip>
                  {estado !== 'pendiente' && (
                    <Tooltip title="Regresar a pendiente">
                      <Button size="small" icon={<UndoOutlined />} onClick={() => regresarMut.mutate(r.id)} />
                    </Tooltip>
                  )}
                </Space>
              );
            },
          },
        ]}
        locale={{ emptyText: <Empty description="Sin documentos" /> }}
      />

      {homologacion && (
        <XlinkHomologacionModal
          open
          contraparteXlinkId={homologacion.contraparteXlinkId}
          faltantes={homologacion.faltantes}
          onClose={() => setHomologacion(null)}
          onGuardado={() => {
            const idsConFaltantes = ultimosResultados.filter(r => r.faltantes?.length).map(r => r.xlinkDocumentoId);
            setHomologacion(null);
            recibirMut.mutate(idsConFaltantes.map(id => ({ xlinkDocumentoId: id, ...config[id] })));
          }}
        />
      )}
    </div>
  );
}

// ── Enviados ─────────────────────────────────────────────────────────────────

function EnviadosTab() {
  const qc = useQueryClient();
  const f = useFiltrosComunes();
  const [page, setPage] = useState(1);
  const [estadoReceptor, setEstadoReceptor] = useState<XlinkEstadoReceptor | undefined>();

  const { data, isFetching } = useQuery({
    queryKey: ['xlink-enviados', page, f.rango[0].format('YYYY-MM-DD'), f.rango[1].format('YYYY-MM-DD'), f.numeroOrigen, f.ncfOrigen, f.tipoDocumento, estadoReceptor],
    queryFn: () => xlinkApi.listarEnviados({
      page,
      desde: f.rango[0].format('YYYY-MM-DD'), hasta: f.rango[1].format('YYYY-MM-DD'),
      numeroOrigen: f.numeroOrigen || undefined, ncfOrigen: f.ncfOrigen || undefined, tipoDocumento: f.tipoDocumento, estadoReceptor,
    }),
    placeholderData: (prev) => prev,
  });

  const filas = useMemo(() => filtrarPorRelacionado(data?.data ?? [], f.relacionado), [data, f.relacionado]);

  const eliminarMut = useMutation({
    mutationFn: (id: number) => xlinkApi.eliminarEnviado(id),
    onSuccess: () => { message.success('Envío retirado'); qc.invalidateQueries({ queryKey: ['xlink-enviados'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo retirar el envío'),
  });

  const ESTADO_TAG: Record<XlinkEstadoReceptor, { color: string; label: string }> = {
    pendiente: { color: 'blue', label: 'Pendiente' },
    procesado: { color: 'green', label: 'Procesado' },
    procesado_manual: { color: 'green', label: 'Procesado (manual)' },
    descartado: { color: 'red', label: 'Descartado' },
    anulado_en_origen: { color: 'default', label: 'Anulado en origen' },
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <FiltrosBar f={f} />
        <Select placeholder="Estado" allowClear style={{ width: 160 }} value={estadoReceptor} onChange={setEstadoReceptor} options={Object.entries(ESTADO_TAG).map(([value, v]) => ({ value, label: v.label }))} />
      </Space>
      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={filas}
        pagination={{ current: page, pageSize: 10, total: data?.meta?.total ?? 0, onChange: setPage }}
        columns={[
          { title: 'Empresa', dataIndex: 'contraparteNombre' },
          { title: 'Tipo', dataIndex: 'tipoDocumento', render: (v: XlinkTipoDocumento) => tipoDocumentoLabel(v) },
          { title: 'Número', dataIndex: 'numeroOrigen' },
          { title: 'NCF', dataIndex: 'ncfOrigen', render: (v) => v ?? '—' },
          { title: 'Total', dataIndex: 'totalOrigen', render: (v) => fmt.money(v) },
          { title: 'Estado', dataIndex: 'estadoReceptor', render: (v: XlinkEstadoReceptor) => <Tag color={ESTADO_TAG[v]?.color}>{ESTADO_TAG[v]?.label ?? v}</Tag> },
          {
            title: '',
            render: (_: unknown, r: XlinkDocumentoFila) => r.estadoReceptor === 'pendiente' ? (
              <Popconfirm title="¿Retirar este envío?" onConfirm={() => eliminarMut.mutate(r.id)}>
                <Button size="small" danger>Retirar</Button>
              </Popconfirm>
            ) : null,
          },
        ]}
      />
    </div>
  );
}
