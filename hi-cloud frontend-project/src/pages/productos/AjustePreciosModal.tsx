import { useState, useMemo } from 'react';
import {
  Modal, Select, Radio, Button, Table, Tag, Alert, Space, Typography, Tooltip, Empty,
} from 'antd';
import { useMutation } from '@tanstack/react-query';
import { CalculatorOutlined, WarningOutlined } from '@ant-design/icons';
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
  const [categoria, setCategoria] = useState<string | undefined>();
  const [marca,     setMarca]     = useState<string | undefined>();
  const [usarSeleccion, setUsarSeleccion] = useState<boolean>(!!seleccionIds?.length);
  const [modo,      setModo]      = useState<ModoRedondeo>('entero');
  const [direccion, setDireccion] = useState<DireccionRedondeo>('cercano');
  const [resultado, setResultado] = useState<PreviewAjusteResp | null>(null);
  // filas desmarcadas por el usuario (excluidas del futuro "aplicar")
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());

  const preview = useMutation({
    mutationFn: () => productosApi.previewAjustePrecios({
      ...(usarSeleccion && seleccionIds?.length ? { productoIds: seleccionIds } : {}),
      ...(!usarSeleccion && categoria ? { categoria } : {}),
      ...(!usarSeleccion && marca     ? { marca }     : {}),
      modo, direccion,
    }),
    onSuccess: (r) => { setResultado(r); setExcluidas(new Set()); },
  });

  const hayFiltro = usarSeleccion ? !!seleccionIds?.length : (!!categoria || !!marca);

  // Solo las filas verificadas y marcadas cuentan para aplicar
  const seleccionadas = useMemo(
    () => (resultado?.filas ?? []).filter(f => f.verificado && !excluidas.has(f.id) && f.diferencia !== 0),
    [resultado, excluidas],
  );

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
    <Modal open={open} onCancel={onClose} width={1150} title="Ajustar precios al público"
      footer={[
        <Button key="cerrar" onClick={onClose}>Cerrar</Button>,
        <Tooltip key="aplicar" title="Aún no implementado — primero revisamos el preview">
          <Button type="primary" disabled>
            Aplicar a {seleccionadas.length} producto{seleccionadas.length === 1 ? '' : 's'}
          </Button>
        </Tooltip>,
      ]}>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Esto solo calcula la propuesta: todavía no modifica ningún precio."
        description="El precio al público es base × (1 + ITBIS). Se elige el precio final deseado y el sistema despeja la base que lo produce, verificando que el viaje de vuelta dé exactamente ese precio." />

      {/* ── Conjunto ───────────────────────────────────────────────── */}
      <Space wrap style={{ marginBottom: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Productos:</Text>
        {!!seleccionIds?.length && (
          <Radio.Group size="small" value={usarSeleccion} onChange={e => setUsarSeleccion(e.target.value)}>
            <Radio.Button value={true}>Selección ({seleccionIds.length})</Radio.Button>
            <Radio.Button value={false}>Por filtro</Radio.Button>
          </Radio.Group>
        )}
        {!usarSeleccion && (
          <>
            <Select allowClear placeholder="Categoría" style={{ width: 190 }} value={categoria}
              onChange={setCategoria} options={categorias.map(c => ({ value: c, label: c }))} />
            <Select allowClear placeholder="Marca" style={{ width: 190 }} value={marca}
              onChange={setMarca} options={marcas.map(m => ({ value: m, label: m }))} />
          </>
        )}
      </Space>

      {/* ── Política de redondeo ───────────────────────────────────── */}
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
        <Button type="primary" icon={<CalculatorOutlined />} disabled={!hayFiltro}
          loading={preview.isPending} onClick={() => preview.mutate()}>
          Calcular
        </Button>
      </Space>

      {!hayFiltro && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="Elige una categoría, una marca o marca productos en la tabla — el catálogo completo no se ajusta de una vez." />
      )}

      {/* ── Preview ────────────────────────────────────────────────── */}
      {resultado && (
        resultado.aviso ? <Alert type="warning" showIcon message={resultado.aviso} />
        : resultado.filas.length === 0
          ? <Empty description="Ningún producto de ese conjunto cambia de precio" />
          : (
            <>
              <Space style={{ marginBottom: 8 }} wrap>
                <Tag color="blue">{resultado.total} revisados</Tag>
                <Tag color="green">{resultado.conCambio} cambian</Tag>
                {resultado.excluidas > 0 && (
                  <Tag color="warning">{resultado.excluidas} excluidos (la base no reproduce el precio)</Tag>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Se aplicarán {seleccionadas.length} — desmarca las filas que quieras dejar como están
                </Text>
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
                    const marcadas = new Set(keys as number[]);
                    setExcluidas(new Set(
                      resultado.filas.filter(f => !marcadas.has(f.id)).map(f => f.id),
                    ));
                  },
                  getCheckboxProps: (r) => ({
                    disabled: !r.verificado || r.diferencia === 0,
                  }),
                }}
              />
            </>
          )
      )}
    </Modal>
  );
}
