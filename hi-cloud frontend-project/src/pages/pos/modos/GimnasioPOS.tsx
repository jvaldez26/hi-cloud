import { useState } from 'react';
import { Spin, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../../api/gimnasio.api';
import type { ModoPOSProps } from './types';

export default function GimnasioPOS({ palette, addToCart }: ModoPOSProps) {
  const C = palette;
  const [search, setSearch] = useState('');
  const [miembroSel, setMiembroSel] = useState<any>(null);

  const { data: planesData } = useQuery({ queryKey: ['gimnasio-planes-pos'], queryFn: gimnasioApi.getPlanes });
  const planes = Array.isArray(planesData) ? planesData : [];

  const { data: miembrosData, isLoading } = useQuery({
    queryKey: ['gimnasio-miembros-pos', search],
    queryFn: () => gimnasioApi.getMiembros({ search, limit: 20 }),
    enabled: search.length >= 2,
  });
  const miembros = Array.isArray(miembrosData) ? miembrosData : (miembrosData as any)?.data ?? [];

  const handleRenovar = (miembro: any, plan: any) => {
    addToCart({
      id: `gym-plan-${plan.id}-${miembro.id}`,
      nombre: `Membresia ${plan.nombre} — ${miembro.nombre}`,
      precio: Number(plan.precio),
      stock: 99,
      tipo: 'servicio',
      porcentajeIva: 18,
      codigo: `MBR-${miembro.numero ?? miembro.id}`,
    } as any);
    setMiembroSel(null);
    setSearch('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', marginBottom: 6 }}>Gimnasio</div>
        <div style={{ position: 'relative' }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.textSub, zIndex: 1 }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setMiembroSel(null); }}
            placeholder="Buscar miembro por nombre o numero..."
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading && <Spin style={{ display: 'block', marginTop: 20 }} />}
        {!miembroSel && miembros.map((m: any) => (
          <div key={m.id} onClick={() => setMiembroSel(m)}
            style={{ borderRadius: 10, border: `2px solid ${C.border}`, background: C.card, padding: '10px 14px', marginBottom: 8, cursor: 'pointer' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.nombre} {m.apellidos ?? ''}</div>
            {m.numero && <div style={{ fontSize: 11, color: C.textSub }}>{m.numero}</div>}
            <Tag color={m.estado === 'activo' ? 'green' : 'red'} style={{ marginTop: 4 }}>{m.estado}</Tag>
          </div>
        ))}
        {miembroSel && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setMiembroSel(null)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 13 }}>Volver</button>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              {miembroSel.nombre} {miembroSel.apellidos ?? ''}
            </div>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 16 }}>Selecciona un plan para renovar:</div>
            {planes.map((p: any) => (
              <div key={p.id} onClick={() => handleRenovar(miembroSel, p)}
                style={{ borderRadius: 10, border: `2px solid ${C.border}`, background: C.card, padding: '10px 14px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: C.textSub }}>{p.duracionDias} dias</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                    RD${Number(p.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
