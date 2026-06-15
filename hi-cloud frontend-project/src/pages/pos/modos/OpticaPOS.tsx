import { useState } from 'react';
import { Spin, message, Tag, Tabs } from 'antd';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { opticaApi } from '../../../api/optica.api';
import type { ModoPOSProps } from './types';

const ESTADO_COLOR: Record<string, string> = {
  lista: '#10b981', para_entrega: '#10b981', entregada: '#94a3b8',
  en_proceso: '#3b82f6', recibida: '#f59e0b',
};

const TIPO_COLOR: Record<string, string> = {
  montura: '#6366f1', lente: '#0ea5e9', accesorio: '#f59e0b', otro: '#94a3b8',
};

export default function OpticaPOS({ palette, addToCart, onContextoLoaded }: ModoPOSProps) {
  const C = palette;
  const [search, setSearch] = useState('');
  const [searchOrd, setSearchOrd] = useState('');
  const [ordenSel, setOrdenSel] = useState<any>(null);
  const isDark = C.bg === '#080E1A';

  // Catálogo inventario óptico
  const { data: catalogoData, isLoading: loadingCat } = useQuery({
    queryKey: ['pos-optica-catalogo'],
    queryFn: () => opticaApi.inventarioPOSCatalogo(),
    staleTime: 60_000,
  });
  const catalogo: any[] = Array.isArray(catalogoData) ? catalogoData : (catalogoData as any)?.data ?? [];

  // OTs listas para cobrar
  const { data: ordenesRes, isLoading: loadingOrd } = useQuery({
    queryKey: ['pos-optica-ordenes'],
    queryFn: () => opticaApi.ordenes({ estado: 'lista', limit: 60 }),
    staleTime: 30_000,
  });
  const todasOrdenes: any[] = Array.isArray(ordenesRes) ? ordenesRes : (ordenesRes as any)?.data ?? [];

  const { data: ordenDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['pos-optica-detalle', ordenSel?.id],
    queryFn: () => opticaApi.orden(ordenSel!.id),
    enabled: !!ordenSel?.id,
  });

  const catalogoFiltrado = search.trim()
    ? catalogo.filter(i => {
        const q = search.toLowerCase();
        return (i.nombre ?? '').toLowerCase().includes(q)
          || (i.codigo ?? '').toLowerCase().includes(q)
          || (i.tipo ?? '').toLowerCase().includes(q)
          || (i.descripcion ?? '').toLowerCase().includes(q);
      })
    : catalogo;

  const ordenesFiltradas = searchOrd.trim()
    ? todasOrdenes.filter((o: any) => {
        const q = searchOrd.toLowerCase();
        return String(o.numero ?? o.id).includes(q)
          || (o.pacienteNombre ?? o.clienteNombre ?? '').toLowerCase().includes(q);
      })
    : todasOrdenes;

  const handleAddInventario = (item: any) => {
    addToCart({
      id: 0,
      opticaInventarioId: item.opticaInventarioId ?? item.id,
      nombre: item.nombre,
      precio: Number(item.precio),
      stock: Number(item.stock),
      tipo: 'servicio',
      porcentajeIva: 0,  // inventario óptico: exento por defecto
      codigo: item.codigo ?? `OPT-${item.id}`,
    } as any);
    message.success(`${item.nombre} agregado al carrito`);
  };

  const handleCargarOT = () => {
    if (!ordenDetalle) return;
    const od: any = ordenDetalle;
    const items: any[] = od.items ?? od.productos ?? od.lineas ?? [];
    const otItbis    = Number(od.itbis ?? 0);
    const otSubtotal = Number(od.subtotal ?? 0);
    const otTotal    = Number(od.total ?? od.totalFinal ?? od.montoPendiente ?? 0);
    const subtotalEfectivo = otSubtotal > 0 ? otSubtotal : Math.max(0, otTotal - otItbis);
    const otPorcentajeIva  = (subtotalEfectivo > 0 && otItbis > 0) ? Math.round((otItbis / subtotalEfectivo) * 100) : 0;
    const precioCarrito    = subtotalEfectivo > 0 ? subtotalEfectivo : otTotal;
    let cargados = 0;
    if (items.length > 0) {
      items.forEach((item: any) => {
        const precio = Number(item.precioVenta ?? item.precio ?? item.subtotal ?? 0);
        const cant   = Number(item.cantidad ?? 1);
        if (precio > 0) {
          const ivaItem = item.iva !== undefined ? Number(item.iva)
                        : item.porcentajeIva !== undefined ? Number(item.porcentajeIva)
                        : otPorcentajeIva;
          for (let i = 0; i < cant; i++) {
            addToCart({
              id: (item.productoId && item.productoId > 0 && item.productoId < 1_000_000) ? item.productoId : 0,
              opticaInventarioId: (item.opticaInventarioId ?? null) as any,
              nombre: item.nombre ?? item.descripcion ?? 'Producto óptico',
              precio, stock: 99, tipo: 'servicio',
              porcentajeIva: ivaItem,
              codigo: `OT-${od.numero ?? od.id}-L${item.id}`,
            } as any);
          }
          cargados++;
        }
      });
    } else if (otTotal > 0) {
      addToCart({
        id: 0,
        nombre: `Orden Óptica OT-${od.numero ?? od.id}${od.pacienteNombre ? ' — ' + od.pacienteNombre : ''}`,
        precio: precioCarrito, stock: 99, tipo: 'servicio',
        porcentajeIva: otPorcentajeIva,
        codigo: `OT-${od.numero ?? od.id}`,
      } as any);
      cargados = 1;
    }
    if (cargados > 0) {
      onContextoLoaded?.(od.id);
      message.success(`OT-${od.numero ?? od.id} cargada al carrito (${cargados} ítem${cargados > 1 ? 's' : ''})`);
      setOrdenSel(null);
    } else {
      message.warning('La OT no tiene ítems con precio para cargar');
    }
  };

  const cardStyle = (sel: boolean) => ({
    borderRadius: 10,
    border: `2px solid ${sel ? C.blue : C.border}`,
    background: sel ? (isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF') : C.card,
    padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
    transition: 'border-color 0.12s, background 0.12s',
  });

  const searchInput = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  );

  const tabInventario = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
      {searchInput(search, setSearch, 'Buscar marca, modelo, tipo...')}
      {loadingCat ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <Spin size="large" />
        </div>
      ) : catalogoFiltrado.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👓</div>
          <div style={{ fontSize: 14 }}>Sin productos en inventario óptico</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Agrega productos en Óptica → Inventario</div>
        </div>
      ) : (
        catalogoFiltrado.map((item: any) => {
          const tipoColor = TIPO_COLOR[item.tipo?.toLowerCase()] ?? TIPO_COLOR.otro;
          return (
            <div key={item.id} onClick={() => handleAddInventario(item)} style={cardStyle(false)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Tag style={{ fontSize: 10, margin: 0, background: tipoColor + '22', color: tipoColor, border: `1px solid ${tipoColor}44`, textTransform: 'capitalize' }}>
                  {item.tipo}
                </Tag>
                {item.codigo && <span style={{ fontSize: 10, color: C.textSub }}>{item.codigo}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                  RD${Number(item.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.nombre}</div>
              {item.descripcion && <div style={{ fontSize: 11, color: C.textSub }}>{item.descripcion}</div>}
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>Stock: {item.stock} uds</div>
            </div>
          );
        })
      )}
    </div>
  );

  const tabOrdenes = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
      {searchInput(searchOrd, setSearchOrd, 'Buscar por número, paciente...')}
      {loadingOrd ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <Spin size="large" />
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14 }}>No hay órdenes de trabajo listas para cobrar</div>
        </div>
      ) : (
        ordenesFiltradas.map((orden: any) => {
          const isSel = ordenSel?.id === orden.id;
          const total = Number(orden.total ?? orden.totalFinal ?? 0);
          const estadoKey = orden.estado ?? 'lista';
          const estadoColor = ESTADO_COLOR[estadoKey] ?? '#94a3b8';
          return (
            <div key={orden.id} onClick={() => setOrdenSel(isSel ? null : orden)} style={cardStyle(isSel)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>OT-{orden.numero ?? orden.id}</span>
                <Tag style={{ fontSize: 10, margin: 0, background: estadoColor + '22', color: estadoColor, border: `1px solid ${estadoColor}44` }}>
                  {estadoKey.replace(/_/g, ' ')}
                </Tag>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                  RD${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {(orden.pacienteNombre ?? orden.clienteNombre) && (
                <span style={{ fontSize: 11, color: C.textSub }}>👤 {orden.pacienteNombre ?? orden.clienteNombre}</span>
              )}
              {isSel && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  {loadingDetalle ? <Spin size="small" /> : ordenDetalle ? (
                    <button
                      onClick={e => { e.stopPropagation(); handleCargarOT(); }}
                      style={{ marginTop: 6, width: '100%', height: 36, background: C.blue, border: 'none',
                        borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <ShoppingCartOutlined /> Cargar al carrito → Cobrar
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      <div style={{ padding: '8px 14px 0', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
          👓 Óptica
        </div>
      </div>
      <Tabs
        defaultActiveKey="inventario"
        size="small"
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        tabBarStyle={{ margin: '0 14px', paddingTop: 4, flexShrink: 0 }}
        items={[
          { key: 'inventario', label: '🕶️ Inventario', children: tabInventario },
          { key: 'ordenes', label: '📋 Órdenes', children: tabOrdenes },
        ]}
      />
    </div>
  );
}
