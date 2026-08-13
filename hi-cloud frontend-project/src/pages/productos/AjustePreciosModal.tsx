import { useState, useMemo } from 'react';
import {
  Modal, Select, Radio, Button, Table, Tag, Alert, Space, Typography, Tooltip,
  Empty, Input, InputNumber, Switch, Divider, message,
} from 'antd';
import { useMutation } from '@tanstack/react-query';
import {
  CalculatorOutlined, WarningOutlined, CheckSquareOutlined, BorderOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  productosApi, type ModoRedondeo, type DireccionRedondeo,
  type FilaAjusteProducto, type PreviewAjusteResp,
} from '../../api/productos.api';
import { fmt } from '../../utils/formatters';

const { Text } = Typography;
const { confirm } = Modal;

/**
 * Ajuste de precios AL PÚBLICO.
 *
 * Muchos productos se cargaron tecleando la base en vez del precio al público,
 * así que 339.00 × 1.18 = 400.02 en vez de 400.00. Aquí se elige el precio
 * final deseado y el sistema despeja la base que lo produce.
 */
export default function AjustePreciosModal({
  open, onClose, onApplied, categorias, marcas, seleccionIds,
}: {
  open:        boolean;
  onClose:     () => void;
  /** Llamado tras aplicar exitosamente — el padre puede invalidar el query de productos. */
  onApplied?:  () => void;
  categorias:  string[];
  marcas:      string[];
  seleccionIds?: number[];
}) {
  // ── Scope / conjunto ─────────────────────────────────────────────────────────
  const tieneSeleccion = !!seleccionIds?.length;
  const [usarSeleccion,       setUsarSeleccion]     = useState(tieneSeleccion);

  const [soloNoRedondos,      setSoloNoRedondos]    = useState(!tieneSeleccion);
  const [categoria,           setCategoria]         = useState<string | undefined>();
  const [marca,               setMarca]             = useState<string | undefined>();
  const [busqueda,            setBusqueda]          = useState('');
  const [soloConExistencia,   setSoloConExistencia] = useState(false);
  const [vendidosMeses,       setVendidosMeses]     = useState<number | undefined>();
  const [precioMin,           setPrecioMin]         = useState<number | undefined>();
  const [precioMax,           setPrecioMax]         = useState<number | undefined>();
  const [todoElCatalogo,      setTodoElCatalogo]    = useState(false);

  // ── Política de redondeo ─────────────────────────────────────────────────────
  const [modo,      setModo]      = useState<ModoRedondeo>('entero');
  const [direccion, setDireccion] = useState<DireccionRedondeo>('cercano');

  // ── Resultado + selección ────────────────────────────────────────────────────
  const [resultado, setResultado] = useState<PreviewAjusteResp | null>(null);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());

  // ── Confirmación para conjuntos grandes (> 500) ──────────────────────────────
  const [confirmando,   setConfirmando]   = useState(false);
  const [confirmInput,  setConfirmInput]  = useState('');

  // ── Computados ───────────────────────────────────────────────────────────────
  const todasVerificadas = useMemo(
    () => (resultado?.filas ?? []).filter(f => f.verificado && f.diferencia !== 0),
    [resultado],
  );
  const seleccionadas = useMemo(
    () => todasVerificadas.filter(f => !excluidas.has(f.id)),
    [todasVerificadas, excluidas],
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const preview = useMutation({
    mutationFn: () => productosApi.previewAjustePrecios({
      ...(usarSeleccion && tieneSeleccion
        ? { productoIds: seleccionIds }
        : {
          ...(soloNoRedondos           ? { soloNoRedondos: true }               : {}),
          ...(categoria                ? { categoria }                           : {}),
          ...(marca                    ? { marca }                               : {}),
          ...(busqueda.trim()          ? { busqueda: busqueda.trim() }           : {}),
          ...(soloConExistencia        ? { soloConExistencia: true }             : {}),
          ...(vendidosMeses            ? { vendidosUltimosMeses: vendidosMeses } : {}),
          ...(precioMin != null        ? { precioMin }                           : {}),
          ...(precioMax != null        ? { precioMax }                           : {}),
          ...(todoElCatalogo           ? { todoElCatalogo: true }                : {}),
        }
      ),
      modo, direccion,
    }),
    onSuccess: (r) => { setResultado(r); setExcluidas(new Set()); setConfirmando(false); },
  });

  const aplicar = useMutation({
    mutationFn: () => productosApi.aplicarAjustePrecios({
      filas: seleccionadas.map(f => ({
        id:        f.id,
        baseNueva: f.baseNueva,
        ...(f.precio2 && f.precio2.diferencia !== 0 ? { precio2Nueva: f.precio2.baseNueva } : {}),
        ...(f.precio3 && f.precio3.diferencia !== 0 ? { precio3Nueva: f.precio3.baseNueva } : {}),
      })),
    }),
    onSuccess: (r) => {
      message.success(`${r.actualizados} precio${r.actualizados === 1 ? '' : 's'} actualizado${r.actualizados === 1 ? '' : 's'} correctamente`);
      setResultado(null);
      setExcluidas(new Set());
      setConfirmando(false);
      setConfirmInput('');
      onApplied?.();
      onClose();
    },
    onError: (e: any) => {
      const detalle = e?.response?.data?.message ?? e?.message ?? 'Error desconocido';
      message.error(`No se pudo aplicar: ${detalle}`);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleAplicar = () => {
    if (seleccionadas.length === 0) return;
    if (seleccionadas.length > 500) {
      // Pide escribir el número exacto de productos antes de aplicar
      setConfirmando(true);
      setConfirmInput('');
    } else {
      confirm({
        title: `¿Aplicar cambios a ${seleccionadas.length} producto${seleccionadas.length === 1 ? '' : 's'}?`,
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>Se actualizará el precio base de {seleccionadas.length} productos. Esta acción no se puede deshacer desde aquí.</p>
            <p style={{ color: '#6B7280', fontSize: 12 }}>
              El precio al público en tickets ya emitidos no cambia — solo afecta nuevas ventas.
            </p>
          </div>
        ),
        okText:     'Sí, aplicar',
        cancelText: 'Cancelar',
        okType:     'primary',
        onOk:       () => aplicar.mutate(),
      });
    }
  };

  // ── Columnas ──────────────────────────────────────────────────────────────────
  const columnas = [
    { title: 'Código', dataIndex: 'codigo', width: 110,
      render: (v: string) => v || <Text type="secondary">—</Text> },
    { title: 'Producto', dataIndex: 'nombre', ellipsis: true },
    { title: 'ITBIS', dataIndex: 'porcentajeIva', width: 70, align: 'right' as const,
      render: (v: number) => `${v}%` },
    { title: 'Al público hoy', dataIndex: 'precioFinalActual', width: 120, align: 'right' as const,
      render: (v: number) => fmt.money(v) },
    { title: 'Al público nuevo', dataIndex: 'precioFinalPropuesto', width: 130, align: 'right' as const,
      render: (v: number, r: FilaAjusteProducto) => (
        <Text strong style={{ color: r.verificado ? '#15803D' : '#94A3B8' }}>{fmt.money(v)}</Text>
      ) },
    { title: 'Diferencia', dataIndex: 'diferencia', width: 100, align: 'right' as const,
      render: (v: number) => (
        <Text style={{ color: v > 0 ? '#B45309' : v < 0 ? '#1D4ED8' : '#94A3B8' }}>
          {v > 0 ? '+' : ''}{v.toFixed(2)}
        </Text>
      ) },
    { title: 'Base actual', dataIndex: 'baseActual', width: 110, align: 'right' as const,
      render: (v: number) => <Text type="secondary">{Number(v).toFixed(4)}</Text> },
    { title: 'Base nueva', dataIndex: 'baseNueva', width: 110, align: 'right' as const,
      render: (v: number, r: FilaAjusteProducto) => r.verificado
        ? <Text>{Number(v).toFixed(4)}</Text>
        : <Tooltip title={r.motivoExclusion}>
            <Tag icon={<WarningOutlined />} color="warning">excluida</Tag>
          </Tooltip> },
    { title: 'P2 / P3', width: 120, align: 'right' as const,
      render: (_: unknown, r: FilaAjusteProducto) => (
        <Space direction="vertical" size={0}>
          {r.precio2 && <Text style={{ fontSize: 11 }}>
            P2 {fmt.money(r.precio2.precioFinalActual)} → {fmt.money(r.precio2.precioFinalPropuesto)}
          </Text>}
          {r.precio3 && <Text style={{ fontSize: 11 }}>
            P3 {fmt.money(r.precio3.precioFinalActual)} → {fmt.money(r.precio3.precioFinalPropuesto)}
          </Text>}
          {!r.precio2 && !r.precio3 && <Text type="secondary">—</Text>}
        </Space>
      ) },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onCancel={onClose} width={1200} title="Ajustar precios al público"
      footer={
        confirmando ? (
          // Confirmación especial para conjuntos grandes (>500 productos)
          <Space align="center" style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Text type="warning">
              Escribe <Text strong>{seleccionadas.length}</Text> para confirmar:
            </Text>
            <Input
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              style={{ width: 90 }}
              placeholder={String(seleccionadas.length)}
            />
            <Button onClick={() => { setConfirmando(false); setConfirmInput(''); }}>
              Cancelar
            </Button>
            <Button
              type="primary" danger
              loading={aplicar.isPending}
              disabled={confirmInput !== String(seleccionadas.length)}
              onClick={() => aplicar.mutate()}>
              Confirmar — aplicar a {seleccionadas.length.toLocaleString()} productos
            </Button>
          </Space>
        ) : (
          [
            <Button key="cerrar" onClick={onClose}>Cerrar</Button>,
            <Button
              key="aplicar"
              type="primary"
              loading={aplicar.isPending}
              disabled={seleccionadas.length === 0 || !resultado || !!resultado.aviso}
              onClick={handleAplicar}>
              Aplicar a {seleccionadas.length.toLocaleString()} producto{seleccionadas.length === 1 ? '' : 's'}
            </Button>,
          ]
        )
      }>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Esto actualiza la base imponible de cada producto. El precio al público de tickets ya emitidos no cambia."
        description="El precio al público es base × (1 + ITBIS). Se elige el precio final deseado y el sistema despeja la base que lo produce, verificando que el viaje de vuelta dé exactamente ese precio." />

      {/* ── Conjunto ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
        <Space wrap align="center" style={{ width: '100%' }}>

          {tieneSeleccion && (
            <Radio.Group size="small" value={usarSeleccion} onChange={e => setUsarSeleccion(e.target.value)}>
              <Radio.Button value={true}>Selección ({seleccionIds!.length})</Radio.Button>
              <Radio.Button value={false}>Filtros</Radio.Button>
            </Radio.Group>
          )}

          {!usarSeleccion && (
            <Space wrap align="center">
              <Space size={6}>
                <Switch size="small" checked={soloNoRedondos}
                  onChange={v => { setSoloNoRedondos(v); if (v) setTodoElCatalogo(false); }} />
                <Text style={{ fontSize: 12 }}>
                  Solo precios no redondos
                  <Text type="secondary" style={{ fontSize: 11 }}> (recomendado)</Text>
                </Text>
              </Space>

              <Divider type="vertical" />

              <Select allowClear placeholder="Categoría" style={{ width: 170 }} size="small"
                value={categoria} onChange={setCategoria}
                options={categorias.map(c => ({ value: c, label: c }))} />
              <Select allowClear placeholder="Marca" style={{ width: 155 }} size="small"
                value={marca} onChange={setMarca}
                options={marcas.map(m => ({ value: m, label: m }))} />

              <Divider type="vertical" />

              <Input.Search placeholder="Nombre o código" allowClear size="small"
                style={{ width: 180 }} value={busqueda}
                onChange={e => setBusqueda(e.target.value)} onSearch={() => {}} />

              <Space size={4}>
                <Text style={{ fontSize: 12 }}>RD$</Text>
                <InputNumber size="small" placeholder="Mín" style={{ width: 90 }}
                  min={0} value={precioMin} onChange={v => setPrecioMin(v ?? undefined)} />
                <Text style={{ fontSize: 12 }}>–</Text>
                <InputNumber size="small" placeholder="Máx" style={{ width: 90 }}
                  min={0} value={precioMax} onChange={v => setPrecioMax(v ?? undefined)} />
              </Space>

              <Divider type="vertical" />

              <Space size={6}>
                <Switch size="small" checked={soloConExistencia} onChange={setSoloConExistencia} />
                <Text style={{ fontSize: 12 }}>Con existencia</Text>
              </Space>

              <Space size={6}>
                <Text style={{ fontSize: 12 }}>Vendidos últimos</Text>
                <InputNumber size="small" min={1} max={36} style={{ width: 55 }}
                  value={vendidosMeses} onChange={v => setVendidosMeses(v ?? undefined)}
                  placeholder="N" />
                <Text style={{ fontSize: 12 }}>meses</Text>
              </Space>

              <Divider type="vertical" />

              <Tooltip title="Procesa todo el catálogo sin filtro de scope. Nunca es el default.">
                <Space size={6}>
                  <Switch size="small" checked={todoElCatalogo}
                    onChange={v => { setTodoElCatalogo(v); if (v) setSoloNoRedondos(false); }} />
                  <Text style={{ fontSize: 12, color: todoElCatalogo ? '#D97706' : undefined }}>
                    Todo el catálogo
                  </Text>
                </Space>
              </Tooltip>
            </Space>
          )}
        </Space>
      </div>

      {/* ── Política de redondeo ────────────────────────────────────────── */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 12 }}>Redondear a:</Text>
        <Select value={modo} style={{ width: 210 }} onChange={setModo} options={[
          { value: 'entero',        label: 'Peso entero (400)' },
          { value: 'multiplo5',     label: 'Múltiplo de 5 (405)' },
          { value: 'multiplo10',    label: 'Múltiplo de 10 (410)' },
          { value: 'terminacion95', label: 'Terminación .95' },
          { value: 'terminacion99', label: 'Terminación .99' },
        ]} />
        <Text strong style={{ fontSize: 12 }}>Dirección:</Text>
        <Radio.Group size="small" value={direccion} onChange={e => setDireccion(e.target.value)}>
          <Radio.Button value="cercano">Más cercano</Radio.Button>
          <Radio.Button value="arriba">Hacia arriba</Radio.Button>
          <Radio.Button value="abajo">Hacia abajo</Radio.Button>
        </Radio.Group>
        <Button type="primary" icon={<CalculatorOutlined />}
          loading={preview.isPending} onClick={() => preview.mutate()}>
          Calcular
        </Button>
        {resultado && (
          <Button size="small" onClick={() => { setResultado(null); setExcluidas(new Set()); setConfirmando(false); }}>
            Limpiar resultado
          </Button>
        )}
      </Space>

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      {resultado && (
        resultado.aviso ? (
          <Alert type="info" showIcon message={resultado.aviso} />
        ) : resultado.filas.length === 0 ? (
          <Empty description="Ningún producto de ese conjunto cambia de precio" />
        ) : (
          <>
            <Space style={{ marginBottom: 8 }} wrap align="center">
              <Tag color="blue">{resultado.total.toLocaleString()} revisados</Tag>
              <Tag color="green">{resultado.conCambio.toLocaleString()} cambian</Tag>
              {resultado.excluidas > 0 && (
                <Tag color="warning">{resultado.excluidas} excluidos (la base no reproduce el precio)</Tag>
              )}
              {resultado.esGrande && (
                <Tag color="orange">⚠ Conjunto grande — al aplicar deberás escribir el número</Tag>
              )}

              <Divider type="vertical" />

              <Text type="secondary" style={{ fontSize: 12 }}>
                Seleccionados{' '}
                <Text strong style={{ fontSize: 12 }}>{seleccionadas.length.toLocaleString()}</Text>
                {' de '}
                <Text strong style={{ fontSize: 12 }}>{todasVerificadas.length.toLocaleString()}</Text>
              </Text>
              <Button size="small" icon={<CheckSquareOutlined />}
                onClick={() => setExcluidas(new Set())}>
                Seleccionar todos
              </Button>
              <Button size="small" icon={<BorderOutlined />}
                onClick={() => setExcluidas(new Set(todasVerificadas.map(f => f.id)))}>
                Deseleccionar todos
              </Button>
            </Space>

            <Table<FilaAjusteProducto>
              rowKey="id" size="small" columns={columnas} dataSource={resultado.filas}
              pagination={{ pageSize: 25, showSizeChanger: true }}
              scroll={{ x: 1050, y: 380 }}
              rowSelection={{
                selectedRowKeys: todasVerificadas.filter(f => !excluidas.has(f.id)).map(f => f.id),
                onChange: (keys) => {
                  // keys contiene TODOS los seleccionados en TODAS las páginas
                  const marcadas = new Set(keys as number[]);
                  setExcluidas(new Set(
                    resultado.filas.filter(f => !marcadas.has(f.id)).map(f => f.id),
                  ));
                },
                getCheckboxProps: (r) => ({ disabled: !r.verificado || r.diferencia === 0 }),
                selections: [
                  {
                    key: 'sel-all',
                    text: `Seleccionar todos (${todasVerificadas.length.toLocaleString()})`,
                    onSelect: () => setExcluidas(new Set()),
                  },
                  {
                    key: 'desel-all',
                    text: 'Deseleccionar todos',
                    onSelect: () => setExcluidas(new Set(todasVerificadas.map(f => f.id))),
                  },
                ],
              }}
            />
          </>
        )
      )}
    </Modal>
  );
}
