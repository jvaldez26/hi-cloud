import { useState, useEffect } from 'react';
import { Modal } from 'antd';
import { fmt } from '../../utils/formatters';

// Único formulario de cierre (y recierre) de caja — usado por el POS y por
// Caja Diaria. Antes cada módulo tenía su propio formulario: el de Caja
// Diaria solo pedía el efectivo, así que un recierre hecho desde ahí borraba
// la tarjeta/transferencia/otros ya declaradas en el primer cierre (ver
// incidente 2026-10-09/10, Bellamar González / Beatriz Riva). Este
// componente es la única puerta de entrada: declara SIEMPRE las 4 formas
// (efectivo con desglose de billetes, tarjeta, transferencia, otros) y arma
// el mismo payload sin importar quién lo monte.

export const BILLETES_RD = [2000, 1000, 500, 200, 100, 50, 25, 20, 10, 5, 1];

// Débito y crédito se unificaron en un solo campo "tarjeta" — el esperado
// (ventasTarjeta) nunca los distinguió tampoco (DGII no los separa), así
// que declararlos aparte no tenía con qué compararse.
export type DesglosePago = {
  efectivo: string; tarjeta: string;
  cheque: string; transferencia: string; otro: string;
  deposito: string; documentos: string;
};

export type DeclaracionForma = { forma: string; monto: number; confirmado?: boolean };

export type CierreCajaPayload = {
  saldoFisico: number;
  notas?: string;
  desgloseBilletes: Record<number, number>;
  desglosePago: DesglosePago;
  declaradoPorForma: DeclaracionForma[];
};

const LABEL_FORMA: Record<string, string> = {
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otros: 'Cheque / Depósito / Otro / Documentos',
};

function CierreField({ label, value, editable, onChange, highlight }:
  { label: string; value: string; editable?: boolean; onChange?: (v: string) => void; highlight?: boolean }) {
  const color = highlight ? '#059669' : 'inherit';
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>{label}</div>
      {editable ? (
        <input type="number" value={value} onChange={e => onChange?.(e.target.value)} aria-label={label}
          style={{ width: '100%', height: 36, textAlign: 'right', padding: '0 8px',
            borderRadius: 6, border: '1px solid #ddd', fontSize: 13, outline: 'none',
            boxSizing: 'border-box', fontWeight: 600, color }} />
      ) : (
        <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 8px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0',
          fontSize: 13, fontWeight: 600, color }}>
          {value}
        </div>
      )}
    </div>
  );
}

export function CierreCajaFormulario({
  cajaHoy, onCerrar, submitting, cardBg = '#fff', cardBorder = '#E2E8F0',
}: {
  cajaHoy: any;
  onCerrar: (payload: CierreCajaPayload) => void;
  submitting?: boolean;
  cardBg?: string;
  cardBorder?: string;
}) {
  const [nota, setNota] = useState('');
  const [billetes, setBilletes] = useState<Record<number, number>>({});
  const [pago, setPago] = useState<DesglosePago>({
    efectivo: '', tarjeta: '', cheque: '', transferencia: '', otro: '', deposito: '', documentos: '',
  });

  const setBillete = (b: number, v: string) =>
    setBilletes(prev => ({ ...prev, [b]: v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0) }));
  const setPagoKey = (k: keyof DesglosePago) => (v: string) => setPago(p => ({ ...p, [k]: v }));

  const totalBilletes = BILLETES_RD.reduce((s, b) => s + (billetes[b] ?? 0) * b, 0);
  // SOLO efectivo — no cae a la suma de todas las formas (eso mezclaría
  // dinero que no está físicamente en el cajón con el que sí).
  const totalFisico = totalBilletes || (Number(pago.efectivo) || 0);
  const totalDesglosePago = Object.values(pago).reduce((s, v) => s + (Number(v) || 0), 0);

  // Mapeo a los 4 "buckets" que el backend ya usa para el esperado (DGII no
  // distingue cheque/depósito/otro de transferencia tampoco).
  const declaradoPorForma: DeclaracionForma[] = [
    { forma: 'efectivo', monto: totalFisico },
    { forma: 'tarjeta', monto: Number(pago.tarjeta) || 0 },
    { forma: 'transferencia', monto: Number(pago.transferencia) || 0 },
    { forma: 'otros', monto: (Number(pago.cheque) || 0) + (Number(pago.otro) || 0) + (Number(pago.deposito) || 0) + (Number(pago.documentos) || 0) },
  ];

  // Auto-llenar efectivo (modo normal) o limpiar todos los campos (modo ciego).
  useEffect(() => {
    if (!cajaHoy?.id) return;
    if (cajaHoy?.ciegoCajaActivo) {
      setPago({ efectivo: '', tarjeta: '', cheque: '', transferencia: '', otro: '', deposito: '', documentos: '' });
    } else if (cajaHoy?.ventasEfectivo) {
      const ef = Number(cajaHoy.ventasEfectivo) + Number(cajaHoy.saldoApertura ?? 0);
      setPago(p => ({ ...p, efectivo: ef.toFixed(2) }));
    }
  }, [cajaHoy?.id, cajaHoy?.ciegoCajaActivo]);

  const m = (v: any) => fmt.money(Number(v ?? 0));
  const vendidoContado = Number(cajaHoy?.ventasEfectivo ?? 0);
  const vendidoDigital = Number(cajaHoy?.ventasTarjeta ?? 0) + Number(cajaHoy?.ventasTransferencia ?? 0);
  const vendidoCredito = Number(cajaHoy?.ventasCredito ?? 0);
  const totalVendido = vendidoContado + vendidoDigital + vendidoCredito;
  const totalRecibos = Number(cajaHoy?.cobrosRecibidos ?? 0);
  const efectivoInicial = Number(cajaHoy?.saldoApertura ?? 0);
  const efectivoEnCaja = efectivoInicial + vendidoContado + totalRecibos;
  const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 10 };
  const card: React.CSSProperties = { background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 };

  const handleCerrar = () => {
    // "Una forma con ventas no puede quedar en 0 sin confirmación explícita."
    // El frontend no conoce el esperado real (el vendedor no lo ve en su caja
    // abierta), así que no decide si "había ventas": pide confirmar CUALQUIER
    // forma (distinta de efectivo) que haya quedado en RD$0.00 y manda
    // confirmado:true. El backend es quien de verdad sabe si hacía falta —
    // si esa forma no tenía ventas, el flag simplemente no se usa.
    const enCero = declaradoPorForma.filter(d => d.forma !== 'efectivo' && d.monto <= 0.01);
    const enviar = (extra: DeclaracionForma[]) => {
      const final = declaradoPorForma.map(d => {
        const e = extra.find(x => x.forma === d.forma);
        return e ? { ...d, confirmado: true } : d;
      });
      onCerrar({
        saldoFisico: totalFisico,
        notas: nota || undefined,
        desgloseBilletes: billetes,
        desglosePago: pago,
        declaradoPorForma: final,
      });
    };
    if (enCero.length === 0) {
      enviar([]);
      return;
    }
    Modal.confirm({
      title: 'Confirmar formas de pago en RD$0.00',
      content: `Vas a cerrar con ${enCero.map(c => LABEL_FORMA[c.forma] ?? c.forma).join(', ')} en RD$0.00. ¿Confirmas que no hubo cobros por esas formas en tu turno?`,
      okText: 'Sí, confirmar y cerrar',
      cancelText: 'Volver a revisar',
      onOk: () => enviar(enCero),
    });
  };

  return (
    <div>
      {/* Banner modo ciego */}
      {cajaHoy?.ciegoCajaActivo && (
        <div style={{ background: '#fff7e6', border: '1px solid #ffa940', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#874d00' }}>
          Modo ciego activo: cuente el efectivo físico y declare los montos sin ver el total esperado del sistema.
        </div>
      )}

      {/* Desglose de Operaciones — solo en modo normal (el vendedor no ve el esperado de su caja abierta) */}
      {!cajaHoy?.ciegoCajaActivo && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Desglose de Operaciones</div>
          <div style={grid3}>
            <CierreField label="Efectivo Inicial" value={m(efectivoInicial)} />
            <CierreField label="Vendido Contado" value={m(vendidoContado)} />
            <CierreField label="Vendido Tarj./Trans." value={m(vendidoDigital)} />
          </div>
          <div style={grid3}>
            <CierreField label="Vendido Crédito" value={m(vendidoCredito)} />
            <CierreField label="Total Vendido" value={m(totalVendido)} highlight />
            <CierreField label="Total Recibos" value={m(totalRecibos)} />
          </div>
          <div style={grid3}>
            <CierreField label="Total Anticipos" value={m(cajaHoy?.totalAnticipos ?? 0)} />
            <CierreField label="Total Dev. y Des" value={m(cajaHoy?.gastosEfectivo ?? 0)} />
            <CierreField label="Efectivo en Caja" value={m(efectivoEnCaja)} highlight />
          </div>
        </div>
      )}

      {/* Desglose de Billetes */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Desglose de Billetes</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 8 }}>
          {BILLETES_RD.slice(0, 6).map(b => (
            <div key={b} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{b.toLocaleString()}</div>
              <input type="number" min="0" value={billetes[b] ?? ''}
                onChange={e => setBillete(b, e.target.value)} aria-label={`Billete de ${b}`}
                style={{ width: '100%', height: 34, textAlign: 'center', borderRadius: 6,
                  border: '1px solid #ddd', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
          {BILLETES_RD.slice(6).map(b => (
            <div key={b} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{b}</div>
              <input type="number" min="0" value={billetes[b] ?? ''}
                onChange={e => setBillete(b, e.target.value)} aria-label={`Billete de ${b}`}
                style={{ width: '100%', height: 34, textAlign: 'center', borderRadius: 6,
                  border: '1px solid #ddd', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        {totalBilletes > 0 && (
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: '#059669', fontWeight: 700 }}>
            Total billetes: {fmt.money(totalBilletes)}
          </div>
        )}
      </div>

      {/* Desglose de Pago */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Desglose de Pago</div>
        <div style={grid3}>
          <CierreField label="Efectivo" value={pago.efectivo} editable onChange={setPagoKey('efectivo')} />
          <CierreField label="Tarjeta" value={pago.tarjeta} editable onChange={setPagoKey('tarjeta')} />
          <CierreField label="Transferencia" value={pago.transferencia} editable onChange={setPagoKey('transferencia')} />
        </div>
        <div style={grid3}>
          <CierreField label="Cheque" value={pago.cheque} editable onChange={setPagoKey('cheque')} />
          <CierreField label="Depósito" value={pago.deposito} editable onChange={setPagoKey('deposito')} />
          <CierreField label="Otro" value={pago.otro} editable onChange={setPagoKey('otro')} />
        </div>
        <div style={grid3}>
          <CierreField label="Documentos" value={pago.documentos} editable onChange={setPagoKey('documentos')} />
          <CierreField label="Total declarado (todas las formas)" value={m(totalDesglosePago)} highlight />
        </div>
      </div>

      {/* Nota */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Nota de cierre</div>
        <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota de cierre..."
          rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd',
            fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleCerrar} disabled={submitting}
          style={{ flex: 1, height: 46, borderRadius: 10, border: 'none',
            background: '#059669', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {submitting ? 'Cerrando...' : 'Grabar'}
        </button>
      </div>
    </div>
  );
}
