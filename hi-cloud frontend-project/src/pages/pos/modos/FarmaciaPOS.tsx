import { useState, useRef, useCallback } from 'react';
import { Spin, message, Tag } from 'antd';
import { SearchOutlined, BarcodeOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { farmaciaApi } from '../../../api/farmacia.api';
import type { ModoPOSProps } from './types';

export default function FarmaciaPOS({ palette, addToCart }: ModoPOSProps) {
  const C = palette;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDark = C.bg === '#080E1A';

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 350);
  };

  const { data: medRes, isLoading } = useQuery({
    queryKey: ['pos-farmacia-meds', debouncedSearch],
    queryFn: () => farmaciaApi.medicamentos({ search: debouncedSearch || undefined, limit: 80 }),
    staleTime: 60_000,
    enabled: debouncedSearch.length >= 2 || debouncedSearch === '',
  });

  const medicamentos: any[] = Array.isArray(medRes) ? medRes : (medRes as any)?.data ?? [];

  const agregarMedicamento = useCallback((med: any) => {
    const precio = Number(med.precioVenta ?? med.precio ?? med.precioUnitario ?? 0);
    const iva = Number(med.porcentajeIva ?? med.iva ?? 0);
    if (precio <= 0) {
      message.warning(`${med.nombre} no tiene precio configurado`);
      return;
    }
    addToCart({
      id: med.id,
      nombre: med.nombre ?? med.descripcion ?? 'Medicamento',
      precio,
      stock: Number(med.stockActual ?? med.stock ?? 99),
      tipo: 'producto',
      porcentajeIva: iva,
      codigo: med.codigo ?? med.codigoBarra ?? undefined,
    } as any);
    message.success(`${med.nombre} agregado al carrito`);
  }, [addToCart]);

  const handleBarcodeScan = async () => {
    const codigo = barcodeInput.trim();
    if (!codigo) return;
    try {
      const med = await farmaciaApi.buscarBarra(codigo);
      if (med) {
        agregarMedicamento(med);
        setBarcodeInput('');
      } else {
        message.error('Código de barras no encontrado');
      }
    } catch {
      message.error('Error al buscar por código de barras');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
          💊 Farmacia — Búsqueda de Medicamentos
        </div>

        {/* Búsqueda */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Buscar medicamento por nombre, principio activo..."
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Código de barras */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <BarcodeOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
            <input
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBarcodeScan()}
              placeholder="Escanear código de barras..."
              style={{ width: '100%', height: 32, paddingLeft: 32, paddingRight: 10,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={handleBarcodeScan}
            style={{ height: 32, padding: '0 12px', background: C.blue, border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            Buscar
          </button>
        </div>
      </div>

      {/* Grid de medicamentos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spin size="large" />
          </div>
        ) : medicamentos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>💊</div>
            <div style={{ fontSize: 14 }}>
              {debouncedSearch ? `Sin resultados para "${debouncedSearch}"` : 'Escribe al menos 2 caracteres para buscar'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {medicamentos.map((med: any) => {
              const precio = Number(med.precioVenta ?? med.precio ?? 0);
              const stock = Number(med.stockActual ?? med.stock ?? 0);
              const sinStock = stock <= 0;
              return (
                <div
                  key={med.id}
                  onClick={() => !sinStock && agregarMedicamento(med)}
                  style={{
                    borderRadius: 10, border: `1px solid ${C.border}`,
                    background: C.card, padding: '10px 12px', cursor: sinStock ? 'not-allowed' : 'pointer',
                    opacity: sinStock ? 0.6 : 1, transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!sinStock) (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(59,130,246,.12)' : '#EFF6FF'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.card; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3, flex: 1 }}>
                      {med.nombre}
                    </span>
                    <ShoppingCartOutlined style={{ color: C.blue, fontSize: 14, flexShrink: 0 }} />
                  </div>

                  {med.presentacion && (
                    <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{med.presentacion}</div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#10b981' }}>
                      RD${precio.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                    <Tag color={sinStock ? 'red' : stock <= 5 ? 'warning' : 'green'} style={{ fontSize: 10, margin: 0 }}>
                      {sinStock ? 'Sin stock' : `Stock: ${stock}`}
                    </Tag>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
