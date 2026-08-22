import { useState } from 'react';
import { Spin, message, Tag } from 'antd';
import { ShoppingCartOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { clinicaApi } from '../../../api/clinica.api';
import type { ModoPOSProps } from './types';
import { hoyRD } from '../../../utils/fechaRD';

const ESTADO_COLOR: Record<string, { bg: string; text: string }> = {
  confirmada:  { bg: '#3b82f620', text: '#3b82f6' },
  en_consulta: { bg: '#f59e0b20', text: '#f59e0b' },
  atendida:    { bg: '#10b98120', text: '#10b981' },
  pendiente:   { bg: '#94a3b820', text: '#94a3b8' },
  cancelada:   { bg: '#ef444420', text: '#ef4444' },
};

function getTodayISO() {
  return hoyRD();
}

export default function ClinicaPOS({ palette, addToCart, onContextoLoaded, precioConsultaDefault }: ModoPOSProps) {
  const C = palette;
  const [preciosOverride, setPreciosOverride] = useState<Record<number, string>>({});
  const today = getTodayISO();

  const { data: citasRes, isLoading, refetch } = useQuery({
    queryKey: ['pos-clinica-citas', today],
    queryFn: () => clinicaApi.listarCitas({ fecha: today, limit: 100 }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const todasCitas: any[] = Array.isArray(citasRes) ? citasRes : (citasRes as any)?.data ?? [];
  const citas = todasCitas.filter((c: any) => c.estado !== 'cancelada');

  const handleAgregarConsulta = (cita: any) => {
    const precioRaw = preciosOverride[cita.id] ?? cita.monto ?? cita.precio ?? cita.montoCobro ?? cita.tarifaConsulta ?? precioConsultaDefault ?? '';
    const precio = Number(precioRaw);

    if (!precioRaw || precio <= 0) {
      message.warning('Ingresa el precio de la consulta antes de agregar al carrito');
      return;
    }

    const paciente = cita.pacienteNombre ?? cita.paciente?.nombre ?? 'Paciente';
    const medico = cita.medicoNombre ?? cita.medico?.nombre ?? '';
    const hora = cita.hora ?? cita.horaInicio ?? '';

    addToCart({
      id: cita.id + 5_000_000,
      nombre: `Consulta Médica${paciente ? ' — ' + paciente : ''}${hora ? ' ' + hora : ''}${medico ? ' (Dr. ' + medico + ')' : ''}`,
      precio,
      stock: 99,
      tipo: 'servicio',
      porcentajeIva: 0,
      codigo: `CITA-${cita.id}`,
    } as any);
    onContextoLoaded?.(cita.id);
    message.success(`Consulta de ${paciente} agregada al carrito`);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            🏥 Clínica — Citas de Hoy ({today})
          </div>
          <button
            onClick={() => refetch()}
            style={{ height: 28, padding: '0 10px', background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>
            <CalendarOutlined /> Actualizar
          </button>
        </div>
      </div>

      {/* Lista de citas */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spin size="large" />
          </div>
        ) : citas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSub }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏥</div>
            <div style={{ fontSize: 14 }}>No hay citas para hoy</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Las citas del día aparecerán aquí para cobrarlas</div>
          </div>
        ) : (
          citas.map((cita: any) => {
            const estadoKey = cita.estado ?? 'pendiente';
            const colors = ESTADO_COLOR[estadoKey] ?? ESTADO_COLOR.pendiente;
            const precioActual = preciosOverride[cita.id] ?? String(cita.monto ?? cita.precio ?? cita.montoCobro ?? cita.tarifaConsulta ?? precioConsultaDefault ?? '');
            const paciente = cita.pacienteNombre ?? cita.paciente?.nombre ?? 'Paciente sin nombre';
            const medico = cita.medicoNombre ?? cita.medico?.nombre ?? '';
            const hora = cita.hora ?? cita.horaInicio ?? '';
            const tipoCita = cita.tipo ?? cita.tipoCita ?? '';

            return (
              <div key={cita.id} style={{
                borderRadius: 10, border: `1px solid ${C.border}`,
                background: C.card, padding: '10px 14px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      {hora && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.blue, minWidth: 44 }}>{hora}</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{paciente}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Tag style={{ fontSize: 10, background: colors.bg, color: colors.text, border: `1px solid ${colors.text}44`, margin: 0 }}>
                        {estadoKey.replace(/_/g, ' ')}
                      </Tag>
                      {medico && <span style={{ fontSize: 11, color: C.textSub }}>Dr. {medico}</span>}
                      {tipoCita && <span style={{ fontSize: 11, color: C.textSub }}>· {tipoCita}</span>}
                    </div>
                  </div>
                </div>

                {/* Precio + botón */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 12, color: C.textSub, userSelect: 'none' }}>RD$</span>
                    <input
                      type="number"
                      min={0}
                      value={precioActual}
                      onChange={e => setPreciosOverride(prev => ({ ...prev, [cita.id]: e.target.value }))}
                      placeholder="Precio consulta"
                      style={{ width: '100%', height: 32, paddingLeft: 36, paddingRight: 8,
                        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                        color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={() => handleAgregarConsulta(cita)}
                    style={{ height: 32, padding: '0 12px', background: C.blue, border: 'none',
                      borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <ShoppingCartOutlined style={{ fontSize: 12 }} />
                    Cobrar
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
