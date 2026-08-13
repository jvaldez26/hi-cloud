import { useState, useMemo } from 'react';
import {
  Modal, Select, Radio, Button, Table, Tag, Alert, Space, Typography, Tooltip,
  Empty, Input, InputNumber, Switch, Divider,
} from 'antd';
import { useMutation } from '@tanstack/react-query';
import {
  CalculatorOutlined, WarningOutlined, CheckSquareOutlined, BorderOutlined,
} from '@ant-design/icons';
import {
  productosApi, type ModoRedondeo, type DireccionRedondeo,
  type FilaAjusteProducto, type PreviewAjusteResp,
} from '../../api/productos.api';
import { fmt } from '../../utils/formatters';

const { Text } = Typography;

/**
 * Ajuste de precios AL PÚBLICO.
 *
 * Muchos productos se cargaron tecleando la base en vez del precio al público,
 * así que 339.00 × 1.18 = 400.02 en vez de 400.00. Aquí se elige el precio
 * final deseado y el sistema despeja la base que lo produce.
 *
 * Esta pantalla es SOLO PREVIEW: calcula y muestra: no escribe nada todavía.
 */
export default function AjustePreciosModal({
  open, onClose, categorias, marcas, seleccionIds,
}: {
  open: boolean;
  onClose: () => void;
  categorias: string[];
  marcas: string[];
  /** ids marcados en la tabla de productos, si los hay */
  seleccionIds?: number[];
}) {
  // ── Scope / conjunto ─────────────────────────────────────────────────────────
  const tieneSeleccion = !!seleccionIds?.length;
  const [usarSeleccion,       setUsarSeleccion]     = useState(tieneSeleccion);

  // Filtros de scope (activos cuando !usarSeleccion)
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

  // ── Resultado ────────────────────────────────────────────────────────────────
  const [resultado, setResultado] = useState<PreviewAjusteResp | null>(null);
  /** Ids excluidos manualmente por el usuario en el preview. */
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());

  // ── Computados ───────────────────────────────────────────────────────────────
  /**
   * Filas verificadas que cambiarían de precio y no están excluidas.
   * Se calcula sobre el conjunto COMPLETO de resultado.filas, no sobre la página
   * visible, para que el contador del botón Aplicar siempre sea exacto.
   */
  const seleccionadas = useMemo(
    () => (resultado?.filas ?? []).filter(f => f.verificado && !excluidas.has(f.id) && f.diferencia !== 0),
    [resultado, excluidas],
  );
  const todasVerificadas = useMemo(
    () => (resultado?.filas ?? []).filter(f => f.verificado && f.diferencia !== 0),
    [resultado],
  );

  // ── Preview ──────────────────────────────────────────────────────────────────
  const preview = useMutation({
    mutationFn: () => productosApi.previewAjustePrecios({
      // scope
      ...(usarSeleccion && tieneSeleccion
        ? { productoIds: seleccionIds }
        : {
          ...(soloNoRedondos           ? { soloNoRedondos: true }              : {}),
          ...(categoria                ? { categoria }                          : {}),
          ...(marca                    ? { marca }                              : {}),
          ...(busqueda.trim()          ? { busqueda: busqueda.trim() }          : {}),
          ...(soloConExistencia        ? { soloConExistencia: true }            : {}),
          ...(vendidosMeses            ? { vendidosUltimosMeses: vendidosMeses }: {}),
          ...(precioMin != null        ? { precioMin }                          : {}),
          ...(precioMax != null        ? { precioMax }                          : {}),
          ...(todoElCatalogo           ? { todoElCatalogo: true }               : {}),
        }
      ),
      modo, direccion,
    }),
    onSuccess: (r) => { setResultado(r); setExcluidas(new Set()); },
  });

  // ── Columnas de la tabla ─────────────────────────────────────────────────────
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

  return (
    <Modal open={open} onCancel={onClose} width={1200} title="Ajustar precios al público"
      footer={[
        <Button key="cerrar" onClick={onClose}>Cerrar</Button>,
        <Tooltip key="aplicar"
          title={
            resultado?.esGrande && seleccionadas.length > 500
              ? `Conjunto grande (${seleccionadas.length} productos) — escribe la cantidad para confirmar`
              : 'Aún no implementado — primero revisamos el preview'
          }>
          <Button type="primary" disabled>
            Aplicar a {seleccionadas.length.toLocaleString()} producto{seleccionadas.length === 1 ? '' : 's'}
          </Button>
        </Tooltip>,
      ]}>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Esto solo calcula la propuesta: todavía no modifica ningún precio."
        description="El precio al público es base × (1 + ITBIS). Se elige el precio final deseado y el sistema despeja la base que lo produce, verificando que el viaje de vuelta dé exactamente ese precio." />

      {/* ── Conjunto ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
        <Space wrap align="start" style={{ width: '100%' }}>

          {/* Selección manual (solo si hay items marcados en la tabla) */}
          {tieneSeleccion && (
            <div>
              <Radio.Group size="small" value={usarSeleccion} onChange={e => setUsarSeleccion(e.target.value)}>
                <Radio.Button value={true}>Selección ({seleccionIds!.length})</Radio.Button>
                <Radio.Button value={false}>Filtros</Radio.Button>
              </Radio.Group>
            </div>
          )}

          {/* Filtros de scope */}
          {!usarSeleccion && (
            <Space wrap align="center">
              {/* Filtro estrella: precios no redondos */}
              <Space size={6}>
                <Switch
                  size="small"
                  checked={soloNoRedondos}
                  onChange={v => { setSoloNoRedondos(v); if (v) setTodoElCatalogo(false); }}
                />
                <Text style={{ fontSize: 12 }}>
                  Solo precios no redondos
                  <Text type="secondary" style={{ fontSize: 11 }}> (recomendado)</Text>
                </Text>
              </Space>

              <Divider type="vertical" />

              {/* Categoría y marca */}
              <Select allowClear placeholder="Categoría" style={{ width: 170 }} size="small"
                value={categoria} onChange={setCategoria}
                options={categorias.map(c => ({ value: c, label: c }))} />
              <Select allowClear placeholder="Marca" style={{ width: 155 }} size="small"
                value={marca} onChange={setMarca}
                options={marcas.map(m => ({ value: m, label: m }))} />

              <Divider type="vertical" />

              {/* Búsqueda */}
              <Input.Search
                placeholder="Nombre o código"
                allowClear
                size="small"
                style={{ width: 180 }}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onSearch={() => {}}
              />

              {/* Precio final rango */}
              <Space size={4}>
                <Text style={{ fontSize: 12 }}>$</Text>
                <InputNumber
                  size="small" placeholder="Precio mín" style={{ width: 110 }}
                  min={0} value={precioMin}
                  onChange={v => setPrecioMin(v ?? undefined)}
                  formatter={v => v ? `${v}` : ''} />
                <Text style={{ fontSize: 12 }}>–</Text>
                <InputNumber
                  size="small" placeholder="Precio máx" style={{ width: 110 }}
                  min={0} value={precioMax}
                  onChange={v => setPrecioMax(v ?? undefined)}
                  formatter={v => v ? `${v}` : ''} />
              </Space>

              <Divider type="vertical" />

              {/* Solo con existencia */}
              <Space size={6}>
                <Switch size="small" checked={soloConExistencia} onChange={setSoloConExistencia} />
                <Text style={{ fontSize: 12 }}>Con existencia</Text>
              </Space>

              {/* Vendidos últimos N meses */}
              <Space size={6}>
                <Text style={{ fontSize: 12 }}>Vendidos en los últimos</Text>
                <InputNumber
                  size="small" min={1} max={36} style={{ width: 60 }}
                  value={vendidosMeses}
                  onChange={v => setVendidosMeses(v ?? undefined)}
                  placeholder="N" />
                <Text style={{ fontSize: 12 }}>meses</Text>
              </Space>

              <Divider type="vertical" />

              {/* Todo el catálogo — opt-in explícito */}
              <Tooltip title="Procesa todo el catálogo sin ningún filtro de scope. Nunca es el default.">
                <Space size={6}>
                  <Switch
                    size="small"
                    checked={todoElCatalogo}
                    onChange={v => { setTodoElCatalogo(v); if (v) setSoloNoRedondos(false); }}
                  />
                  <Text style={{ fontSize: 12, color: todoElCatalogo ? '#D97706' : undefined }}>
                    Todo el catálogo
                  </Text>
                </Space>
              </Tooltip>
            </Space>
          )}
        </Space>
      </div>

      {/* ── Política de redondeo ────────────────────────────────────────────── */}
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
          <Button size="small" onClick={() => { setResultado(null); setExcluidas(new Set()); }}>
            Limpiar resultado
          </Button>
        )}
      </Space>

      {/* ── Preview ─────────────────────────────────────────────────────────── */}
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
                <Tag color="orange">⚠ Conjunto grande — revisa bien antes de aplicar</Tag>
              )}

              <Divider type="vertical" />

              {/* Selección cross-page: los botones operan sobre TODO el resultado, no la página */}
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
                selectedRowKeys: resultado.filas
                  .filter(f => f.verificado && !excluidas.has(f.id) && f.diferencia !== 0)
                  .map(f => f.id),
                onChange: (keys) => {
                  /* keys contiene TODOS los seleccionados en TODAS las páginas */
                  const marcadas = new Set(keys as number[]);
                  setExcluidas(new Set(
                    resultado.filas.filter(f => !marcadas.has(f.id)).map(f => f.id),
                  ));
                },
                getCheckboxProps: (r) => ({
                  disabled: !r.verificado || r.diferencia === 0,
                }),
                /*
                 * selections agrega un menú desplegable al header checkbox con
                 * "Seleccionar todo" que abarca TODAS las páginas, no solo la visible.
                 */
                selections: [
                  {
                    key: 'select-all-pages',
                    text: `Seleccionar todos (${todasVerificadas.length.toLocaleString()})`,
                    onSelect: () => setExcluidas(new Set()),
                  },
                  {
                    key: 'deselect-all-pages',
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
