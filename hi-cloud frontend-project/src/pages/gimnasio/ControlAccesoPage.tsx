import { useState, useEffect, useRef } from 'react';
import { Input, Tag } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function ControlAccesoPage() {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [hora, setHora] = useState(new Date());
  const inputRef = useRef<any>(null);

  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resultado) {
      const t = setTimeout(() => { setResultado(null); setCodigo(''); inputRef.current?.focus(); }, 4000);
      return () => clearTimeout(t);
    }
  }, [resultado]);

  const { data: accesosHoy } = useQuery({
    queryKey: ['accesos-hoy'],
    queryFn: gimnasioApi.getAccesosHoy,
    refetchInterval: 10_000,
  });
  const accesos = Array.isArray(accesosHoy) ? accesosHoy : [];

  const registrarMut = useMutation({
    mutationFn: (c: string) => gimnasioApi.registrarAcceso(c),
    onSuccess: (data: any) => { setResultado(data); setCodigo(''); },
    onError: (e: any) => { setResultado({ autorizado: false, motivo: e.response?.data?.message ?? 'Error de conexion' }); setCodigo(''); },
  });

  useEffect(() => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (buffer.trim()) { registrarMut.mutate(buffer.trim()); buffer = ''; }
      } else {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { buffer = ''; }, 200);
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); clearTimeout(timer); };
  }, []);

  const handleBuscar = () => {
    if (!codigo.trim()) return;
    registrarMut.mutate(codigo.trim());
  };

  const bgColor = resultado ? (resultado.autorizado ? '#065f46' : '#7f1d1d') : '#0f172a';

  return (
    <div style={{ minHeight: '100vh', background: bgColor, color: '#fff', display: 'flex', flexDirection: 'column', padding: 24, transition: 'background 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', margin: 0 }}>Control de Acceso - Gimnasio</h1>
        <span style={{ fontSize: 28, fontWeight: 'bold', color: '#94a3b8' }}>
          {hora.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div style={{ marginBottom: 24 }}>
        <Input
          ref={inputRef}
          autoFocus
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          onPressEnter={handleBuscar}
          placeholder="Escanear QR o ingresar codigo de miembro..."
          size="large"
          style={{ fontSize: 20, height: 60 }}
          suffix={
            <span style={{ cursor: 'pointer', color: '#3b82f6', fontSize: 16, fontWeight: 600 }} onClick={handleBuscar}>
              Buscar
            </span>
          }
        />
      </div>
      {resultado && (
        <div style={{
          background: resultado.autorizado ? 'rgba(16,185,129,.2)' : 'rgba(239,68,68,.2)',
          border: `2px solid ${resultado.autorizado ? '#10b981' : '#ef4444'}`,
          borderRadius: 16, padding: 32, marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{resultado.autorizado ? '✅' : '❌'}</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 8 }}>
            {resultado.autorizado ? 'ACCESO AUTORIZADO' : 'ACCESO DENEGADO'}
          </div>
          {resultado.miembro && <div style={{ fontSize: 24, marginBottom: 8 }}>{resultado.miembro.nombre}</div>}
          {resultado.autorizado && resultado.membresia && (
            <div style={{ color: '#a7f3d0', fontSize: 16 }}>
              Plan: {resultado.membresia.plan} · Vence: {new Date(resultado.membresia.vence).toLocaleDateString('es-DO')}
              {resultado.membresia.diasRestantes <= 7 && (
                <div style={{ color: '#fcd34d', marginTop: 4 }}>Membresia vence en {resultado.membresia.diasRestantes} dias</div>
              )}
            </div>
          )}
          {!resultado.autorizado && resultado.motivo && (
            <div style={{ color: '#fca5a5', fontSize: 16 }}>{resultado.motivo}</div>
          )}
        </div>
      )}
      <div>
        <h3 style={{ color: '#94a3b8', marginBottom: 12 }}>ULTIMAS ENTRADAS</h3>
        {accesos.slice(0, 8).map((a: any, i: number) => (
          <div key={a.id ?? i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px', marginBottom: 4,
            background: 'rgba(255,255,255,.05)', borderRadius: 8,
          }}>
            <span style={{ color: '#64748b', width: 60, fontSize: 13 }}>
              {new Date(a.fechaHora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style={{ flex: 1, color: '#e2e8f0' }}>{a.miembroNombre}</span>
            <span>{a.autorizado ? '✅' : '❌'}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', textAlign: 'center', color: '#475569', fontSize: 14 }}>
        En el gimnasio ahora: {accesos.filter((a: any) => a.autorizado).length} personas hoy
      </div>
    </div>
  );
}
