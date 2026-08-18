import { useState, useMemo } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Card, Row, Col, Typography, Statistic, Button, InputNumber,
         Table, Tag, Modal, Form, Input, Select, Space, Alert, Spin, message, Avatar,
         theme, Drawer, Descriptions, Divider, DatePicker, Radio, Checkbox, Tooltip, Empty,
         Tabs, Badge } from 'antd';
import { UnlockOutlined, LockOutlined, HistoryOutlined,
         RollbackOutlined, WarningOutlined, CheckCircleOutlined, StopOutlined,
         PrinterOutlined, SearchOutlined, DollarOutlined,
         FileExcelOutlined, FilePdfOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { imprimirReciboTermico } from '../../utils/printUtils';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';

// ── Constantes de retiros ──────────────────────────────────────────────────
const CATEGORIA_OPTIONS = [
  { value: 'pago_proveedor', label: '🧾 Pago a proveedor' },
  { value: 'deposito_banco', label: '🏦 Depósito a banco'  },
  { value: 'gasto',          label: '💸 Gasto operacional' },
  { value: 'prestamo_dueno', label: '👤 Préstamo al dueño' },
  { value: 'otro',           label: '📋 Otro'              },
];
const CATEGORIA_LABELS: Record<string, string> = {
  pago_proveedor: 'Pago a proveedor',
  deposito_banco: 'Depósito a banco',
  gasto:          'Gasto operacional',
  prestamo_dueno: 'Préstamo al dueño',
  otro:           'Otro',
};
const ESTADO_RETIRO_COLOR: Record<string, string> = {
  activo:    'green',
  pendiente: 'orange',
  anulado:   'default',   // gris — fue revertido (dinero regresó a caja)
  rechazado: 'volcano',   // rojo-naranja — supervisor no lo avaló (dinero NO regresó)
};
const ESTADO_RETIRO_LABEL: Record<string, string> = {
  activo:    'Autorizado',
  pendiente: 'Pendiente',
  anulado:   'Anulado',
  rechazado: 'Rechazado',
};

const retirosApi = {
  listar:    (cajaId?: number) =>
    api.get(`/caja/retiros${cajaId ? `?cajaId=${cajaId}` : ''}`).then(r => r.data?.data ?? r.data ?? []),
  reporte:   (params: Record<string, string>) =>
    api.get('/caja/retiros/reporte', { params }).then(r => r.data?.data ?? r.data ?? []),
  autorizar: (id: number) =>
    api.patch(`/caja/retiros/${id}/autorizar`).then(r => r.data?.data ?? r.data),
  anular:    (id: number, motivo: string) =>
    api.patch(`/caja/retiros/${id}/anular`, { motivo }).then(r => r.data?.data ?? r.data),
  rechazar:  (id: number, motivo: string) =>
    api.patch(`/caja/retiros/${id}/rechazar`, { motivo }).then(r => r.data?.data ?? r.data),
  cuentasBancarias: () =>
    api.get('/bancos/cuentas').then(r => r.data?.data ?? r.data ?? []),
};

const { Title, Text } = Typography;

const cajaApi = {
  hoy:             ()                          => api.get('/caja/hoy').then(r => r.data?.data ?? r.data),
  cajeros:         ()                          => api.get('/caja/cajeros').then(r => r.data?.data ?? r.data),
  abrir:           (body: any)                 => api.post('/caja/abrir', body).then(r => r.data?.data),
  cerrar:          (id: number, body: any)     => api.patch(`/caja/${id}/cerrar`, body).then(r => r.data?.data),
  anular:          (id: number, motivo: string) => api.patch(`/caja/${id}/anular`, { motivo }).then(r => r.data?.data),
  historial:       (p = 1, mes?: number, anio?: number) =>
    api.get(`/caja/historial?page=${p}${mes ? `&mes=${mes}&anio=${anio}` : ''}`).then(r => r.data?.data),
  resumen:         (mes: number, anio: number) => api.get(`/caja/resumen?mes=${mes}&anio=${anio}`).then(r => r.data?.data),
  facturasDetalle: (id: number)                => api.get(`/caja/${id}/facturas-detalle`).then(r => r.data?.data ?? r.data),
};

const estadoColor: Record<string, string> = {
  abierta: 'green', cerrada: 'blue', revisada: 'purple',
};

function avatarColor(name: string) {
  const c = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#0891B2'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % c.length;
  return c[h];
}

export default function CajaPage() {
  const { token }  = theme.useToken();
  const isMobile   = useMobile();
  const [cerrarTarget, setCerrarTarget] = useState<{
    id: number; nombre: string;
    saldoEsperado: number; saldoApertura: number;
    ventasEfectivo: number; ventasTarjeta: number; ventasTransferencia: number;
    cobrosRecibidos: number; totalAnticipos: number; gastosEfectivo: number; retiros: number;
    cantidadTransacciones: number; fecha: string;
  } | null>(null);
  const [anularTarget, setAnularTarget] = useState<{ id: number; nombre: string; fecha: string } | null>(null);
  const [detalleCierre, setDetalleCierre] = useState<any>(null);
  const [saldoFisicoInput, setSaldoFisicoInput] = useState<number>(0);
  const [openAbrir, setOpenAbrir] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histFecha, setHistFecha] = useState(() => dayjs());
  const [form]       = Form.useForm();
  const [formAnular] = Form.useForm();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const puedeAnular = user?.role === 'admin' || user?.role === 'contador' || user?.role === 'super_admin';
  const esAdmin     = user?.role === 'admin' || user?.role === 'contador' || user?.role === 'super_admin';

  const COLS_DEF = [
    { key: 'fecha',                   label: 'Fecha' },
    { key: 'vendedorNombre',          label: 'Cajero' },
    { key: 'estado',                  label: 'Estado' },
    { key: 'saldoApertura',           label: 'Apertura' },
    { key: 'ing',                     label: 'Total Ingresos' },
    { key: 'saldoCierre',             label: 'Esperado' },
    { key: 'saldoFisico',             label: 'Contado' },
    { key: 'diferencia',              label: 'Diferencia' },
    { key: 'cantidadTransacciones',   label: 'Trans.' },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('caja-historial', COLS_DEF);

  const { data: cajaData, isLoading } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn:  cajaApi.hoy,
    refetchInterval:      5_000,   // cada 5s — detecta cajas abiertas desde el POS
    refetchOnWindowFocus: true,    // refresca al volver a esta pestaña
    staleTime:            0,       // siempre stale
  });

  const { data: cajeros = [] } = useQuery<any[]>({
    queryKey: ['caja-cajeros'],
    queryFn:  cajaApi.cajeros,
    staleTime: 60_000,
  });

  const { data: historial } = useQuery({
    queryKey: ['caja-hist', histPage, histFecha.month() + 1, histFecha.year()],
    queryFn:  () => cajaApi.historial(histPage, histFecha.month() + 1, histFecha.year()),
  });

  const mes  = dayjs().month() + 1;
  const anio = dayjs().year();
  const { data: resumenMes } = useQuery({
    queryKey: ['caja-resumen', mes, anio],
    queryFn:  () => cajaApi.resumen(mes, anio),
  });

  const abrirMut = useMutation({
    mutationFn: cajaApi.abrir,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setOpenAbrir(false); form.resetFields();
      message.success('Caja abierta');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const cerrarMut = useMutation({
    mutationFn: ({ id, body }: any) => cajaApi.cerrar(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setCerrarTarget(null); form.resetFields(); setSaldoFisicoInput(0);
      message.success('Caja cerrada correctamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const anularMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => cajaApi.anular(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setAnularTarget(null); formAnular.resetFields();
      message.success('Cierre anulado — la caja está abierta nuevamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  const sinApertura = !cajaData || (cajaData as any).estado === 'sin_apertura';
  const cajas: any[] = sinApertura
    ? []
    : Array.isArray((cajaData as any).cajas)
      ? (cajaData as any).cajas
      : [(cajaData as any)];

  const [searchHistorial, setSearchHistorial] = useState('');
  const [activeTab, setActiveTab]             = useState<'historial' | 'retiros'>('historial');

  // ── Módulo de Retiros ─────────────────────────────────────────────────────
  const [retirosDesde,   setRetirosDesde]   = useState(() => dayjs().startOf('month'));
  const [retirosHasta,   setRetirosHasta]   = useState(() => dayjs());
  const [retirosCajero,  setRetirosCajero]  = useState<number | undefined>(undefined);
  const [retirosCateg,   setRetirosCateg]   = useState<string | undefined>(undefined);
  const [retirosEstado,  setRetirosEstado]  = useState<string | undefined>(undefined);
  const [retiroAnular,   setRetiroAnular]   = useState<any>(null);
  const [retiroRechazar, setRetiroRechazar] = useState<any>(null);
  const [formAnularRet]  = Form.useForm();
  const [formRechazarRet] = Form.useForm();
  const [exportandoRet,  setExportandoRet]  = useState(false);
  // Pre-cierre: caja con retiros pendientes detectada antes de abrir el modal de cierre
  const [preCierreData, setPreCierreData] = useState<{ caja: any; pendientes: any[] } | null>(null);

  const { data: retirosReporte = [], isLoading: loadingRetiros, refetch: refetchRetiros } = useQuery<any[]>({
    queryKey: ['caja-retiros-reporte',
      retirosDesde.format('YYYY-MM-DD'), retirosHasta.format('YYYY-MM-DD'),
      retirosCajero, retirosCateg, retirosEstado],
    queryFn: () => retirosApi.reporte({
      desde: retirosDesde.format('YYYY-MM-DD'),
      hasta: retirosHasta.format('YYYY-MM-DD'),
      ...(retirosCajero !== undefined ? { vendedorId: String(retirosCajero) } : {}),
      ...(retirosCateg  ? { categoria: retirosCateg }  : {}),
      ...(retirosEstado ? { estado:    retirosEstado  } : {}),
    }),
    staleTime: 30_000,
    enabled: esAdmin,
  });

  const autorizarRetiroMut = useMutation({
    mutationFn: (id: number) => retirosApi.autorizar(id),
    onSuccess: () => {
      message.success('Retiro autorizado ✓');
      qc.invalidateQueries({ queryKey: ['caja-retiros-reporte'] });
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al autorizar'),
  });

  const anularRetiroMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => retirosApi.anular(id, motivo),
    onSuccess: () => {
      message.success('Retiro anulado ✓');
      setRetiroAnular(null); formAnularRet.resetFields();
      qc.invalidateQueries({ queryKey: ['caja-retiros-reporte'] });
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-retiros-cierre'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  const rechazarRetiroMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => retirosApi.rechazar(id, motivo),
    onSuccess: () => {
      message.success('Retiro rechazado ✓ — el monto queda en el cuadre del cierre');
      setRetiroRechazar(null); formRechazarRet.resetFields();
      qc.invalidateQueries({ queryKey: ['caja-retiros-reporte'] });
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-retiros-cierre'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al rechazar'),
  });

  const exportarRetiros = async () => {
    setExportandoRet(true);
    try {
      const data = retirosReporte;   // ya tiene TODOS (sin paginar)
      if (!data.length) { message.warning('No hay retiros para exportar'); return; }
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const filas = data.map((r: any) => ({
        'No.':           r.numero ?? `RET-${String(r.id).padStart(5, '0')}`,
        'Fecha caja':    String(r.cajaFecha ?? '').substring(0, 10),
        'Hora':          r.createdAt ? new Date(r.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '',
        'Cajero':        r.cajeroNombre ?? '',
        'Categoría':     CATEGORIA_LABELS[r.categoria] ?? r.categoria ?? '',
        'Monto':         Number(r.monto ?? 0),
        'Descripción':   r.descripcion ?? '',
        'Estado':        ESTADO_RETIRO_LABEL[r.estado] ?? r.estado ?? '',
        'Autorizó':      r.autorizadorNombre ?? '',
        'Autorizado en': r.autorizadoEn ? new Date(r.autorizadoEn).toLocaleString('es-DO') : '',
        'Motivo anulación': r.motivoAnulacion ?? '',
        'Anuló':         r.anuladoPorNombre ?? '',
        'Motivo rechazo':   r.motivoRechazo ?? '',
        'Rechazó':       r.rechazadoPorNombre ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      ws['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 7 }, { wch: 18 },
        { wch: 20 }, { wch: 12 }, { wch: 34 }, { wch: 12 }, { wch: 18 },
        { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Retiros');
      const desde = retirosDesde.format('YYYY-MM-DD');
      const hasta = retirosHasta.format('YYYY-MM-DD');
      XLSX.writeFile(wb, `Retiros-${desde}_${hasta}.xlsx`);
    } finally { setExportandoRet(false); }
  };

  // Retiros del cierre activo en el drawer
  const { data: retirosDetalle = [] } = useQuery<any[]>({
    queryKey: ['caja-retiros-cierre', detalleCierre?.id],
    queryFn: () => retirosApi.listar(detalleCierre!.id),
    enabled: !!detalleCierre,
    staleTime: 60_000,
  });

  // ── Pre-cierre: verifica retiros pendientes antes de abrir modal de cierre ─
  const iniciarCierre = async (caja: any) => {
    const nombre        = caja.vendedorNombre ?? 'Administrador';
    const totalIngresos = Number(caja.ventasEfectivo ?? 0) + Number(caja.ventasTarjeta ?? 0) + Number(caja.ventasTransferencia ?? 0);
    const saldoEsperado = Number(caja.saldoApertura ?? 0) + totalIngresos
      - Number(caja.gastosEfectivo ?? 0) - Number(caja.retiros ?? 0);

    try {
      const todos: any[] = await retirosApi.listar(caja.id);
      const pendientes   = todos.filter((r: any) => r.estado === 'pendiente');
      if (pendientes.length > 0) {
        setPreCierreData({ caja, pendientes });
        return;
      }
    } catch {
      // Si falla el fetch de retiros, continuamos con el cierre normal
    }

    setCerrarTarget({
      id: caja.id, nombre, saldoEsperado,
      saldoApertura:         Number(caja.saldoApertura ?? 0),
      ventasEfectivo:        Number(caja.ventasEfectivo ?? 0),
      ventasTarjeta:         Number(caja.ventasTarjeta ?? 0),
      ventasTransferencia:   Number(caja.ventasTransferencia ?? 0),
      cobrosRecibidos:       Number(caja.cobrosRecibidos ?? 0),
      totalAnticipos:        Number(caja.totalAnticipos  ?? 0),
      gastosEfectivo:        Number(caja.gastosEfectivo  ?? 0),
      retiros:               Number(caja.retiros ?? 0),
      cantidadTransacciones: caja.cantidadTransacciones ?? 0,
      fecha:                 caja.fecha ?? '',
    });
    form.resetFields(); setSaldoFisicoInput(0);
  };

  // ── Diálogo de impresión unificado ────────────────────────────────────────
  const [printTarget, setPrintTarget]       = useState<any>(null);
  const [printFormat, setPrintFormat]       = useState<'ticket'|'pdf'|'excel'>('ticket');
  const [printDetalle, setPrintDetalle]     = useState(false);
  const [printLoading, setPrintLoading]     = useState(false);

  // Filtro local de texto; el historial ahora incluye también cajas abierta (huérfanas de días anteriores)
  const historialCerrados = useMemo(() => {
    const base: any[] = historial?.data ?? [];
    if (!searchHistorial.trim()) return base;
    const q = searchHistorial.toLowerCase();
    return base.filter((r: any) =>
      String(r.vendedorNombre ?? '').toLowerCase().includes(q) ||
      String(r.fecha ?? '').includes(q)
    );
  }, [historial, searchHistorial]);

  // Cajas huérfanas: abiertas en días ANTERIORES (no hoy) — el cajero quedó bloqueado hasta cerrarlas
  const cajasHuerfanas = useMemo(() => {
    // Fecha de hoy en local como string YYYY-MM-DD, sin conversión UTC
    const h = new Date();
    const hoyStr = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    return (historial?.data ?? []).filter((r: any) => {
      if (r.estado !== 'abierta') return false;
      // Comparamos strings YYYY-MM-DD directamente para evitar conversión de zona horaria
      const fechaCaja = String(r.fecha ?? '').substring(0, 10);
      return fechaCaja < hoyStr;
    });
  }, [historial]);

  // Calcular diferencia en tiempo real para el modal de cierre
  const diferenciaCierre = saldoFisicoInput - (cerrarTarget?.saldoEsperado ?? 0);

  const imprimirCierre = async (r: any) => {
    const empRes = await api.get('/configuracion/empresa')
      .then(res => res.data?.data ?? res.data)
      .catch(() => ({}));
    const empConf   = (empRes.configuracion ?? {}) as any;
    const tipoImp   = empConf.posTipoImpresora ?? '80mm';
    const IMP_CFG: Record<string, { width: string; fontSize: string; paddingLR: string }> = {
      '58mm':    { width: '58mm',  fontSize: '10pt', paddingLR: '3mm' },
      '80mm':    { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
      'carta':   { width: '210mm', fontSize: '12pt', paddingLR: '15mm' },
      'ninguna': { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
    };
    const prn = IMP_CFG[tipoImp] ?? IMP_CFG['80mm'];
    const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const f   = (v: number) => `RD$${v.toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const line = () => `<div class="sep">--------------------------------</div>`;
    const row  = (lbl: string, val: string, bold = false) =>
      `<div class="row${bold?' bold':''}"><span>${esc(lbl)}</span><span>${esc(val)}</span></div>`;

    const totalIngresos = Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0);
    const diferencia    = Number(r.diferencia ?? 0);
    const difLabel = diferencia === 0 ? 'CUADRADO' : diferencia > 0 ? `+${f(diferencia)} SOBRANTE` : `${f(diferencia)} FALTANTE`;

    // Desglose de billetes (si existe)
    const desgloseBilletes: Record<string,number> = r.desgloseBilletes ?? {};
    const billetesRows = Object.entries(desgloseBilletes)
      .filter(([,qty]) => Number(qty) > 0)
      .map(([den,qty]) => row(`  ${Number(den).toLocaleString()} x${qty}:`, f(Number(den)*Number(qty))))
      .join('\n');
    const totalBilletes = Object.entries(desgloseBilletes)
      .reduce((s,[den,qty]) => s + Number(den)*Number(qty), 0);

    // Desglose de pago (si existe)
    const PAGO_LABELS: Record<string,string> = {
      efectivo:'Efectivo', tarjetaCredito:'Tarjeta Crédito', tarjetaDebito:'Tarjeta Débito',
      cheque:'Cheque', transferencia:'Transferencia', otro:'Otro', deposito:'Depósito', documentos:'Documentos',
    };
    const desglosePago: Record<string,string> = r.desglosePago ?? {};
    const pagoRows = Object.entries(desglosePago)
      .filter(([,v]) => Number(v) > 0)
      .map(([k,v]) => row(`  ${PAGO_LABELS[k] ?? k}:`, f(Number(v))))
      .join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @media print { @page { size:${prn.width} auto; margin:0; } }
  body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
    width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
    color:#000;background:#fff;-webkit-font-smoothing:none;font-smooth:never}
  .center{text-align:center}
  .row{display:flex;justify-content:space-between;gap:4px}
  .bold{font-weight:900}
  .sep{color:#000;margin:2px 0}
  .small{font-size:0.85em}
  .xlarge{font-size:1.2em;font-weight:900}
</style></head><body>
${empRes.razonSocial ?? empRes.nombre ? `<div class="center bold">${esc(empRes.razonSocial ?? empRes.nombre)}</div>` : ''}
${empRes.rnc        ? `<div class="center small">RNC: ${esc(empRes.rnc)}</div>` : ''}
${empRes.direccion  ? `<div class="center small">${esc(empRes.direccion)}</div>` : ''}
${empRes.telefono   ? `<div class="center small">Tel: ${esc(empRes.telefono)}</div>` : ''}
${line()}
<div class="center bold" style="font-size:1.1em;letter-spacing:1px">CIERRE DE CAJA</div>
${line()}
${row('Cajero:',  r.vendedorNombre ?? 'Administrador')}
${row('Fecha:',   String(r.fecha ?? '').substring(0, 10))}
${row('Estado:',  (r.estado ?? '').toUpperCase())}
${r.cantidadTransacciones != null ? row('Transacciones:', String(r.cantidadTransacciones)) : ''}
${line()}
<div class="small bold">INGRESOS DEL TURNO</div>
${row('Ventas efectivo:',    f(Number(r.ventasEfectivo      ?? 0)))}
${row('Ventas tarjeta:',     f(Number(r.ventasTarjeta       ?? 0)))}
${row('Ventas transfer.:',   f(Number(r.ventasTransferencia ?? 0)))}
${row('Cobros recibidos:',   f(Number(r.cobrosRecibidos     ?? 0)))}
${Number(r.totalAnticipos ?? 0) > 0 ? row('Anticipos:', f(Number(r.totalAnticipos))) : ''}
${row('Total ingresos:', f(totalIngresos), true)}
${line()}
<div class="small bold">EGRESOS</div>
${row('Gastos:',  f(Number(r.gastosEfectivo ?? 0)))}
${row('Retiros:', f(Number(r.retiros        ?? 0)))}
${line()}
<div class="small bold">CUADRE</div>
${row('Apertura:',          f(Number(r.saldoApertura ?? 0)))}
${row('Efectivo esperado:', f(Number(r.saldoCierre   ?? 0)))}
${row('Efectivo contado:',  f(Number(r.saldoFisico   ?? 0)))}
${line()}
<div class="center xlarge">${esc(difLabel)}</div>
${billetesRows ? `${line()}<div class="small bold">DESGLOSE DE BILLETES</div>\n${billetesRows}\n${row('Total billetes:', f(totalBilletes), true)}` : ''}
${pagoRows     ? `${line()}<div class="small bold">DESGLOSE DE PAGO</div>\n${pagoRows}` : ''}
${r.notas      ? `${line()}<div class="small">Nota: ${esc(r.notas)}</div>` : ''}
${line()}
<div class="center bold">** CIERRE DE CAJA **</div>
<div class="center small">Documento interno</div>
${line()}
</body></html>`;

    imprimirReciboTermico(html);
  };

  const imprimirPDFCierre = async (r: any) => {
    try {
      const res = await api.get(`/caja/${r.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const win = window.open(url, '_blank');
      if (!win) { imprimirCierre(r); URL.revokeObjectURL(url); return; }
      // El evento 'load' no dispara para pestañas PDF en navegadores modernos.
      // Se usa un delay para dar tiempo al visor de PDF a inicializarse.
      setTimeout(() => {
        try { win.print(); } catch { /* usuario puede imprimir manualmente */ }
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }, 1_500);
    } catch {
      // PDF backend no configurado → generar impresión HTML como alternativa
      imprimirCierre(r);
    }
  };

  // ── Helpers de formato de hora / dinero para el detalle ─────────────────
  const fmtHora = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const PAGO_LABELS_FE: Record<number, string> = {
    1: 'Efectivo', 2: 'Transferencia', 3: 'Tarjeta',
    4: 'Crédito', 5: 'Permuta', 6: 'NC',
  };

  const fmtFormasPago = (fps: { tipo: number; monto: number }[]): string =>
    fps.length === 0
      ? '—'
      : fps.map(fp => `${PAGO_LABELS_FE[fp.tipo] ?? `T${fp.tipo}`} ${fmt.money(fp.monto)}`).join(' / ');

  // ── Impresión de ticket térmico con detalle de facturas ────────────────
  const imprimirTicketConDetalle = async (r: any, detalle: any) => {
    const empRes = await api.get('/configuracion/empresa')
      .then(res => res.data?.data ?? res.data)
      .catch(() => ({}));
    const empConf = (empRes.configuracion ?? {}) as any;
    const tipoImp = empConf.posTipoImpresora ?? '80mm';
    const IMP_CFG: Record<string, { width: string; fontSize: string; paddingLR: string }> = {
      '58mm':    { width: '58mm',  fontSize: '10pt', paddingLR: '3mm' },
      '80mm':    { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
      'carta':   { width: '210mm', fontSize: '12pt', paddingLR: '15mm' },
      'ninguna': { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
    };
    const prn  = IMP_CFG[tipoImp] ?? IMP_CFG['80mm'];
    const esc  = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const f    = (v: number) => `RD$${v.toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const line = () => `<div class="sep">--------------------------------</div>`;
    const row  = (lbl: string, val: string, bold = false) =>
      `<div class="row${bold?' bold':''}"><span>${esc(lbl)}</span><span>${esc(val)}</span></div>`;

    const totalIngresos = Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0);
    const diferencia    = Number(r.diferencia ?? 0);
    const difLabel = diferencia === 0 ? 'CUADRADO' : diferencia > 0 ? `+${f(diferencia)} SOBRANTE` : `${f(diferencia)} FALTANTE`;

    // Sección detalle de facturas
    let seccionDetalle = '';
    if (detalle?.facturas?.length > 0) {
      const filas = detalle.facturas.map((fac: any) =>
        `<div class="fac-row${fac.cancelada?' anulada':''}">
          <div class="fac-top">
            <span class="fac-num">${esc(fac.folio)}${fac.encf ? ` · ${esc(fac.encf)}` : ''}${fac.cancelada ? ' [ANULADA]' : ''}</span>
            <span class="fac-total">${f(fac.cancelada ? 0 : fac.total)}</span>
          </div>
          <div class="fac-sub">${esc(fmtHora(fac.hora))} · ${esc(fac.clienteNombre)} · ${esc(fmtFormasPago(fac.formasPago))}</div>
        </div>`
      ).join('');

      const totPagoRows = Object.entries(detalle.totalesPago ?? {})
        .map(([k,v]) => row(`  ${k}:`, f(Number(v))))
        .join('\n');

      seccionDetalle = `
        ${line()}
        <div class="small bold">FACTURAS DEL TURNO (${detalle.resumen?.totalFacturas ?? 0} emitidas${detalle.resumen?.totalCanceladas ? `, ${detalle.resumen.totalCanceladas} anuladas` : ''})</div>
        <style>
          .fac-row{padding:2px 0;border-bottom:1px dotted #999;margin-bottom:1px}
          .fac-row.anulada{opacity:0.55;text-decoration:line-through}
          .fac-top{display:flex;justify-content:space-between}
          .fac-num{font-size:0.8em;font-weight:700}
          .fac-total{font-weight:700}
          .fac-sub{font-size:0.75em;color:#555}
        </style>
        ${filas}
        ${line()}
        <div class="small bold">TOTALES POR FORMA DE PAGO</div>
        ${totPagoRows}
      `;
    }

    const desgloseBilletes: Record<string,number> = r.desgloseBilletes ?? {};
    const billetesRows = Object.entries(desgloseBilletes)
      .filter(([,qty]) => Number(qty) > 0)
      .map(([den,qty]) => row(`  ${Number(den).toLocaleString()} x${qty}:`, f(Number(den)*Number(qty))))
      .join('\n');
    const totalBilletes = Object.entries(desgloseBilletes)
      .reduce((s,[den,qty]) => s + Number(den)*Number(qty), 0);
    const desglosePago: Record<string,string> = r.desglosePago ?? {};
    const PAGO_LABELS: Record<string,string> = {
      efectivo:'Efectivo', tarjetaCredito:'Tarjeta Crédito', tarjetaDebito:'Tarjeta Débito',
      cheque:'Cheque', transferencia:'Transferencia', otro:'Otro', deposito:'Depósito', documentos:'Documentos',
    };
    const pagoRows = Object.entries(desglosePago)
      .filter(([,v]) => Number(v) > 0)
      .map(([k,v]) => row(`  ${PAGO_LABELS[k] ?? k}:`, f(Number(v))))
      .join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @media print { @page { size:${prn.width} auto; margin:0; } }
  body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
    width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
    color:#000;background:#fff;-webkit-font-smoothing:none;font-smooth:never}
  .center{text-align:center}
  .row{display:flex;justify-content:space-between;gap:4px}
  .bold{font-weight:900}
  .sep{color:#000;margin:2px 0}
  .small{font-size:0.85em}
  .xlarge{font-size:1.2em;font-weight:900}
</style></head><body>
${empRes.razonSocial ?? empRes.nombre ? `<div class="center bold">${esc(empRes.razonSocial ?? empRes.nombre)}</div>` : ''}
${empRes.rnc        ? `<div class="center small">RNC: ${esc(empRes.rnc)}</div>` : ''}
${empRes.direccion  ? `<div class="center small">${esc(empRes.direccion)}</div>` : ''}
${empRes.telefono   ? `<div class="center small">Tel: ${esc(empRes.telefono)}</div>` : ''}
${line()}
<div class="center bold" style="font-size:1.1em;letter-spacing:1px">CIERRE DE CAJA</div>
${line()}
${row('Cajero:',  r.vendedorNombre ?? 'Administrador')}
${row('Fecha:',   String(r.fecha ?? '').substring(0, 10))}
${row('Estado:',  (r.estado ?? '').toUpperCase())}
${r.cantidadTransacciones != null ? row('Transacciones:', String(r.cantidadTransacciones)) : ''}
${line()}
<div class="small bold">INGRESOS DEL TURNO</div>
${row('Ventas efectivo:',    f(Number(r.ventasEfectivo      ?? 0)))}
${row('Ventas tarjeta:',     f(Number(r.ventasTarjeta       ?? 0)))}
${row('Ventas transfer.:',   f(Number(r.ventasTransferencia ?? 0)))}
${row('Cobros recibidos:',   f(Number(r.cobrosRecibidos     ?? 0)))}
${Number(r.totalAnticipos ?? 0) > 0 ? row('Anticipos:', f(Number(r.totalAnticipos))) : ''}
${row('Total ingresos:', f(totalIngresos), true)}
${line()}
<div class="small bold">EGRESOS</div>
${row('Gastos:',  f(Number(r.gastosEfectivo ?? 0)))}
${row('Retiros:', f(Number(r.retiros        ?? 0)))}
${line()}
<div class="small bold">CUADRE</div>
${row('Apertura:',          f(Number(r.saldoApertura ?? 0)))}
${row('Efectivo esperado:', f(Number(r.saldoCierre   ?? 0)))}
${row('Efectivo contado:',  f(Number(r.saldoFisico   ?? 0)))}
${line()}
<div class="center xlarge">${esc(difLabel)}</div>
${billetesRows ? `${line()}<div class="small bold">DESGLOSE DE BILLETES</div>\n${billetesRows}\n${row('Total billetes:', f(totalBilletes), true)}` : ''}
${pagoRows     ? `${line()}<div class="small bold">DESGLOSE DE PAGO</div>\n${pagoRows}` : ''}
${seccionDetalle}
${r.notas      ? `${line()}<div class="small">Nota: ${esc(r.notas)}</div>` : ''}
${line()}
<div class="center bold">** CIERRE DE CAJA **</div>
<div class="center small">Documento interno</div>
${line()}
</body></html>`;

    imprimirReciboTermico(html);
  };

  // ── Exportar cierre a Excel ────────────────────────────────────────────────
  const exportarCierreExcel = async (r: any, detalle: any) => {
    const fecha = String(r.fecha ?? '').substring(0, 10);
    const cajero = r.vendedorNombre ?? 'Administrador';

    // Hoja 1: Resumen del cierre
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const resumenRows = [
      { 'Concepto': 'Cajero',              'Valor': cajero },
      { 'Concepto': 'Fecha',               'Valor': fecha },
      { 'Concepto': 'Estado',              'Valor': (r.estado ?? '').toUpperCase() },
      { 'Concepto': 'Transacciones',       'Valor': r.cantidadTransacciones ?? 0 },
      { 'Concepto': '',                    'Valor': '' },
      { 'Concepto': 'Ventas efectivo',     'Valor': Number(r.ventasEfectivo      ?? 0) },
      { 'Concepto': 'Ventas tarjeta',      'Valor': Number(r.ventasTarjeta       ?? 0) },
      { 'Concepto': 'Ventas transferencia','Valor': Number(r.ventasTransferencia ?? 0) },
      { 'Concepto': 'Cobros recibidos',    'Valor': Number(r.cobrosRecibidos     ?? 0) },
      { 'Concepto': 'Anticipos',           'Valor': Number(r.totalAnticipos      ?? 0) },
      { 'Concepto': '',                    'Valor': '' },
      { 'Concepto': 'Gastos',              'Valor': Number(r.gastosEfectivo ?? 0) },
      { 'Concepto': 'Retiros',             'Valor': Number(r.retiros        ?? 0) },
      { 'Concepto': '',                    'Valor': '' },
      { 'Concepto': 'Apertura (fondo)',    'Valor': Number(r.saldoApertura ?? 0) },
      { 'Concepto': 'Efectivo esperado',   'Valor': Number(r.saldoCierre   ?? 0) },
      { 'Concepto': 'Efectivo contado',    'Valor': Number(r.saldoFisico   ?? 0) },
      { 'Concepto': 'Diferencia',          'Valor': Number(r.diferencia    ?? 0) },
    ];
    const wsRes = XLSX.utils.json_to_sheet(resumenRows);
    wsRes['!cols'] = [{ wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

    // Hoja 2: Facturas del turno (solo si hay detalle)
    if (detalle?.facturas?.length > 0) {
      const facFilas = detalle.facturas.map((fac: any) => ({
        'No. Factura':  fac.folio,
        'e-NCF':        fac.encf ?? '',
        'Hora':         fmtHora(fac.hora),
        'Cliente':      fac.clienteNombre,
        'Forma de pago': fmtFormasPago(fac.formasPago),
        'Subtotal':     fac.cancelada ? 0 : fac.subtotal,
        'ITBIS':        fac.cancelada ? 0 : fac.iva,
        'Total':        fac.cancelada ? 0 : fac.total,
        'Estado':       fac.cancelada ? 'ANULADA' : (fac.estado ?? '').toUpperCase(),
      }));

      // Fila totales
      facFilas.push({
        'No. Factura':   'TOTALES',
        'e-NCF':         '',
        'Hora':          '',
        'Cliente':       `${detalle.resumen?.totalFacturas ?? 0} emitidas, ${detalle.resumen?.totalCanceladas ?? 0} anuladas`,
        'Forma de pago': '',
        'Subtotal':      detalle.resumen?.subtotal ?? 0,
        'ITBIS':         detalle.resumen?.iva ?? 0,
        'Total':         detalle.resumen?.total ?? 0,
        'Estado':        '',
      });

      const wsFac = XLSX.utils.json_to_sheet(facFilas);
      wsFac['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 24 },
        { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, wsFac, 'Facturas');

      // Hoja 3: Totales por forma de pago
      const totPagoFilas = Object.entries(detalle.totalesPago ?? {}).map(([k, v]) => ({
        'Forma de pago': k,
        'Total':         Number(v),
      }));
      if (totPagoFilas.length > 0) {
        const wsTot = XLSX.utils.json_to_sheet(totPagoFilas);
        wsTot['!cols'] = [{ wch: 20 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsTot, 'Por forma de pago');
      }
    }

    XLSX.writeFile(wb, `Cierre-${cajero.replace(/\s+/g,'-')}-${fecha}.xlsx`);
  };

  // ── Ejecutar impresión según formato elegido ──────────────────────────────
  const ejecutarImpresion = async (r: any, formato: 'ticket'|'pdf'|'excel', conDetalle: boolean) => {
    setPrintLoading(true);
    try {
      let detalle: any = null;
      if (conDetalle && (formato === 'pdf' || formato === 'excel')) {
        detalle = await cajaApi.facturasDetalle(r.id);
      }

      if (formato === 'ticket') {
        // Ticket: siempre resumen (sin detalle de facturas)
        await imprimirCierre(r);
      } else if (formato === 'pdf') {
        if (conDetalle && detalle?.facturas?.length > 0) {
          // PDF con detalle: generar HTML extendido e imprimir
          await imprimirTicketConDetalle(r, detalle);
        } else {
          await imprimirPDFCierre(r);
        }
      } else {
        // Excel
        await exportarCierreExcel(r, conDetalle ? detalle : null);
      }
      setPrintTarget(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Error al generar el documento');
    } finally {
      setPrintLoading(false);
    }
  };

  if (!esAdmin) {
    return (
      <div style={{ padding: 48, maxWidth: 480, margin: '0 auto' }}>
        <Alert type="error" showIcon
          message="Acceso no autorizado"
          description="Esta vista requiere rol Administrador o Contador." />
      </div>
    );
  }

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Caja Diaria</Title></Col>
        <Col>
          <Space wrap>
            <RefreshByKeyButton queryKey={['caja-hoy']} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <VideoTutorialButton />
            <Button
              type="primary"
              icon={<UnlockOutlined />}
              size={isMobile ? 'large' : 'middle'}
              block={isMobile}
              onClick={() => {
                setOpenAbrir(true);
                form.setFieldsValue({
                  saldoApertura: 0,
                  vendedorId: esAdmin ? undefined : user?.id,
                  notas: undefined,
                });
              }}
            >
              Abrir caja
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Estado del día */}
      {isLoading ? <Spin /> : sinApertura ? (
        <Alert type="warning" showIcon
          message="No hay cajas abiertas hoy"
          description="Abre una caja por cada cajero para registrar transacciones del día."
          action={<Button onClick={() => setOpenAbrir(true)}>Abrir caja ahora</Button>}
          style={{ marginBottom: 16 }} />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {cajas.map((caja, i) => {
              const totalIngresos = Number(caja.ventasEfectivo ?? 0) + Number(caja.ventasTarjeta ?? 0) + Number(caja.ventasTransferencia ?? 0);
              const saldoEsperado = Number(caja.saldoApertura ?? 0) + totalIngresos
                - Number(caja.gastosEfectivo ?? 0) - Number(caja.retiros ?? 0);
              const nombre = caja.vendedorNombre ?? 'Administrador';
              return (
                <Col xs={24} lg={12} key={caja.id}>
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <Card size="small"
                      style={{ borderColor: caja.estado === 'abierta' ? '#10b981' : '#94a3b8', borderWidth: 1.5 }}
                      title={
                        <Space>
                          <Avatar size={28} style={{ background: avatarColor(nombre), fontSize: 12 }}>
                            {nombre.charAt(0).toUpperCase()}
                          </Avatar>
                          <Text strong>{nombre}</Text>
                          <Tag color={estadoColor[caja.estado]} style={{ margin: 0 }}>
                            {caja.estado.toUpperCase()}
                          </Tag>
                        </Space>
                      }
                      extra={
                        caja.estado === 'abierta' ? (
                          <Button size="small" danger icon={<LockOutlined />}
                            onClick={() => iniciarCierre(caja)}>
                            Cerrar caja
                          </Button>
                        ) : null
                      }
                    >
                      <Row gutter={[8, 8]}>
                        {[
                          { title: 'Apertura',      value: caja.saldoApertura,  color: '#6b7280' },
                          { title: 'Efectivo',       value: caja.ventasEfectivo, color: '#10b981' },
                          { title: 'Tarjeta',        value: caja.ventasTarjeta,  color: '#1677ff' },
                          { title: 'Saldo esperado', value: saldoEsperado,       color: '#7c3aed' },
                        ].map(k => (
                          <Col xs={12} sm={6} key={k.title}>
                            <Statistic title={k.title} value={k.value ?? 0}
                              formatter={v => fmt.money(Number(v))}
                              valueStyle={{ color: k.color, fontSize: 13 }} />
                          </Col>
                        ))}
                      </Row>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                        {caja.cantidadTransacciones ?? 0} transacciones · {fmt.date(caja.fecha)}
                        {caja.estado === 'cerrada' && Number(caja.diferencia) !== 0 && (
                          <Text style={{ marginLeft: 8, fontWeight: 600, color: Number(caja.diferencia) > 0 ? '#10b981' : '#ef4444' }}>
                            · Diferencia: {fmt.money(Math.abs(Number(caja.diferencia)))} {Number(caja.diferencia) > 0 ? '(sobrante)' : '(faltante)'}
                          </Text>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                </Col>
              );
            })}
          </Row>

          {resumenMes && (
            <Card title={`Resumen ${dayjs().format('MMMM YYYY')}`} size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 0]}>
                <Col xs={12} sm={6}><Statistic title="Total Ventas"     value={resumenMes.totalVentas}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Total Cobros"     value={resumenMes.totalCobros}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Diferencia Acum." value={resumenMes.diferenciaTotal}   formatter={v => fmt.money(Number(v))} valueStyle={{ color: Number(resumenMes.diferenciaTotal) < 0 ? '#ef4444' : '#10b981' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Días con diferencia" value={resumenMes.diasConDiferencia} /></Col>
              </Row>
            </Card>
          )}
        </>
      )}

      {/* Historial de Cierres + Retiros en tabs laterales */}
      <Tabs
        activeKey={activeTab}
        onChange={v => setActiveTab(v as 'historial' | 'retiros')}
        style={{ marginTop: 4 }}
        items={[
          {
            key: 'historial',
            label: <><HistoryOutlined /> Historial de Cierres</>,
            children: (
              <div style={{ paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <DatePicker
                    picker="month"
                    value={histFecha}
                    onChange={v => { setHistFecha(v ?? dayjs()); setHistPage(1); setSearchHistorial(''); }}
                    format="MMMM YYYY"
                    allowClear={false}
                    size="small"
                    style={{ width: 140 }}
                    disabledDate={d => d.isAfter(dayjs(), 'month')}
                  />
                  <Input
                    placeholder="Buscar cajero..."
                    prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                    value={searchHistorial}
                    onChange={e => setSearchHistorial(e.target.value)}
                    allowClear
                    size="small"
                    style={{ width: 180 }}
                  />
                </div>
                {cajasHuerfanas.length > 0 && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 10 }}
                    message={`${cajasHuerfanas.length === 1 ? '1 caja sin cerrar' : `${cajasHuerfanas.length} cajas sin cerrar`} de días anteriores`}
                    description={
                      <span>
                        {cajasHuerfanas.map((c: any) => {
                          // Parsear como string para evitar conversión UTC→local que cambia el día
                          const raw = String(c.fecha ?? '').substring(0, 10); // YYYY-MM-DD
                          const [anio, mes, dia] = raw.split('-');
                          const f = raw ? `${dia}/${mes}/${anio}` : '?';
                          return ` ${c.vendedorNombre ?? 'Admin'} (${f})`;
                        }).join(' · ')}
                        {' — Haz clic en la fila y ciérrala para desbloquear al cajero.'}
                      </span>
                    }
                  />
                )}
                {historialCerrados.length === 0 && cajasHuerfanas.length === 0 && !isLoading && (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Sin cierres registrados aún. Los cierres completados aparecerán aquí.
                  </Text>
                )}
                <Table size="small" scroll={{ x: 'max-content' }}
                  dataSource={historialCerrados}
                  rowKey="id"
                  pagination={{
                    current: histPage,
                    pageSize: 20,
                    total: historial?.meta?.total ?? 0,
                    showTotal: (t: number) => `${t} cierres`,
                    showSizeChanger: false,
                    onChange: (p: number) => { setHistPage(p); setSearchHistorial(''); },
                  }}
                  columns={filterColumns([
                    { title: 'Fecha',  dataIndex: 'fecha',  width: 100, render: (v: string) => fmt.date(v) },
                    {
                      title: 'Cajero', dataIndex: 'vendedorNombre', width: 150,
                      render: (v: string) => {
                        const n = v ?? 'Administrador';
                        return (
                          <Space size={4}>
                            <Avatar size={20} style={{ background: avatarColor(n), fontSize: 10 }}>{n.charAt(0)}</Avatar>
                            <Text style={{ fontSize: 12 }}>{n}</Text>
                          </Space>
                        );
                      },
                    },
                    { title: 'Estado', dataIndex: 'estado', width: 90,
                      render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v?.toUpperCase()}</Tag> },
                    { title: 'Apertura',       dataIndex: 'saldoApertura', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                    { title: 'Total Ingresos', key: 'ing', width: 120, align: 'right' as const,
                      render: (_: any, r: any) => fmt.money(Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0)) },
                    { title: 'Esperado',   dataIndex: 'saldoCierre', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                    { title: 'Contado',    dataIndex: 'saldoFisico', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                    { title: 'Diferencia', dataIndex: 'diferencia', width: 110, align: 'right' as const,
                      render: (v: number) => (
                        <Text strong style={{ color: v === 0 ? token.colorSuccess : v > 0 ? token.colorPrimary : token.colorError }}>
                          {v > 0 ? '+' : ''}{fmt.money(v)}
                        </Text>
                      )},
                    { title: 'Trans.', dataIndex: 'cantidadTransacciones', width: 70, align: 'center' as const },
                    {
                      title: '', key: 'acciones', width: 72, align: 'right' as const,
                      render: (_: any, r: any) => (
                        <TableActions
                          onView={() => setDetalleCierre(r)}
                          viewLabel="Ver detalle del cierre"
                          items={[
                            { key: 'imprimir', label: 'Imprimir cierre', icon: <PrinterOutlined />, onClick: () => setPrintTarget(r) },
                            ...(puedeAnular ? [
                              { type: 'divider' as const },
                              { key: 'anular', label: 'Anular cierre', icon: <RollbackOutlined />, danger: true,
                                disabled: r.estado === 'anulada',
                                onClick: () => { setAnularTarget({ id: r.id, nombre: r.vendedorNombre ?? 'Administrador', fecha: r.fecha }); formAnular.resetFields(); } },
                            ] : []),
                          ]}
                        />
                      ),
                    },
                  ])} />
              </div>
            ),
          },
          ...(esAdmin ? [{
            key: 'retiros',
            label: (() => {
              const n = (retirosReporte as any[]).filter((r: any) => r.estado === 'pendiente').length;
              return n > 0
                ? <Badge count={n} size="small" offset={[8, -2]}><span style={{ paddingRight: 6 }}><DollarOutlined /> Retiros</span></Badge>
                : <span><DollarOutlined /> Retiros</span>;
            })(),
            children: (
              <div style={{ paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <DatePicker.RangePicker
                    value={[retirosDesde, retirosHasta]}
                    onChange={v => { if (v) { setRetirosDesde(v[0]!); setRetirosHasta(v[1]!); } }}
                    allowClear={false} size="small" format="DD/MM/YYYY"
                    disabledDate={d => d.isAfter(dayjs(), 'day')}
                  />
                  <Select
                    placeholder="Cajero" allowClear size="small" style={{ width: 140 }}
                    value={retirosCajero}
                    onChange={v => setRetirosCajero(v)}
                    options={cajeros.map((c: any) => ({ value: c.id, label: c.nombre }))}
                  />
                  <Select
                    placeholder="Categoría" allowClear size="small" style={{ width: 160 }}
                    value={retirosCateg}
                    onChange={v => setRetirosCateg(v)}
                    options={CATEGORIA_OPTIONS}
                  />
                  <Select
                    placeholder="Estado" allowClear size="small" style={{ width: 130 }}
                    value={retirosEstado}
                    onChange={v => setRetirosEstado(v)}
                    options={[
                      { value: 'activo',    label: '✅ Autorizado' },
                      { value: 'pendiente', label: '⏳ Pendiente'  },
                      { value: 'anulado',   label: '⬜ Anulado'    },
                      { value: 'rechazado', label: '🚫 Rechazado'  },
                    ]}
                  />
                  <Tooltip title="Exportar todo el período filtrado (no solo la página)">
                    <Button size="small" icon={<FileExcelOutlined />} onClick={exportarRetiros}
                      loading={exportandoRet}>
                      Exportar
                    </Button>
                  </Tooltip>
                </div>
                {(retirosReporte as any[]).filter((r: any) => r.estado === 'pendiente').length > 0 && (
                  <Alert
                    type="warning" showIcon icon={<WarningOutlined />}
                    message={`${(retirosReporte as any[]).filter((r: any) => r.estado === 'pendiente').length} retiro(s) pendiente(s) de autorización`}
                    style={{ marginBottom: 12 }}
                  />
                )}
                <Table
                  size="small"
                  loading={loadingRetiros}
                  dataSource={retirosReporte}
                  rowKey="id"
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 20, showTotal: (t: number) => `${t} retiros`, showSizeChanger: false }}
                  rowClassName={(r: any) => r.estado === 'anulado' ? 'row-anulado' : r.estado === 'rechazado' ? 'row-rechazado' : ''}
                  columns={[
                    { title: '#', dataIndex: 'id', width: 90, fixed: 'left' as const,
                      render: (_v: number, row: any) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.numero ?? `RET-${String(_v).padStart(5,'0')}`}</span> },
                    { title: 'Fecha',    dataIndex: 'cajaFecha', width: 100,
                      render: (v: string) => String(v ?? '').substring(0, 10) },
                    { title: 'Hora',     dataIndex: 'createdAt', width: 65,
                      render: (v: string) => new Date(v).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) },
                    { title: 'Cajero',   dataIndex: 'cajeroNombre', width: 140,
                      render: (v: string) => {
                        const n = v ?? 'Admin';
                        return <Space size={4}><Avatar size={18} style={{ background: avatarColor(n), fontSize: 9 }}>{n[0]}</Avatar><span style={{ fontSize: 12 }}>{n}</span></Space>;
                      } },
                    { title: 'Categoría', dataIndex: 'categoria', width: 150,
                      render: (v: string) => CATEGORIA_LABELS[v] ?? v ?? '' },
                    { title: 'Monto',    dataIndex: 'monto', width: 110, align: 'right' as const,
                      render: (v: number, r: any) => (
                        <span style={{
                          fontWeight: 700,
                          color: r.estado === 'anulado' ? '#9ca3af'
                               : r.estado === 'rechazado' ? '#d97706'
                               : '#ef4444',
                          textDecoration: r.estado === 'anulado' ? 'line-through' : 'none',
                        }}>
                          {fmt.money(v)}
                        </span>
                      ) },
                    { title: 'Descripción', dataIndex: 'descripcion', width: 240,
                      render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
                    { title: 'Estado',   dataIndex: 'estado', width: 110,
                      render: (v: string) => <Tag color={ESTADO_RETIRO_COLOR[v] ?? 'default'}>{ESTADO_RETIRO_LABEL[v] ?? v}</Tag> },
                    { title: 'Autorizó / Rechazó', dataIndex: 'autorizadorNombre', width: 160,
                      render: (v: string, r: any) => {
                        if (r.estado === 'rechazado') return (
                          <Tooltip title={r.motivoRechazo ?? ''}>
                            <span style={{ fontSize: 11, color: '#d97706' }}>🚫 {r.rechazadoPorNombre ?? 'Rechazado'}</span>
                          </Tooltip>
                        );
                        if (v) return <span style={{ fontSize: 12, color: '#10b981' }}>✓ {v}</span>;
                        if (r.estado === 'pendiente') return <span style={{ fontSize: 11, color: '#f59e0b' }}>Sin autorizar</span>;
                        return null;
                      } },
                    { title: '', key: 'actions', width: 100, fixed: 'right' as const,
                      render: (_: any, r: any) => (
                        <Space size={4}>
                          {r.estado === 'pendiente' && (
                            <Tooltip title="Autorizar este retiro">
                              <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                                style={{ background: '#10b981', borderColor: '#10b981' }}
                                loading={autorizarRetiroMut.isPending}
                                onClick={() => autorizarRetiroMut.mutate(r.id)} />
                            </Tooltip>
                          )}
                          {r.estado === 'pendiente' && (
                            <Tooltip title="Rechazar — el supervisor no avala este retiro (el monto NO regresa a caja)">
                              <Button size="small" icon={<CloseCircleOutlined />}
                                style={{ borderColor: '#d97706', color: '#d97706' }}
                                onClick={() => { setRetiroRechazar(r); formRechazarRet.resetFields(); }} />
                            </Tooltip>
                          )}
                          {(r.estado === 'activo' || r.estado === 'pendiente') && (
                            <Tooltip title="Anular retiro — revierte el monto (solo caja abierta)">
                              <Button size="small" danger icon={<StopOutlined />}
                                onClick={() => { setRetiroAnular(r); formAnularRet.resetFields(); }} />
                            </Tooltip>
                          )}
                        </Space>
                      ) },
                  ]}
                />
                <style>{`.row-anulado td { opacity: 0.55; } .row-rechazado td { opacity: 0.7; background: #fffbeb; }`}</style>
              </div>
            ),
          }] : []),
        ]}
      />

      {/* Drawer detalle de cierre */}
      <Drawer
        title={
          <Space>
            <LockOutlined />
            {`Cierre — ${detalleCierre?.vendedorNombre ?? 'Administrador'} · ${detalleCierre?.fecha ? fmt.date(detalleCierre.fecha) : ''}`}
          </Space>
        }
        open={!!detalleCierre}
        onClose={() => setDetalleCierre(null)}
        width="min(480px, 95vw)"
        footer={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => setPrintTarget(detalleCierre)}>Imprimir cierre</Button>
            {detalleCierre?.estado === 'abierta' && (() => {
              const h = new Date();
              const hoyStr = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
              const esHuerfana = String(detalleCierre.fecha ?? '').substring(0, 10) < hoyStr;
              return esHuerfana ? (
                <Button danger icon={<LockOutlined />}
                  onClick={() => { iniciarCierre(detalleCierre); setDetalleCierre(null); }}>
                  Cerrar caja
                </Button>
              ) : null;
            })()}
            {puedeAnular && detalleCierre?.estado !== 'anulada' && detalleCierre?.estado !== 'abierta' && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { setAnularTarget({ id: detalleCierre.id, nombre: detalleCierre.vendedorNombre ?? 'Administrador', fecha: detalleCierre.fecha }); setDetalleCierre(null); formAnular.resetFields(); }}>
                Anular
              </Button>
            )}
          </Space>
        }
      >
        {detalleCierre && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cajero" span={2}>
                <Text strong>{detalleCierre.vendedorNombre ?? 'Administrador'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Fecha">{fmt.date(detalleCierre.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={estadoColor[detalleCierre.estado] ?? 'default'}>{detalleCierre.estado?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Transacciones">{detalleCierre.cantidadTransacciones ?? 0}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '8px 0' }}>Ingresos del turno</Divider>
            <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
              <Descriptions.Item label="Ventas efectivo">{fmt.money(Number(detalleCierre.ventasEfectivo ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Ventas tarjeta">{fmt.money(Number(detalleCierre.ventasTarjeta ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Ventas transferencia">{fmt.money(Number(detalleCierre.ventasTransferencia ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Cobros recibidos">
                {fmt.money(Number(detalleCierre.cobrosRecibidos ?? 0))}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '8px 0' }}>Egresos</Divider>
            <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
              <Descriptions.Item label="Gastos registrados">{fmt.money(Number(detalleCierre.gastosEfectivo ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Retiros (total)">{fmt.money(Number(detalleCierre.retiros ?? 0))}</Descriptions.Item>
            </Descriptions>
            {/* Detalle individual de retiros */}
            {retirosDetalle.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Retiros del turno
                </div>
                <Table
                  size="small"
                  dataSource={retirosDetalle}
                  rowKey="id"
                  pagination={false}
                  columns={[
                    { title: '#',      dataIndex: 'id', width: 78, render: (_v: number, row: any) => row.numero ?? `RET-${String(_v).padStart(5,'0')}` },
                    { title: 'Hora',   dataIndex: 'createdAt', width: 60,
                      render: (v: string) => new Date(v).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'}) },
                    { title: 'Categoría', dataIndex: 'categoria', width: 120,
                      render: (v: string) => CATEGORIA_LABELS[v] ?? v ?? '' },
                    { title: 'Monto',  dataIndex: 'monto', width: 90, align: 'right' as const,
                      render: (v: number, r: any) => (
                        <span style={{
                          color: r.estado === 'anulado' ? '#9ca3af'
                               : r.estado === 'rechazado' ? '#d97706'
                               : '#ef4444',
                          textDecoration: r.estado === 'anulado' ? 'line-through' : 'none',
                          fontWeight: 600,
                        }}>
                          {fmt.money(v)}
                        </span>
                      )},
                    { title: 'Estado', dataIndex: 'estado', width: 90,
                      render: (v: string) => <Tag color={ESTADO_RETIRO_COLOR[v] ?? 'default'} style={{ fontSize: 10 }}>
                        {ESTADO_RETIRO_LABEL[v] ?? v}
                      </Tag> },
                  ]}
                />
                {retirosDetalle.map((r: any) => (
                  <div key={r.id} style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    <strong>{r.numero ?? `RET-${String(r.id).padStart(5,'0')}`}:</strong> {r.descripcion}
                    {r.autorizadorNombre ? (
                      <span style={{ marginLeft: 6, color: '#10b981' }}>✓ {r.autorizadorNombre}</span>
                    ) : r.estado === 'rechazado' && r.rechazadoPorNombre ? (
                      <Tooltip title={r.motivoRechazo ?? ''}>
                        <span style={{ marginLeft: 6, color: '#d97706' }}>🚫 {r.rechazadoPorNombre}</span>
                      </Tooltip>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: '8px 0' }}>Cierre</Divider>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Apertura">{fmt.money(Number(detalleCierre.saldoApertura ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Efectivo esperado">
                <Text strong>{fmt.money(Number(detalleCierre.saldoCierre ?? 0))}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Efectivo contado">
                <Text strong>{fmt.money(Number(detalleCierre.saldoFisico ?? 0))}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Diferencia">
                <Text strong style={{
                  color: Number(detalleCierre.diferencia) === 0 ? token.colorSuccess
                       : Number(detalleCierre.diferencia) > 0 ? token.colorPrimary : token.colorError,
                  fontSize: 16,
                }}>
                  {Number(detalleCierre.diferencia) > 0 ? '+' : ''}{fmt.money(Number(detalleCierre.diferencia ?? 0))}
                  {Number(detalleCierre.diferencia) === 0 ? ' ✅' : Number(detalleCierre.diferencia) > 0 ? ' ↑ sobrante' : ' ↓ faltante'}
                </Text>
              </Descriptions.Item>
              {detalleCierre.notas && (
                <Descriptions.Item label="Notas" span={1}>{detalleCierre.notas}</Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>

      {/* Modal abrir caja */}
      <Modal
        title={<Space><UnlockOutlined style={{ color: '#10B981' }} />Abrir Caja</Space>}
        open={openAbrir} onCancel={() => setOpenAbrir(false)} footer={null} width="min(420px, 95vw)"
      >
        <Form form={form} layout="vertical" onFinish={v => abrirMut.mutate(v)}>
          <Form.Item name="vendedorId" label="Cajero responsable" rules={[{ required: true, message: 'Selecciona un cajero' }]}>
            <Select
              size="large"
              placeholder="Seleccionar cajero..."
              showSearch
              filterOption={(input: string, opt: any) =>
                (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={cajeros.map((u: any) => ({
                value: u.id,
                label: `${u.codigo ? u.codigo + ' — ' : ''}${u.nombre}`,
                sub:   u.email ?? '',
              }))}
              optionRender={(opt: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <Avatar size={22} style={{ background: avatarColor(opt.data.label as string), fontSize: 10, flexShrink: 0 }}>
                    {(opt.data.label as string)?.charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.data.label as string}</div>
                    <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{opt.data.sub}</div>
                  </div>
                </div>
              )}
            />
          </Form.Item>
          <Form.Item name="saldoApertura" label="Saldo de apertura (RD$)">
            <InputNumber
              style={{ width: '100%' }} min={0} precision={2} size="large" autoFocus
              formatter={v => `RD$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v!.replace(/RD\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: -12, marginBottom: 16 }}>
            Ingresa el efectivo inicial en la caja
          </div>
          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={2} placeholder="Ej: Billetes recibidos del banco, apertura especial..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenAbrir(false)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" icon={<UnlockOutlined />}
                loading={abrirMut.isPending}
                style={{ background: '#10B981', borderColor: '#10B981' }}>
                Abrir caja
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal cerrar caja — resumen completo + diferencia en tiempo real */}
      <Modal
        title={<Space><LockOutlined style={{ color: '#EF4444' }} />{`Cerrar caja — ${cerrarTarget?.nombre ?? ''}`}</Space>}
        open={!!cerrarTarget}
        onCancel={() => { setCerrarTarget(null); setSaldoFisicoInput(0); }}
        footer={null}
        width="min(460px, 95vw)"
      >
        {/* ── Resumen del turno ── */}
        <div style={{
          background: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: token.colorTextTertiary, marginBottom: 10,
          }}>
            Resumen del turno
          </div>

          {[
            { label: 'Ventas efectivo',      value: cerrarTarget?.ventasEfectivo ?? 0,      color: '#10B981' },
            { label: 'Ventas tarjeta',       value: cerrarTarget?.ventasTarjeta ?? 0,       color: undefined },
            { label: 'Ventas transferencia', value: cerrarTarget?.ventasTransferencia ?? 0, color: undefined },
            { label: 'Cobros recibidos',     value: cerrarTarget?.cobrosRecibidos ?? 0,     color: '#0EA5E9' },
            { label: 'Anticipos recibidos',  value: cerrarTarget?.totalAnticipos ?? 0,      color: '#7C3AED' },
            { label: 'Apertura (fondo)',     value: cerrarTarget?.saldoApertura ?? 0,       color: undefined },
            { label: 'Gastos registrados',   value: cerrarTarget?.gastosEfectivo ?? 0,      color: '#EF4444', signo: true },
            { label: 'Retiros',              value: cerrarTarget?.retiros ?? 0,             color: '#EF4444', signo: true },
          ].filter(item => item.value > 0).map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
              <span style={{ color: token.colorTextSecondary }}>{item.label}</span>
              <span style={{ fontWeight: 500, color: item.color ?? token.colorText }}>
                {item.signo ? '− ' : ''}{fmt.money(item.value)}
              </span>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${token.colorBorder}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>Efectivo esperado</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>{fmt.money(cerrarTarget?.saldoEsperado ?? 0)}</span>
          </div>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, textAlign: 'center', marginTop: 6 }}>
            {cerrarTarget?.cantidadTransacciones ?? 0} transacciones · {cerrarTarget?.fecha ? fmt.date(cerrarTarget.fecha) : ''}
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={v => cerrarMut.mutate({ id: cerrarTarget!.id, body: v })}>
          <Form.Item
            name="saldoFisico"
            label={<span style={{ fontWeight: 500 }}>Efectivo físico contado (RD$)</span>}
            rules={[{ required: true, message: 'Ingresa el monto contado' }]}
          >
            <InputNumber
              style={{ width: '100%', fontSize: 16 }} size="large"
              min={0} precision={2} autoFocus placeholder="0.00"
              onChange={v => setSaldoFisicoInput(Number(v ?? 0))}
            />
          </Form.Item>

          {/* Diferencia en tiempo real */}
          {saldoFisicoInput > 0 && (() => {
            const difColor = diferenciaCierre === 0 ? token.colorSuccess : diferenciaCierre > 0 ? token.colorPrimary : token.colorError;
            const difBg    = diferenciaCierre === 0 ? token.colorSuccessBg : diferenciaCierre > 0 ? token.colorPrimaryBg : token.colorErrorBg;
            return (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 8, marginBottom: 16, marginTop: -8,
                background: difBg, border: `1px solid ${difColor}55`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>Diferencia</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: difColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {diferenciaCierre === 0 ? '✅' : diferenciaCierre > 0 ? '↑' : '↓'}
                  {' '}{fmt.money(Math.abs(diferenciaCierre))}
                  {diferenciaCierre === 0 ? ' Cuadrado' : diferenciaCierre > 0 ? ' Sobrante' : ' Faltante'}
                </span>
              </div>
            );
          })()}

          <Form.Item name="notas" label="Observaciones (opcional)">
            <Input.TextArea rows={2} placeholder="Ej: Billete roto de RD$500, cliente pagó con dólares..." />
          </Form.Item>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setCerrarTarget(null); setSaldoFisicoInput(0); }}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" danger htmlType="submit" icon={<LockOutlined />} loading={cerrarMut.isPending}>
                Confirmar cierre
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal imprimir cierre unificado */}
      <Modal
        title={<Space><PrinterOutlined />Imprimir cierre de caja</Space>}
        open={!!printTarget}
        onCancel={() => setPrintTarget(null)}
        width="min(420px, 95vw)"
        footer={
          <Space>
            <Button onClick={() => setPrintTarget(null)}>Cancelar</Button>
            <Button
              type="primary"
              icon={printFormat === 'excel' ? <FileExcelOutlined /> : printFormat === 'pdf' ? <FilePdfOutlined /> : <PrinterOutlined />}
              loading={printLoading}
              onClick={() => ejecutarImpresion(printTarget, printFormat, printDetalle)}
            >
              {printFormat === 'excel' ? 'Exportar Excel' : printFormat === 'pdf' ? 'Abrir PDF' : 'Imprimir ticket'}
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Formato</div>
          <Radio.Group
            value={printFormat}
            onChange={e => {
              setPrintFormat(e.target.value);
              // Ticket no tiene detalle
              if (e.target.value === 'ticket') setPrintDetalle(false);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <Radio value="ticket">
              <Space>
                <PrinterOutlined />
                Ticket térmico
                <span style={{ fontSize: 12, color: '#94a3b8' }}>(solo resumen)</span>
              </Space>
            </Radio>
            <Radio value="pdf">
              <Space>
                <FilePdfOutlined />
                PDF
              </Space>
            </Radio>
            <Radio value="excel">
              <Space>
                <FileExcelOutlined />
                Excel
              </Space>
            </Radio>
          </Radio.Group>
        </div>

        <div>
          <Checkbox
            checked={printDetalle}
            disabled={printFormat === 'ticket'}
            onChange={e => setPrintDetalle(e.target.checked)}
          >
            Incluir detalle de facturas emitidas
          </Checkbox>
          {printFormat === 'ticket' && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, paddingLeft: 24 }}>
              El ticket térmico siempre muestra solo el resumen.
            </div>
          )}
          {printDetalle && printFormat !== 'ticket' && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, paddingLeft: 24 }}>
              Se incluirá cada factura del turno con número, e-NCF, hora, cliente, forma de pago, subtotal, ITBIS y total.
              Las facturas anuladas quedan marcadas.
            </div>
          )}
        </div>
      </Modal>


      {/* Modal anular retiro */}
      <Modal
        title={<Space><StopOutlined style={{ color: '#ef4444' }} />
          {`Anular retiro ${retiroAnular?.numero ?? `RET-${String(retiroAnular?.id ?? 0).padStart(5,'0')}`}`}
        </Space>}
        open={!!retiroAnular}
        onCancel={() => { setRetiroAnular(null); formAnularRet.resetFields(); }}
        footer={null} width="min(460px, 95vw)" destroyOnClose
      >
        {retiroAnular && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cajero" span={2}>{retiroAnular.cajeroNombre ?? retiroAnular.usuarioNombre}</Descriptions.Item>
              <Descriptions.Item label="Monto"><strong style={{ color: '#ef4444' }}>{fmt.money(retiroAnular.monto)}</strong></Descriptions.Item>
              <Descriptions.Item label="Fecha">{String(retiroAnular.cajaFecha ?? '').substring(0,10)}</Descriptions.Item>
              <Descriptions.Item label="Descripción" span={2}>{retiroAnular.descripcion}</Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon
              message="El monto regresa a la caja"
              description="Esta acción revierte el retiro, devuelve el monto y recalcula el cierre. Solo disponible mientras la caja esté abierta."
              style={{ marginBottom: 16 }} />
            <Form form={formAnularRet} layout="vertical"
              onFinish={v => anularRetiroMut.mutate({ id: retiroAnular.id, motivo: v.motivo })}>
              <Form.Item name="motivo" label="Motivo de la anulación"
                rules={[{ required: true, message: 'El motivo es obligatorio' }]}>
                <Input.TextArea rows={3} maxLength={500} placeholder="Ej: El retiro fue registrado por error, el dinero fue devuelto a caja..." showCount />
              </Form.Item>
              <Row justify="end" gutter={8}>
                <Col><Button onClick={() => { setRetiroAnular(null); formAnularRet.resetFields(); }}>Cancelar</Button></Col>
                <Col>
                  <Button danger htmlType="submit" icon={<StopOutlined />} loading={anularRetiroMut.isPending}>
                    Confirmar anulación
                  </Button>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Modal>

      {/* Modal rechazar retiro */}
      <Modal
        title={<Space><CloseCircleOutlined style={{ color: '#d97706' }} />
          {`Rechazar retiro ${retiroRechazar?.numero ?? `RET-${String(retiroRechazar?.id ?? 0).padStart(5,'0')}`}`}
        </Space>}
        open={!!retiroRechazar}
        onCancel={() => { setRetiroRechazar(null); formRechazarRet.resetFields(); }}
        footer={null} width="min(460px, 95vw)" destroyOnClose
      >
        {retiroRechazar && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cajero" span={2}>{retiroRechazar.cajeroNombre ?? retiroRechazar.usuarioNombre}</Descriptions.Item>
              <Descriptions.Item label="Monto"><strong style={{ color: '#ef4444' }}>{fmt.money(retiroRechazar.monto)}</strong></Descriptions.Item>
              <Descriptions.Item label="Fecha">{String(retiroRechazar.cajaFecha ?? '').substring(0,10)}</Descriptions.Item>
              <Descriptions.Item label="Descripción" span={2}>{retiroRechazar.descripcion}</Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon
              message="El monto NO regresa a la caja"
              description="Rechazar documenta que el supervisor no avaló este retiro, pero el dinero ya salió físicamente. La diferencia queda en el cuadre del cierre para resolución fuera del sistema. Funciona aunque la caja ya esté cerrada."
              style={{ marginBottom: 16 }} />
            <Form form={formRechazarRet} layout="vertical"
              onFinish={v => rechazarRetiroMut.mutate({ id: retiroRechazar.id, motivo: v.motivo })}>
              <Form.Item name="motivo" label="Motivo del rechazo"
                rules={[{ required: true, message: 'El motivo es obligatorio' }]}>
                <Input.TextArea rows={3} maxLength={500}
                  placeholder="Ej: El monto no fue autorizado por gerencia, el cajero debe reintegrarlo..." showCount />
              </Form.Item>
              <Row justify="end" gutter={8}>
                <Col><Button onClick={() => { setRetiroRechazar(null); formRechazarRet.resetFields(); }}>Cancelar</Button></Col>
                <Col>
                  <Button htmlType="submit" icon={<CloseCircleOutlined />}
                    loading={rechazarRetiroMut.isPending}
                    style={{ background: '#d97706', borderColor: '#d97706', color: '#fff' }}>
                    Rechazar retiro
                  </Button>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Modal>

      {/* Modal pre-cierre: advertencia de retiros pendientes */}
      <Modal
        title={<Space><WarningOutlined style={{ color: '#f59e0b' }} />Retiros pendientes de autorización</Space>}
        open={preCierreData !== null}
        onCancel={() => setPreCierreData(null)}
        width="min(500px, 95vw)"
        footer={[
          <Button key="cancel" onClick={() => setPreCierreData(null)}>Volver</Button>,
          <Button key="close" type="primary" danger icon={<LockOutlined />}
            onClick={() => {
              if (!preCierreData) return;
              const { caja } = preCierreData;
              const nombre        = caja.vendedorNombre ?? 'Administrador';
              const totalIngresos = Number(caja.ventasEfectivo ?? 0) + Number(caja.ventasTarjeta ?? 0) + Number(caja.ventasTransferencia ?? 0);
              const saldoEsperado = Number(caja.saldoApertura ?? 0) + totalIngresos
                - Number(caja.gastosEfectivo ?? 0) - Number(caja.retiros ?? 0);
              setCerrarTarget({
                id: caja.id, nombre, saldoEsperado,
                saldoApertura:         Number(caja.saldoApertura ?? 0),
                ventasEfectivo:        Number(caja.ventasEfectivo ?? 0),
                ventasTarjeta:         Number(caja.ventasTarjeta ?? 0),
                ventasTransferencia:   Number(caja.ventasTransferencia ?? 0),
                cobrosRecibidos:       Number(caja.cobrosRecibidos ?? 0),
                totalAnticipos:        Number(caja.totalAnticipos  ?? 0),
                gastosEfectivo:        Number(caja.gastosEfectivo  ?? 0),
                retiros:               Number(caja.retiros ?? 0),
                cantidadTransacciones: caja.cantidadTransacciones ?? 0,
                fecha:                 caja.fecha ?? '',
              });
              form.resetFields(); setSaldoFisicoInput(0);
              setPreCierreData(null);
            }}>
            Cerrar de todas formas
          </Button>,
        ]}
      >
        <Alert type="warning" showIcon
          message={`Hay ${preCierreData?.pendientes.length ?? 0} retiro(s) pendiente(s) de autorización por ${fmt.money(preCierreData?.pendientes.reduce((s: number, r: any) => s + Number(r.monto), 0) ?? 0)}`}
          description="Al cerrar la caja, estos retiros ya no podrán anularse (el dinero no podrá regresar automáticamente). Solo quedará disponible la acción de rechazar, que deja constancia sin revertir el monto."
          style={{ marginBottom: 16 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {preCierreData?.pendientes.map((r: any) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#92400e', flexShrink: 0 }}>
                {r.numero ?? `RET-${String(r.id).padStart(5,'0')}`}
              </span>
              <span style={{ fontSize: 12, color: '#78350f', flex: 1 }}>{r.descripcion}</span>
              <span style={{ fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>{fmt.money(r.monto)}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal anular cierre */}
      <Modal
        title={<Space><RollbackOutlined style={{ color: '#d97706' }} />{`Anular cierre — ${anularTarget?.nombre}`}</Space>}
        open={!!anularTarget}
        onCancel={() => { setAnularTarget(null); formAnular.resetFields(); }}
        footer={null} width="min(460px, 95vw)" destroyOnClose
      >
        <Alert type="warning" showIcon icon={<WarningOutlined />}
          message="¿Estás seguro de anular este cierre?"
          description={
            <span>
              La caja del <strong>{anularTarget?.fecha ? new Date(anularTarget.fecha + 'T00:00:00').toLocaleDateString('es-DO') : ''}</strong> de{' '}
              <strong>{anularTarget?.nombre}</strong> volverá a estado <strong>ABIERTA</strong>.
            </span>
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={formAnular} layout="vertical"
          onFinish={v => anularTarget && anularMut.mutate({ id: anularTarget.id, motivo: v.motivo })}>
          <Form.Item name="motivo" label="Motivo de la anulación"
            rules={[{ required: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} maxLength={300} placeholder="Ej: El cajero olvidó registrar ventas del turno de la tarde..." showCount />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setAnularTarget(null); formAnular.resetFields(); }}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" icon={<RollbackOutlined />}
                loading={anularMut.isPending} style={{ background: '#d97706', borderColor: '#d97706' }}>
                Confirmar anulación
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
