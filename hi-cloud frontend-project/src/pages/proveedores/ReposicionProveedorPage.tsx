import { useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, InputNumber, Modal, Row, Select, Space,
  Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { desenvolverArray } from '../../api/desenvolver';
import { productoProveedorApi, type LineaReposicion } from '../../api/productoProveedor.api';
import { proveedoresApi } from '../../api/proveedores.api';
import { productosApi } from '../../api/productos.api';
import { comprasApi } from '../../api/compras.api';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

interface AlmacenLite { id: number; nombre: string }

/**
 * «Qué le falta a este proveedor».
 *
 * El caso: el proveedor llega al negocio y quien atiende quiere ver, de lo que
 * ese proveedor vende, qué falta AQUÍ — y pedirlo en el momento.
 *
 * ── Por qué el almacén es explícito y visible ────────────────────────────────
 * El proveedor está parado en una sucursal concreta, así que lo que importa es
 * la existencia de ESE almacén, no el total de la empresa. Un producto puede
 * estar sobrado en la empresa y agotado en el mostrador donde está el proveedor.
 * Por eso la cabecera dice siempre de qué almacén habla, y por eso cuando no hay
 * almacén resoluble se PREGUNTA en vez de caer al stock global: ese número es el
 * equivocado dicho con toda la confianza.
 */
export default function ReposicionProveedorPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const almacenDelUsuario = useAuthStore(s => s.almacenActual);

  const [proveedorId, setProveedorId] = useState<number | undefined>();
  const [almacenId,   setAlmacenId]   = useState<number | undefined>(almacenDelUsuario ?? undefined);
  const [seleccion,   setSeleccion]   = useState<number[]>([]);
  const [cantidades,  setCantidades]  = useState<Record<number, number>>({});
  const [modalAgregar, setModalAgregar] = useState(false);

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-reposicion'],
    queryFn:  () => proveedoresApi.list(1, 500, ''),
    staleTime: 5 * 60_000,
  });

  const { data: almacenes } = useQuery<AlmacenLite[]>({
    queryKey: ['almacenes-reposicion'],
    // desenvolverArray y no `r.data?.data ?? r.data ?? []`: ese patrón copiado a
    // mano es justo el que creó el helper ("T.map is not a function" tras un 200).
    queryFn:  () => api.get('/almacenes').then(desenvolverArray<AlmacenLite>),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reposicion-proveedor', proveedorId, almacenId],
    queryFn:  () => productoProveedorApi.reposicion(proveedorId!, almacenId),
    enabled:  !!proveedorId,
  });

  const lineas = data?.lineas ?? [];

  // El backend puede responder que no hay almacén con el que trabajar. No es un
  // error a esconder: es la señal de que hay que preguntar cuál.
  const faltaAlmacen =
    (error as any)?.response?.data?.codigo === 'ALMACEN_REQUERIDO' ||
    (error as any)?.response?.data?.errors?.[0] === 'ALMACEN_REQUERIDO';

  const almacenNombre = useMemo(
    () => almacenes?.find(a => a.id === (data?.almacenId ?? almacenId))?.nombre,
    [almacenes, data?.almacenId, almacenId],
  );

  const cantidadDe = (l: LineaReposicion) => cantidades[l.vinculoId] ?? l.cantidadSugerida;

  const seleccionadas = useMemo(
    () => lineas.filter(l => seleccion.includes(l.vinculoId)),
    [lineas, seleccion],
  );

  /**
   * Monedas presentes entre las líneas seleccionadas que traen precio.
   * Una compra tiene UNA sola moneda: si hay más de una, hay que elegir.
   */
  const monedasEnJuego = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of seleccionadas) {
      if (l.precioPactado == null) continue;
      m.set(l.monedaPactada, (m.get(l.monedaPactada) ?? 0) + 1);
    }
    return m;
  }, [seleccionadas]);

  const crearOrden = useMutation({
    mutationFn: async (moneda?: string) => {
      const incluidas = moneda
        ? seleccionadas.filter(l => l.precioPactado == null || l.monedaPactada === moneda)
        : seleccionadas;

      return comprasApi.create({
        proveedorId: proveedorId!,
        fecha:       new Date().toISOString().slice(0, 10),
        almacenId:   data?.almacenId ?? almacenId,
        moneda:      moneda ?? [...monedasEnJuego.keys()][0] ?? 'DOP',
        detalles: incluidas.map(l => ({
          productoId:     l.productoId,
          cantidad:       cantidadDe(l),
          precioUnitario: l.precioPactado ?? 0,
        })),
      });
    },
    onSuccess: (compra: any) => {
      message.success(`Orden ${compra?.folio ?? ''} creada en borrador`);
      qc.invalidateQueries({ queryKey: ['reposicion-proveedor'] });
      setSeleccion([]);
      navigate(`/compras/${compra.id}`);
    },
    onError: () => message.error('No se pudo crear la orden de compra.'),
  });

  /**
   * Nada de convertir por detrás: si hay monedas mezcladas se dice cuáles son y
   * se obliga a elegir una, con el conteo de líneas de cada una para que la
   * decisión sea informada.
   */
  const generar = () => {
    if (seleccionadas.length === 0) return;

    if (monedasEnJuego.size > 1) {
      const opciones = [...monedasEnJuego.entries()];
      Modal.confirm({
        title: 'Las líneas tienen precios en monedas distintas',
        width: 460,
        content: (
          <div>
            <p style={{ marginTop: 8 }}>
              Una orden de compra usa una sola moneda. Elige con cuál generarla —
              no se convierte ningún precio automáticamente.
            </p>
            <ul style={{ paddingLeft: 18 }}>
              {opciones.map(([m, n]) => (
                <li key={m}><b>{m}</b>: {n} línea{n === 1 ? '' : 's'}</li>
              ))}
            </ul>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Las líneas sin precio se incluyen en cualquier caso. Para las de la otra
              moneda, genera una segunda orden.
            </Text>
          </div>
        ),
        okText: `Usar ${opciones[0][0]}`,
        cancelText: 'Cancelar',
        onOk: () => crearOrden.mutate(opciones[0][0]),
      });
      return;
    }

    crearOrden.mutate([...monedasEnJuego.keys()][0]);
  };

  const columnas = [
    { title: 'Código', dataIndex: 'codigo', width: 110, ellipsis: true },
    {
      title: 'Producto', dataIndex: 'nombre', ellipsis: true,
      render: (v: string, r: LineaReposicion) => (
        <Space size={4}>
          {v}
          {r.esPreferente && <Tag color="gold" style={{ marginInlineEnd: 0 }}>Preferente</Tag>}
        </Space>
      ),
    },
    {
      title: 'Cód. proveedor', dataIndex: 'codigoProveedor', width: 130, ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Existencia', dataIndex: 'existencia', width: 110, align: 'right' as const,
      render: (v: number, r: LineaReposicion) => (
        <span style={{ color: v <= 0 ? '#ef4444' : undefined, fontWeight: v <= 0 ? 600 : 400 }}>
          {v} <Text type="secondary" style={{ fontSize: 11 }}>{r.unidadMedida}</Text>
        </span>
      ),
    },
    {
      title: 'Mínimo', dataIndex: 'minimo', width: 130, align: 'right' as const,
      // Decir de qué mínimo habla no es un detalle: stock_almacen."stockMinimo"
      // es 0 por defecto, así que sin esta marca un "no falta nada" por mínimo
      // sin configurar parecería un dato y es una ausencia.
      render: (v: number, r: LineaReposicion) => (
        <Space size={4}>
          {v}
          {r.origenMinimo === 'almacen' && (
            <Tooltip title="Mínimo definido para este almacén"><Tag color="blue">alm.</Tag></Tooltip>
          )}
          {r.origenMinimo === 'producto' && (
            <Tooltip title="Este almacén no tiene mínimo propio: se usa el del producto">
              <Tag>prod.</Tag>
            </Tooltip>
          )}
          {r.origenMinimo === 'sin-configurar' && (
            <Tooltip title="Sin mínimo configurado — por eso no se calcula faltante">
              <Tag color="orange">sin mín.</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Faltan', dataIndex: 'faltante', width: 90, align: 'right' as const,
      render: (v: number) => v > 0
        ? <b style={{ color: '#ef4444' }}>{v}</b>
        : <Text type="secondary">0</Text>,
    },
    {
      title: 'Pedir', key: 'pedir', width: 150, align: 'right' as const,
      render: (_: unknown, r: LineaReposicion) => (
        <Space size={4}>
          <InputNumber
            min={0} step={1} size="small" style={{ width: 84 }}
            value={cantidadDe(r)}
            onChange={v => setCantidades(p => ({ ...p, [r.vinculoId]: Number(v ?? 0) }))}
          />
          {r.origenSugerencia === 'plan' && (
            <Tooltip title="Sugerido por planeación de demanda, no solo por el mínimo">
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>plan</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Precio', key: 'precio', width: 150, align: 'right' as const,
      render: (_: unknown, r: LineaReposicion) => {
        if (r.precioPactado == null) return <Text type="secondary">—</Text>;
        return (
          <Space size={4}>
            <span>{r.monedaPactada} {r.precioPactado.toFixed(2)}</span>
            {r.precioEsEstimado && (
              <Tooltip
                title={`Último costo pagado${r.precioPactadoAt ? ` (${r.precioPactadoAt})` : ''}. ` +
                       'No es un precio pactado hasta que alguien lo confirme.'}
              >
                <Tag color="default" style={{ marginInlineEnd: 0 }}>est.</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Entrega', dataIndex: 'diasEntrega', width: 90, align: 'right' as const,
      render: (v: number | null) => v != null ? `${v} d` : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Title level={4} style={{ marginBottom: 4 }}>Reposición por proveedor</Title>
      <Text type="secondary">
        Qué le falta comprarle a este proveedor{' '}
        {almacenNombre
          ? <>en <b>{almacenNombre}</b></>
          : <>en el almacén seleccionado</>}.
      </Text>

      <Card size="small" style={{ marginTop: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10}>
            <Select
              showSearch optionFilterProp="label" allowClear
              style={{ width: '100%' }}
              placeholder="Elegir proveedor…"
              value={proveedorId}
              onChange={v => { setProveedorId(v); setSeleccion([]); setCantidades({}); }}
              options={(proveedores?.data ?? []).map((p) => ({ value: p.id, label: p.nombre }))}
            />
          </Col>
          <Col xs={24} md={8}>
            <Select
              showSearch optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Almacén…"
              value={almacenId}
              onChange={setAlmacenId}
              status={faltaAlmacen && !almacenId ? 'error' : undefined}
              options={(almacenes ?? []).map(a => ({ value: a.id, label: a.nombre }))}
            />
          </Col>
          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalAgregar(true)} disabled={!proveedorId}>
                Agregar productos
              </Button>
              <Button
                type="primary"
                disabled={seleccionadas.length === 0}
                loading={crearOrden.isPending}
                onClick={generar}
              >
                Generar orden ({seleccionadas.length})
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {faltaAlmacen && (
        <Alert
          type="warning" showIcon style={{ marginTop: 12 }}
          message="Elige un almacén"
          description={
            'Tu usuario no tiene un almacén asociado. Las existencias y los mínimos ' +
            'dependen del almacén, así que hay que decir cuál — no se muestra el ' +
            'total de la empresa porque no es el número que necesitas para pedir.'
          }
        />
      )}

      {!proveedorId && (
        <Card style={{ marginTop: 12 }}>
          <Empty description="Elige un proveedor para ver qué le falta" />
        </Card>
      )}

      {proveedorId && !faltaAlmacen && (
        <Card size="small" style={{ marginTop: 12 }}>
          <Table
            rowKey="vinculoId"
            size="small"
            loading={isLoading}
            dataSource={lineas}
            columns={columnas as any}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: 50, showSizeChanger: true }}
            rowSelection={{
              selectedRowKeys: seleccion,
              onChange: keys => setSeleccion(keys as number[]),
              getCheckboxProps: (r: LineaReposicion) => ({
                // Se puede pedir algo que no falta (reponer antes de tiempo), pero
                // no tiene sentido preseleccionarlo.
                name: r.nombre,
              }),
            }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    <div>
                      <div>Este proveedor no tiene productos vinculados todavía.</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Se llenan solos al recibir compras suyas. Para lo que aún no le
                        has comprado, agrégalos a mano.
                      </Text>
                    </div>
                  }
                >
                  <Button type="primary" onClick={() => setModalAgregar(true)}>
                    Agregar productos
                  </Button>
                </Empty>
              ),
            }}
          />
        </Card>
      )}

      <ModalAgregarProductos
        open={modalAgregar}
        proveedorId={proveedorId}
        onClose={() => setModalAgregar(false)}
        onDone={() => {
          setModalAgregar(false);
          qc.invalidateQueries({ queryKey: ['reposicion-proveedor'] });
        }}
      />
    </div>
  );
}

/**
 * Alta manual de productos a un proveedor.
 *
 * Es el caso que motiva toda la función: el proveedor vende algo que nunca le
 * has comprado, así que ni el historial ni el enganche automático lo saben.
 */
function ModalAgregarProductos({
  open, proveedorId, onClose, onDone,
}: {
  open: boolean; proveedorId?: number; onClose: () => void; onDone: () => void;
}) {
  const [ids, setIds] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState('');

  const { data: productos, isFetching } = useQuery({
    queryKey: ['productos-para-vincular', busqueda],
    // incluirSinStock:true a propósito. El default del endpoint filtra por stock
    // en el almacén del JWT, y aquí eso esconde exactamente lo que se viene a
    // vincular: lo que el proveedor vende y todavía no tienes.
    queryFn:  () => productosApi.list(1, 50, busqueda, true).then(r => r.data),
    enabled:  open,
    staleTime: 30_000,
  });

  const vincular = useMutation({
    mutationFn: () => productoProveedorApi.vincular({ proveedorId: proveedorId!, productoIds: ids }),
    onSuccess: (r) => {
      message.success(
        `${r.creados} producto${r.creados === 1 ? '' : 's'} vinculado${r.creados === 1 ? '' : 's'}` +
        (r.yaExistian > 0 ? ` · ${r.yaExistian} ya estaban` : ''),
      );
      setIds([]);
      onDone();
    },
    onError: () => message.error('No se pudieron vincular los productos.'),
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Agregar productos de este proveedor"
      okText={`Vincular (${ids.length})`}
      okButtonProps={{ disabled: ids.length === 0, loading: vincular.isPending }}
      onOk={() => vincular.mutate()}
      width={620}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        Busca en tu catálogo y marca lo que este proveedor te vende. Sirve también
        para lo que todavía no le has comprado nunca.
      </Text>
      <Select
        mode="multiple"
        showSearch
        filterOption={false}
        style={{ width: '100%', marginTop: 12 }}
        placeholder="Buscar producto por nombre o código…"
        value={ids}
        onChange={setIds}
        onSearch={setBusqueda}
        loading={isFetching}
        options={(productos ?? []).map((p: any) => ({
          value: p.id,
          label: `${p.codigo} · ${p.nombre}`,
        }))}
      />
    </Modal>
  );
}
