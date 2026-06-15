import { useState } from 'react';
import { Spin, message, Tag } from 'antd';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { opticaApi } from '../../../api/optica.api';
import type { ModoPOSProps } from './types';

const ESTADO_COLOR: Record<string, string> = {
  lista: '#10b981', para_entrega: '#10b981', entregada: '#94a3b8',
  en_proceso: '#3b82f6', recibida: '#f59e0b',
};

export default function OpticaPOS({ palette, addToCart, onContextoLoaded }: ModoPOSProps) {
  const C = palette;
  const [search, setSearch] = useState('');
  const [ordenSel, setOrdenSel] = useState<any>(null);
  const isDark = C.bg === '#080E1A';

  const { data: ordenesRes, isLoading } = useQuery({
    queryKey: ['pos-optica-ordenes'],
    queryFn: () => opticaApi.ordenes({ estado: 'lista', limit: 60 }),
    staleTime: 30_000,
  });

  const todasOrdenes: any[] = Array.isArray(ordenesRes) ? ordenesRes : (ordenesRes as any)?.data ?? [];

  const ordenes = search.trim()
    ? todasOrdenes.filter((o: any) => {
        const q = search.toLowerCase();
        return (
          String(o.numero ?? o.id).includes(q) ||
          (o.pacienteNombre ?? o.clienteNombre ?? '').toLowerCase().includes(q) ||
          (o.descripcion ?? '').toLowerCase().includes(q)
        );
      })
    : todasOrdenes;

  const { data: ordenDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['pos-optica-detalle', ordenSel?.id],
    queryFn: () => opticaApi.orden(ordenSel!.id),
    enabled: !!ordenSel?.id,
  });

  const handleCargarAlCarrito = () => {
    if (!ordenDetalle) return;
    const od: any = ordenDetalle;

    const items: any[] = od.items ?? od.productos ?? od.lineas ?? [];
    const total = Number(od.total ?? od.totalFinal ?? od.montoPendiente ?? 0);
    let cargados = 0;

    if (items.length > 0) {
      items.forEach((item: any) => {
        const precio = Number(item.precioVenta ?? item.precio ?? item.subtotal ?? 0);
        const cant = Number(item.cantidad ?? 1);
        if (precio > 0) {
          for (let i = 0; i < cant; i++) {
            addToCart({
              id: item.productoId ?? item.id + 3_000_000,
              nombre: item.nombre ?? item.descripcion ?? 'Producto óptico',
              precio,
              stock: 99,
              tipo: 'producto',
              porcentajeIva: Number(item.iva ?? item.porcentajeIva ?? 18),
              codigo: `OT-${od.numero ?? od.id}-L${item.id}`,
            } as any);
          }
          cargados++;
        }
      });
    } else if (total > 0) {
      addToCart({
        id: od.id + 3_500_000,
        nombre: `Orden Óptica OT-${od.numero ?? od.id}${od.pacienteNombre ? ' — ' + od.pacienteNombre : ''}`,
        precio: total,
        stock: 99,
        tipo: 'servicio',
        porcentajeIva: 18,
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 0', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
          👓 Óptica — Órdenes Listas para Cobrar
        </div>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, paciente..."
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Lista de OTs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spin size="large" />
          </div>
        ) : ordenes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👓</div>
            <div style={{ fontSize: 14 }}>No hay órdenes de trabajo listas para cobrar</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Las OTs con estado "Lista" aparecerán aquí</div>
          </div>
        ) : (
          ordenes.map((orden: any) => {
            const isSel = ordenSel?.id === orden.id;
            const total = Number(orden.total ?? orden.totalFinal ?? 0);
            const estadoKey = orden.estado ?? 'lista';
            const estadoColor = ESTADO_COLOR[estadoKey] ?? '#94a3b8';
            return (
              <div
                key={orden.id}
                onClick={() => setOrdenSel(isSel ? null : orden)}
                style={{
                  borderRadius: 10, border: `2px solid ${isSel ? C.blue : C.border}`,
                  background: isSel ? (isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF') : C.card,
                  padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    OT-{orden.numero ?? orden.id}
                  </span>
                  <Tag style={{ fontSize: 10, margin: 0, background: estadoColor + '22', color: estadoColor, border: `1px solid ${estadoColor}44` }}>
                    {estadoKey.replace(/_/g, ' ')}
                  </Tag>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                    RD${total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {(orden.pacienteNombre ?? orden.clienteNombre) && (
                    <span style={{ fontSize: 11, color: C.textSub }}>👤 {orden.pacienteNombre ?? orden.clienteNombre}</span>
                  )}
                  {orden.tipo && (
                    <span style={{ fontSize: 11, color: C.textSub }}>🕶️ {orden.tipo}</span>
                  )}
                  {orden.opticoNombre && (
                    <span style={{ fontSize: 11, color: C.textSub }}>👓 {orden.opticoNombre}</span>
                  )}
                  {orden.fechaEntregaPrevista && (
                    <span style={{ fontSize: 11, color: C.textSub }}>📅 {new Date(orden.fechaEntregaPrevista).toLocaleDateString('es-DO')}</span>
                  )}
                </div>

                {isSel && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    {loadingDetalle ? (
                      <Spin size="small" />
                    ) : ordenDetalle ? (
                      <>
                        {((ordenDetalle as any).items ?? (ordenDetalle as any).productos ?? (ordenDetalle as any).lineas ?? []).map((item: any) => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            <span>🕶️ {item.nombre ?? item.descripcion} ×{item.cantidad ?? 1}</span>
                            <span style={{ color: C.blue }}>
                              RD${Number((item.precioVenta ?? item.precio ?? 0) * (item.cantidad ?? 1)).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {(ordenDetalle as any).notas && (
                          <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>
                            📝 {(ordenDetalle as any).notas}
                          </div>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleCargarAlCarrito(); }}
                          style={{ marginTop: 10, width: '100%', height: 36, background: C.blue, border: 'none',
                            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <ShoppingCartOutlined /> Cargar al carrito → Cobrar
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
