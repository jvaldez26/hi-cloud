import { useState } from 'react';
import { Input, Button, Tag, Spin, message, Tooltip } from 'antd';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tallerApi } from '../../../api/taller.api';
import type { ModoPOSProps } from './types';

const ESTADO_COLOR: Record<string, string> = {
  para_cobrar: '#f59e0b', listo: '#10b981', en_proceso: '#3b82f6', pendiente: '#94a3b8',
};

export default function TallerPOS({ palette, addToCart, onContextoLoaded }: ModoPOSProps) {
  const C = palette;
  const [search, setSearch]                   = useState('');
  const [ordenSelSel, setOrdenSelSel]         = useState<any>(null);
  const isDark = C.bg === '#080E1A';

  const { data: ordenesRes, isLoading } = useQuery({
    queryKey: ['pos-taller-ordenes', search],
    queryFn: () => tallerApi.ordenes({ estado: 'para_cobrar', limit: 60, search: search || undefined }),
    staleTime: 30_000,
  });

  const ordenes: any[] = Array.isArray(ordenesRes) ? ordenesRes : (ordenesRes as any)?.data ?? [];

  const { data: ordenDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['pos-taller-detalle', ordenSelSel?.id],
    queryFn: () => tallerApi.orden(ordenSelSel!.id),
    enabled: !!ordenSelSel?.id,
  });

  const handleCargarAlCarrito = () => {
    if (!ordenDetalle) return;
    const od: any = ordenDetalle;
    const servicios: any[] = od.servicios ?? [];
    const repuestos: any[] = od.repuestos ?? [];
    let cargados = 0;

    servicios.forEach((s: any) => {
      const precio = Number(s.precioTotal ?? s.precio ?? s.costo ?? 0);
      if (precio > 0) {
        addToCart({
          id: s.id + 1_000_000,
          nombre: s.nombre ?? s.descripcion ?? 'Servicio de taller',
          precio,
          stock: 99,
          tipo: 'servicio',
          porcentajeIva: 18,
          codigo: `OS-${od.numero}-S${s.id}`,
        } as any);
        cargados++;
      }
    });

    repuestos.forEach((r: any) => {
      const precio = Number(r.precioVenta ?? r.precioUnitario ?? r.precio ?? 0);
      const cantidad = Number(r.cantidad ?? 1);
      if (precio > 0) {
        for (let i = 0; i < cantidad; i++) {
          addToCart({
            id: r.productoId ?? r.id + 2_000_000,
            nombre: r.nombre ?? r.descripcion ?? 'Repuesto',
            precio,
            stock: 99,
            tipo: 'producto',
            porcentajeIva: 18,
            codigo: `OS-${od.numero}-R${r.id}`,
          } as any);
        }
        cargados++;
      }
    });

    if (cargados > 0) {
      onContextoLoaded?.(od.id);
      message.success(`${cargados} ítem(s) cargado(s) al carrito desde OS ${od.numero}`);
      setOrdenSelSel(null);
    } else {
      message.warning('La OS no tiene servicios o repuestos con precio para cargar');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 0', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
          🔧 Órdenes de Servicio — Listas para Cobrar
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por placa, cliente, número de OS..."
              style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      {/* Lista de OS */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spin size="large" />
          </div>
        ) : ordenes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
            <div style={{ fontSize: 14 }}>No hay órdenes de servicio listas para cobrar</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Las OS con estado "Para Cobrar" aparecerán aquí</div>
          </div>
        ) : (
          ordenes.map((orden: any) => {
            const isSel = ordenSelSel?.id === orden.id;
            return (
              <div key={orden.id} onClick={() => setOrdenSelSel(isSel ? null : orden)} style={{
                borderRadius: 10, border: `2px solid ${isSel ? C.blue : C.border}`,
                background: isSel ? (isDark ? 'rgba(59,130,246,.15)' : '#EFF6FF') : C.card,
                padding: '10px 14px', marginBottom: 8, cursor: 'pointer',
                transition: 'border-color 0.12s, background 0.12s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>OS-{orden.numero ?? orden.id}</span>
                  <Tag color="warning" style={{ fontSize: 10 }}>
                    {orden.estado?.replace(/_/g,' ') ?? 'para cobrar'}
                  </Tag>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                    RD${Number(orden.totalFinal ?? orden.total ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {orden.placa && (
                    <span style={{ fontSize: 11, color: C.textSub }}>🚗 {orden.placa}</span>
                  )}
                  {(orden.marcaVehiculo || orden.marca) && (
                    <span style={{ fontSize: 11, color: C.textSub }}>{orden.marcaVehiculo ?? orden.marca} {orden.modeloVehiculo ?? orden.modelo}</span>
                  )}
                  {orden.clienteNombre && (
                    <span style={{ fontSize: 11, color: C.textSub }}>👤 {orden.clienteNombre}</span>
                  )}
                  {orden.tecnicoNombre && (
                    <span style={{ fontSize: 11, color: C.textSub }}>🔧 {orden.tecnicoNombre}</span>
                  )}
                </div>

                {/* Panel expandido cuando está seleccionada */}
                {isSel && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    {loadingDetalle ? (
                      <Spin size="small" />
                    ) : ordenDetalle ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Detalles de la OS
                        </div>
                        {((ordenDetalle as any).servicios ?? []).map((s: any) => (
                          <div key={`s-${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            <span>🔧 {s.nombre ?? s.descripcion}</span>
                            <span style={{ color: C.blue }}>RD${Number(s.precioTotal ?? s.precio ?? 0).toFixed(2)}</span>
                          </div>
                        ))}
                        {((ordenDetalle as any).repuestos ?? []).map((r: any) => (
                          <div key={`r-${r.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginBottom: 3 }}>
                            <span>⚙️ {r.nombre ?? r.descripcion} ×{r.cantidad ?? 1}</span>
                            <span style={{ color: C.blue }}>RD${Number((r.precioVenta ?? r.precioUnitario ?? 0) * (r.cantidad ?? 1)).toFixed(2)}</span>
                          </div>
                        ))}
                        <Button
                          type="primary" block icon={<ShoppingCartOutlined />}
                          style={{ marginTop: 10 }}
                          onClick={e => { e.stopPropagation(); handleCargarAlCarrito(); }}>
                          Cargar al carrito → Cobrar
                        </Button>
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
