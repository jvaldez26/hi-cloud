import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Button, Input, InputNumber, Progress, Tag, Alert, Spin, Space,
  Typography, Modal, Form, Select, Row, Col, Card, Table, Tooltip,
  message, theme, Divider,
} from 'antd';
import type { InputRef } from 'antd';
import {
  ArrowLeftOutlined, SearchOutlined, CheckCircleFilled, WarningFilled,
  CloseCircleFilled, LoadingOutlined, SyncOutlined, PlusOutlined,
  PlayCircleOutlined, AuditOutlined, CheckOutlined, StopOutlined,
  DisconnectOutlined, BarcodeOutlined, FilePdfOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { exportarHojaConteo } from '../../utils/exportExcel';
import { fecha } from '../../utils/fechaRD';

const { Text, Title } = Typography;
const { Option } = Select;

// ── Types ─────────────────────────────────────────────────────────────────────

type ConteoEstado =
  | 'borrador' | 'en_conteo' | 'en_digitacion' | 'en_revision'
  | 'ajustado' | 'cerrado' | 'anulado';
type LineaEstado = 'pendiente' | 'contada' | 'en_recuento' | 'conciliada';
type UiStatus = 'idle' | 'saving' | 'saved' | 'recuento' | 'error' | 'offline';

interface Conteo {
  id: number; codigo: string; nombre: string; tipo: string;
  modalidad: 'ciego' | 'informado'; estado: ConteoEstado;
  almacenId: number; umbralTipo: string; umbralValor: string;
  totalLineas: number; lineasContadas: number; totalDiferencias: number;
  valorDiferencia: string; fechaGeneracion: string; fechaCorteConteo: string;
  fechaInicio: string | null; fechaCierre: string | null;
  createdAt?: string; lineas?: Linea[];
}
interface Linea {
  id: number; orden: number; productoId: number;
  productoCodigo: string | null; productoNombre: string | null;
  unidadMedida: string | null; cantidadSistema: string;
  cantidadContada: string | null; cantidadRecuento: string | null;
  diferencia: string; estadoLinea: LineaEstado;
  contadaPorId: number | null; contadaEn: string | null;
  tieneLotes: boolean; tieneSeriales: boolean;
}
interface Almacen { id: number; nombre: string; }
interface QueueItem { lineaId: number; cantidad: number; }

// ── Constants ─────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<ConteoEstado, { color: string; label: string }> = {
  borrador:      { color: 'default',    label: 'Borrador'    },
  en_conteo:     { color: 'blue',       label: 'En Conteo'   },
  en_digitacion: { color: 'processing', label: 'Digitando'   },
  en_revision:   { color: 'warning',    label: 'En Revisión' },
  ajustado:      { color: 'success',    label: 'Ajustado'    },
  cerrado:       { color: 'green',      label: 'Cerrado'     },
  anulado:       { color: 'error',      label: 'Anulado'     },
};

const TIPOS_CONTEO = [
  { value: 'total',     label: 'Total (todos los productos)' },
  { value: 'categoria', label: 'Por Categoría'               },
  { value: 'marca',     label: 'Por Marca'                   },
  { value: 'ubicacion', label: 'Por Ubicación'               },
  { value: 'selectivo', label: 'Selectivo (lista manual)'    },
];

const fmtN = (v: number | string | null | undefined) =>
  v == null ? '—' :
  new Intl.NumberFormat('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(v));

const errMsg = (e: unknown) =>
  (e as any)?.response?.data?.message ?? (e as any)?.message ?? 'Error inesperado';

// ── StatusIcon ────────────────────────────────────────────────────────────────

function StatusIcon({ s, le }: { s: UiStatus; le: LineaEstado }) {
  if (s === 'saving')  return <LoadingOutlined style={{ color: '#1890ff' }} />;
  if (s === 'offline') return <Tooltip title="Sin sincronizar"><SyncOutlined spin style={{ color: '#fa8c16' }} /></Tooltip>;
  if (s === 'error')   return <Tooltip title="Error — reintentando"><CloseCircleFilled style={{ color: '#ff4d4f' }} /></Tooltip>;
  if (s === 'recuento' || le === 'en_recuento')
    return <Tooltip title="Requiere segundo recuento"><WarningFilled style={{ color: '#faad14' }} /></Tooltip>;
  if (s === 'saved' || le === 'contada' || le === 'conciliada')
    return <CheckCircleFilled style={{ color: '#52c41a' }} />;
  return <span style={{ color: '#bfbfbf', fontSize: 18 }}>·</span>;
}

// ── ConteoDigitacion ──────────────────────────────────────────────────────────
// Pantalla de captura física. Reglas fundamentales:
//   · Modalidad ciega: cantidadSistema y diferencia NUNCA visibles durante digitación.
//     Solo aparecen en la vista de revisión.
//   · El orden en pantalla es el campo `orden` — mismo que la hoja impresa.
//   · Enter guarda y avanza a la siguiente línea. Todo operable sin mouse.
//   · Guardado incremental con cola offline; reintenta automáticamente.

function ConteoDigitacion({ conteoId, onBack }: { conteoId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const [cantidades, setCantidades]     = useState<Record<number, string>>({});
  const [lineaStatus, setLineaStatus]   = useState<Record<number, UiStatus>>({});
  const [activeLineaId, setActiveLineaId] = useState<number | null>(null);
  const [searchCodigo, setSearchCodigo] = useState('');
  const [queueSize, setQueueSize]       = useState(0);
  const [isOnline, setIsOnline]         = useState(navigator.onLine);

  const inputRefs   = useRef<Map<number, { focus(): void }>>(new Map());
  const pendingQ    = useRef<QueueItem[]>([]);
  const isFlushing  = useRef(false);
  const retryHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef   = useRef<InputRef>(null);
  const queuedIds   = useRef<Set<number>>(new Set());

  // Refs sincronizados para usar en el efecto del escáner (evita stale closures)
  const activeLineaIdRef = useRef<number | null>(null);
  const cantidadesRef    = useRef<Record<number, string>>({});

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: conteo, isLoading } = useQuery<Conteo>({
    queryKey: ['conteo', conteoId],
    queryFn:  () => api.get(`/conteo-inventario/${conteoId}`).then((r: any) => r.data?.data ?? r.data),
    refetchInterval: 30_000,
  });

  const lineasOrdenadas: Linea[] = useMemo(() => {
    const all = (conteo?.lineas ?? []).slice().sort((a, b) => a.orden - b.orden);
    if (!searchCodigo.trim()) return all;
    const q = searchCodigo.trim().toLowerCase();
    return all.filter(l =>
      l.productoCodigo?.toLowerCase().includes(q) ||
      l.productoNombre?.toLowerCase().includes(q),
    );
  }, [conteo?.lineas, searchCodigo]);

  const lineasCapturadas = conteo?.lineasContadas ?? 0;
  const totalLineas      = conteo?.totalLineas ?? 0;
  const pctAvance = totalLineas > 0 ? Math.round((lineasCapturadas / totalLineas) * 100) : 0;

  const esEditable = conteo?.estado === 'en_conteo' || conteo?.estado === 'en_digitacion';
  const esRevision = conteo?.estado === 'en_revision';

  // Mantener refs sincronizados con el estado
  useEffect(() => { activeLineaIdRef.current = activeLineaId; }, [activeLineaId]);
  useEffect(() => { cantidadesRef.current = cantidades; }, [cantidades]);

  // ── localStorage helpers ────────────────────────────────────────────────────

  const queueKey = `conteo-queue-${conteoId}`;

  const persistQueue = () => {
    try {
      if (pendingQ.current.length > 0) {
        localStorage.setItem(queueKey, JSON.stringify(pendingQ.current));
      } else {
        localStorage.removeItem(queueKey);
      }
    } catch { /* localStorage may be unavailable (private mode) */ }
  };

  // ── Save queue ──────────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (isFlushing.current || pendingQ.current.length === 0) return;
    if (retryHandle.current) { clearTimeout(retryHandle.current); retryHandle.current = null; }

    isFlushing.current = true;
    const batch = pendingQ.current.splice(0);
    setQueueSize(0);

    try {
      const res = await api.post<any>(`/conteo-inventario/${conteoId}/lote`, {
        lineas: batch.map(b => ({ lineaId: b.lineaId, cantidadContada: b.cantidad })),
      });
      const resultados: any[] = Array.isArray(res.data?.data)
        ? res.data.data : Array.isArray(res.data) ? res.data : [];

      const failed: QueueItem[] = [];
      const nextStatus: Record<number, UiStatus> = {};

      resultados.forEach(r => {
        if (r.ok) {
          nextStatus[r.lineaId] = r.resultado?.requiereRecuento ? 'recuento' : 'saved';
        } else {
          nextStatus[r.lineaId] = 'error';
          const orig = batch.find(b => b.lineaId === r.lineaId);
          if (orig) failed.push(orig);
        }
      });

      setLineaStatus(prev => ({ ...prev, ...nextStatus }));

      if (failed.length > 0) {
        pendingQ.current.push(...failed);
        setQueueSize(pendingQ.current.length);
      }

      persistQueue();
      qc.invalidateQueries({ queryKey: ['conteo', conteoId] });

    } catch {
      // Red caída — devolver al queue como offline
      pendingQ.current.push(...batch);
      setQueueSize(pendingQ.current.length);
      persistQueue();
      setLineaStatus(prev => {
        const next = { ...prev };
        batch.forEach(b => { next[b.lineaId] = 'offline'; });
        return next;
      });
    } finally {
      isFlushing.current = false;
      if (pendingQ.current.length > 0) {
        retryHandle.current = setTimeout(flush, 4000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteoId, qc]);

  // Restaurar cola de localStorage al montar (refresco de página / app móvil)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(queueKey);
      if (!saved) return;
      const items: QueueItem[] = JSON.parse(saved);
      if (!items.length) return;
      pendingQ.current.push(...items);
      setQueueSize(items.length);
      items.forEach(i => {
        setCantidades(prev => ({ ...prev, [i.lineaId]: String(i.cantidad) }));
        setLineaStatus(prev => ({ ...prev, [i.lineaId]: 'offline' }));
      });
      setTimeout(flush, 1000); // intentar sincronizar en cuanto cargue
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteoId]);

  // Avisar antes de salir si hay capturas sin sincronizar
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingQ.current.length === 0) return;
      e.preventDefault();
      return (e.returnValue = `${pendingQ.current.length} captura(s) sin sincronizar. ¿Salir de todas formas?`);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const up   = () => { setIsOnline(true);  setTimeout(flush, 500); };
    const down = () => setIsOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [flush]);

  useEffect(() => () => {
    if (retryHandle.current) clearTimeout(retryHandle.current);
  }, []);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const focusLine = useCallback((lineaId: number) => {
    setActiveLineaId(lineaId);
    requestAnimationFrame(() => {
      inputRefs.current.get(lineaId)?.focus();
      document.getElementById(`row-${lineaId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, []);

  // Avanza al siguiente en orden (no solo pendientes — el usuario decide qué re-contar)
  const focusNext = useCallback((currentLineaId: number) => {
    const sorted = (conteo?.lineas ?? []).slice().sort((a, b) => a.orden - b.orden);
    const idx = sorted.findIndex(l => l.id === currentLineaId);
    if (idx === -1 || idx === sorted.length - 1) {
      searchRef.current?.focus();
      return;
    }
    focusLine(sorted[idx + 1].id);
  }, [conteo?.lineas, focusLine]);

  // Focus primera línea pendiente al cargar
  useEffect(() => {
    if (!conteo || !esEditable) return;
    const sorted = (conteo.lineas ?? []).slice().sort((a, b) => a.orden - b.orden);
    const first  = sorted.find(l => l.estadoLinea === 'pendiente' || l.estadoLinea === 'en_recuento');
    if (first) setTimeout(() => focusLine(first.id), 120);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteo?.id]);

  // ── Enter / save ─────────────────────────────────────────────────────────────

  const handleEnter = useCallback((lineaId: number) => {
    const raw = cantidades[lineaId];
    if (raw === undefined || raw === '') return;
    const cantidad = parseFloat(raw);
    if (isNaN(cantidad) || cantidad < 0) return;

    setLineaStatus(prev => ({ ...prev, [lineaId]: 'saving' }));

    // Deduplicar en queue
    pendingQ.current = pendingQ.current.filter(q => q.lineaId !== lineaId);
    pendingQ.current.push({ lineaId, cantidad });
    queuedIds.current.add(lineaId);
    setQueueSize(pendingQ.current.length);
    persistQueue();

    focusNext(lineaId);
    flush();
  }, [cantidades, focusNext, flush]);

  // ── Scanner HID — interceptación por velocidad de tecleo ───────────────────
  // Un escáner HID envía los chars del código de barras en ráfagas < 30-50ms.
  // Estrategia: usar capture=true para interceptar antes que el input, y detectar
  // la ráfaga por timing. A partir del 2º char consecutivo rápido: preventDefault.
  // El 1º char puede haber llegado al input; se restaura al completar el escaneo.

  useEffect(() => {
    if (!conteo) return;

    let lastTime    = 0;
    let count       = 0;
    let buf         = '';
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    let preScanVal: string | null = null; // valor del input activo justo antes del 1º char

    const finish = (code: string) => {
      count = 0;
      buf   = '';
      if (!code.trim()) return;

      // Restaurar valor del input activo (deshacer el char que pudo haber entrado)
      const activeId = activeLineaIdRef.current;
      if (activeId !== null && preScanVal !== null) {
        setCantidades(prev => ({ ...prev, [activeId]: preScanVal! }));
      }
      preScanVal = null;

      const sorted = (conteo.lineas ?? []).slice().sort((a, b) => a.orden - b.orden);
      const found  = sorted.find(l => l.productoCodigo?.toLowerCase() === code.toLowerCase());
      if (found) {
        focusLine(found.id);
      } else {
        message.info(`Código "${code}" no encontrado en este conteo`, 2);
      }
    };

    const handler = (e: KeyboardEvent) => {
      const now   = performance.now();
      const delta = now - lastTime;
      lastTime    = now;

      // Enter cierra el escaneo si estamos en modo escáner
      if (e.key === 'Enter') {
        if (count >= 2) {
          if (scanTimer) clearTimeout(scanTimer);
          e.preventDefault();
          e.stopImmediatePropagation();
          const code = buf;
          buf = ''; count = 0;
          finish(code);
        }
        return;
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      if (count === 0) {
        // Primer char de nueva secuencia — guardar el estado previo del input activo
        preScanVal = cantidadesRef.current[activeLineaIdRef.current ?? -1] ?? null;
      }

      const isFastChar = delta < 50 && count > 0;

      buf += e.key;
      count++;

      if (isFastChar) {
        // Confirmado como escáner — prevenir que el char llegue al input
        e.preventDefault();
        e.stopImmediatePropagation();
      }

      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        scanTimer = null;
        if (count >= 2) finish(buf);
        else { buf = ''; count = 0; preScanVal = null; } // solo tecleo lento — ignorar
      }, 200);
    };

    // capture:true → se ejecuta antes del listener del input
    document.addEventListener('keydown', handler, true);
    return () => {
      document.removeEventListener('keydown', handler, true);
      if (scanTimer) clearTimeout(scanTimer);
    };
  }, [conteo, focusLine, setCantidades]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const iniciarMut = useMutation({
    mutationFn: () => api.patch(`/conteo-inventario/${conteoId}/iniciar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteo', conteoId] }); message.success('Conteo iniciado'); },
    onError: (e) => message.error(errMsg(e), 5),
  });

  const revisionMut = useMutation({
    mutationFn: () => api.patch(`/conteo-inventario/${conteoId}/revision`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conteo', conteoId] });
      qc.invalidateQueries({ queryKey: ['conteos'] });
      message.success('Conteo enviado a revisión');
    },
    onError: (e) => message.error(errMsg(e), 6),
  });

  const ajustarMut = useMutation({
    mutationFn: () => api.patch(`/conteo-inventario/${conteoId}/ajustar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conteo', conteoId] });
      qc.invalidateQueries({ queryKey: ['conteos'] });
      message.success('Ajustes aplicados al inventario');
    },
    onError: (e) => message.error(errMsg(e), 6),
  });

  const cerrarMut = useMutation({
    mutationFn: () => api.patch(`/conteo-inventario/${conteoId}/cerrar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteos'] }); message.success('Conteo cerrado'); onBack(); },
    onError: (e) => message.error(errMsg(e), 5),
  });

  const anularMut = useMutation({
    mutationFn: () => api.patch(`/conteo-inventario/${conteoId}/anular`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteos'] }); message.success('Conteo anulado'); onBack(); },
    onError: (e) => message.error(errMsg(e), 5),
  });

  // ── Descarga de archivos (usa el api client para incluir auth headers) ──────

  const downloadPdf = async (path: string, filename: string) => {
    try {
      const res = await api.get(path, { responseType: 'blob' } as any);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = href; a.download = filename; a.click();
      URL.revokeObjectURL(href);
    } catch (e) { message.error(errMsg(e)); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
      <Spin size="large" />
    </div>
  );
  if (!conteo) return null;

  const cfg = ESTADO_CONFIG[conteo.estado] ?? { color: 'default', label: conteo.estado };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: token.colorBgLayout }}>

      {/* HEADER */}
      <div style={{
        padding: '10px 20px', background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>Conteos</Button>
        <Divider type="vertical" style={{ height: 28 }} />
        <Tooltip title="Descargar hoja de conteo en PDF">
          <Button
            icon={<FilePdfOutlined />}
            onClick={() => conteo && downloadPdf(`/conteo-inventario/${conteoId}/hoja.pdf`, `${conteo.codigo}.pdf`)}
          >
            Hoja PDF
          </Button>
        </Tooltip>
        {(esRevision || conteo?.estado === 'ajustado') && (
          <Tooltip title="Descargar solo las líneas que requieren segundo recuento">
            <Button
              icon={<FilePdfOutlined />}
              onClick={() => conteo && downloadPdf(`/conteo-inventario/${conteoId}/recuento.pdf`, `${conteo.codigo}-recuento.pdf`)}
            >
              Recuento PDF
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Exportar hoja de conteo a Excel">
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => conteo && exportarHojaConteo(conteo)}
          >
            Excel
          </Button>
        </Tooltip>
        <Divider type="vertical" style={{ height: 28 }} />

        <Space size={8} wrap style={{ flex: 1 }}>
          <Text strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{conteo.codigo}</Text>
          <Text style={{ fontSize: 14 }}>{conteo.nombre}</Text>
          <Tag color={cfg.color}>{cfg.label}</Tag>
          {!isOnline && <Tag icon={<DisconnectOutlined />} color="orange">Sin conexión</Tag>}
          {queueSize > 0 && (
            <Tooltip title={`${queueSize} captura(s) pendientes de enviar al servidor`}>
              <Tag icon={<SyncOutlined spin />} color="blue">{queueSize} en cola</Tag>
            </Tooltip>
          )}
        </Space>

        <Space wrap>
          {conteo.estado === 'borrador' && (
            <Button type="primary" icon={<PlayCircleOutlined />}
              loading={iniciarMut.isPending} onClick={() => iniciarMut.mutate()}>
              Iniciar Conteo
            </Button>
          )}
          {esEditable && (
            <Button onClick={() => Modal.confirm({
              title: '¿Pasar a revisión?',
              content: 'Las líneas pendientes sin capturar bloquearán la transición. Digítalas como 0 si el producto no se encontró.',
              okText: 'Enviar a revisión',
              onOk: () => revisionMut.mutate(),
            })} loading={revisionMut.isPending}>
              Enviar a Revisión
            </Button>
          )}
          {esRevision && (
            <Button type="primary" icon={<CheckOutlined />}
              onClick={() => Modal.confirm({
                title: '¿Aplicar ajustes al inventario?',
                content: 'El stock se actualizará por delta. Esta acción es irreversible una vez aplicada.',
                okText: 'Aplicar ajustes',
                okButtonProps: { danger: true },
                onOk: () => ajustarMut.mutate(),
              })} loading={ajustarMut.isPending}>
              Aplicar Ajustes
            </Button>
          )}
          {conteo.estado === 'ajustado' && (
            <Button icon={<CheckOutlined />}
              onClick={() => Modal.confirm({
                title: '¿Cerrar el conteo?',
                okText: 'Cerrar',
                onOk: () => cerrarMut.mutate(),
              })} loading={cerrarMut.isPending}>
              Cerrar
            </Button>
          )}
          {!['ajustado', 'cerrado', 'anulado'].includes(conteo.estado) && (
            <Button danger
              onClick={() => Modal.confirm({
                title: '¿Anular este conteo?',
                content: 'El almacén quedará libre para un nuevo conteo.',
                okText: 'Anular', okButtonProps: { danger: true },
                onOk: () => anularMut.mutate(),
              })} loading={anularMut.isPending} icon={<StopOutlined />}>
              Anular
            </Button>
          )}
        </Space>
      </div>

      {/* BARRA DE PROGRESO */}
      <div style={{
        padding: '8px 20px', background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Progress
            style={{ flex: 1 }}
            percent={pctAvance}
            format={() => (
              <span style={{ fontSize: 12 }}>
                <b>{lineasCapturadas}</b> / {totalLineas}
              </span>
            )}
            strokeColor={pctAvance === 100 ? token.colorSuccess : token.colorPrimary}
            size={[undefined as any, 8]}
          />
          {conteo.totalDiferencias > 0 && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              {conteo.totalDiferencias} diferencia(s)
            </Tag>
          )}
        </div>
      </div>

      {/* BUSCADOR */}
      <div style={{
        padding: '8px 20px', background: token.colorBgElevated,
        borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0,
      }}>
        <Space>
          <Input
            ref={searchRef}
            prefix={<SearchOutlined />}
            placeholder="Buscar por código o nombre de producto..."
            value={searchCodigo}
            onChange={e => setSearchCodigo(e.target.value)}
            allowClear
            style={{ width: 340 }}
          />
          {searchCodigo && <Text type="secondary" style={{ fontSize: 12 }}>{lineasOrdenadas.length} resultado(s)</Text>}
          <Tooltip title="El escáner HID puede buscar directamente por código de producto cuando ningún campo está enfocado">
            <BarcodeOutlined style={{ color: token.colorTextQuaternary, fontSize: 16 }} />
          </Tooltip>
        </Space>
      </div>

      {/* TABLA DE LÍNEAS */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 52  }} />  {/* # */}
            <col style={{ width: 108 }} />  {/* Código */}
            <col />                          {/* Nombre */}
            <col style={{ width: 60  }} />  {/* Und */}
            {esRevision && <col style={{ width: 110 }} />}  {/* Sistema (solo revisión) */}
            <col style={{ width: 130 }} />  {/* Físico / input */}
            {esRevision && <col style={{ width: 96 }} />}   {/* Diferencia (solo revisión) */}
            <col style={{ width: 40  }} />  {/* Status */}
          </colgroup>
          <thead>
            <tr style={{
              background: token.colorBgContainer,
              position: 'sticky', top: 0, zIndex: 10,
              borderBottom: `2px solid ${token.colorBorderSecondary}`,
            }}>
              {[
                '#', 'Código', 'Producto', 'Und',
                ...(esRevision ? ['Sistema'] : []),
                esRevision ? 'Físico' : 'Cantidad',
                ...(esRevision ? ['Diferencia'] : []),
                '',
              ].map((h, i) => (
                <th key={i} style={{
                  padding: '7px 10px', textAlign: i >= 3 ? 'right' : 'left',
                  fontWeight: 600, fontSize: 11,
                  color: token.colorTextSecondary, letterSpacing: '0.05em',
                  userSelect: 'none',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineasOrdenadas.map(l => {
              const uiSt     = lineaStatus[l.id] ?? 'idle';
              const isActive = activeLineaId === l.id;
              const isPend   = l.estadoLinea === 'pendiente';
              const isRec    = l.estadoLinea === 'en_recuento';
              const editable = esEditable && (isPend || isRec);

              let bg: string | undefined;
              if (isActive)                bg = token.colorPrimaryBg;
              else if (isRec)              bg = token.colorWarningBg;
              else if (uiSt === 'error' || uiSt === 'offline') bg = token.colorErrorBg;

              // Valor a mostrar en el input: local state o dato del servidor
              const localVal   = cantidades[l.id];
              const serverVal  = l.cantidadContada != null ? String(Number(l.cantidadContada)) : undefined;
              const inputValue = localVal !== undefined ? Number(localVal) : serverVal !== undefined ? Number(serverVal) : undefined;

              const difVal = Number(l.diferencia);

              return (
                <tr
                  key={l.id}
                  id={`row-${l.id}`}
                  style={{
                    background: bg,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    cursor: editable ? 'text' : 'default',
                  }}
                  onClick={() => editable && focusLine(l.id)}
                >
                  {/* Orden */}
                  <td style={{ padding: '5px 10px', textAlign: 'center', fontSize: 11, color: token.colorTextQuaternary, fontVariantNumeric: 'tabular-nums' }}>
                    {l.orden}
                  </td>

                  {/* Código */}
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 12 }}>
                    {l.productoCodigo ?? '—'}
                  </td>

                  {/* Nombre */}
                  <td style={{ padding: '5px 10px', maxWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {l.productoNombre ?? '(sin nombre)'}
                      {l.tieneLotes    && <Tag style={{ marginLeft: 4, fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>Lotes</Tag>}
                      {l.tieneSeriales && <Tag style={{ marginLeft: 4, fontSize: 10, padding: '0 3px', lineHeight: '16px' }}>Ser.</Tag>}
                    </div>
                  </td>

                  {/* Unidad */}
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, color: token.colorTextSecondary }}>
                    {l.unidadMedida ?? ''}
                  </td>

                  {/* Sistema (solo revisión) */}
                  {esRevision && (
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 12, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtN(l.cantidadSistema)}
                    </td>
                  )}

                  {/* Cantidad / Input */}
                  <td style={{ padding: '3px 8px', textAlign: 'right' }}>
                    {editable ? (
                      <InputNumber
                        ref={(el: any) => {
                          if (el) inputRefs.current.set(l.id, el);
                          else inputRefs.current.delete(l.id);
                        }}
                        value={inputValue}
                        min={0}
                        precision={4}
                        step={1}
                        size="small"
                        style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
                        controls={false}
                        onChange={v =>
                          setCantidades(prev => ({ ...prev, [l.id]: v != null ? String(v) : '' }))
                        }
                        onPressEnter={() => handleEnter(l.id)}
                        onFocus={() => setActiveLineaId(l.id)}
                        onBlur={() => {
                          // Auto-save on blur (tablet / tap navigation)
                          // Solo si no está ya en queue (evita doble submit con Enter)
                          const alreadyQueued = pendingQ.current.some(q => q.lineaId === l.id);
                          if (!alreadyQueued) handleEnter(l.id);
                        }}
                        keyboard
                      />
                    ) : (
                      <Text style={{
                        fontVariantNumeric: 'tabular-nums', fontSize: 13,
                        color: l.cantidadContada != null ? token.colorText : token.colorTextQuaternary,
                      }}>
                        {l.cantidadContada != null ? fmtN(l.cantidadContada) : '—'}
                      </Text>
                    )}
                  </td>

                  {/* Diferencia (solo revisión) */}
                  {esRevision && (
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12,
                      fontWeight: difVal !== 0 ? 600 : 400,
                      color: difVal > 0 ? token.colorSuccess : difVal < 0 ? token.colorError : token.colorTextQuaternary,
                    }}>
                      {difVal !== 0 ? `${difVal > 0 ? '+' : ''}${fmtN(l.diferencia)}` : '0'}
                    </td>
                  )}

                  {/* Status icon */}
                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                    <StatusIcon s={uiSt} le={l.estadoLinea} />
                  </td>
                </tr>
              );
            })}

            {lineasOrdenadas.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: token.colorTextQuaternary }}>
                  {searchCodigo ? 'No se encontraron productos con ese código o nombre' : 'No hay líneas en este conteo'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER: atajos */}
      {esEditable && (
        <div style={{
          padding: '5px 20px',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgElevated,
          display: 'flex', gap: 20, fontSize: 11,
          color: token.colorTextTertiary, flexShrink: 0, alignItems: 'center',
        }}>
          <span>
            <kbd style={{ padding: '1px 5px', borderRadius: 3, border: `1px solid ${token.colorBorder}`, background: token.colorBgContainer, fontFamily: 'monospace' }}>
              Enter
            </kbd>{' '}
            Guardar y avanzar
          </span>
          <span>
            <kbd style={{ padding: '1px 5px', borderRadius: 3, border: `1px solid ${token.colorBorder}`, background: token.colorBgContainer, fontFamily: 'monospace' }}>
              Tab
            </kbd>{' '}
            Saltar campo
          </span>
          <span style={{ marginLeft: 'auto', color: isOnline ? token.colorTextQuaternary : token.colorWarning }}>
            {isOnline ? (queueSize === 0 ? '✓ Todo sincronizado' : `${queueSize} en cola`) : '⚠ Sin conexión'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── ConteoInventarioPage ──────────────────────────────────────────────────────

export default function ConteoInventarioPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const [vista,      setVista]      = useState<'lista' | 'digitacion'>('lista');
  const [conteoId,   setConteoId]   = useState<number | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [tipoSel,    setTipoSel]    = useState('total');
  const [formCrear]  = Form.useForm();

  const { data: resumen = [] } = useQuery<{ estado: string; cantidad: number }[]>({
    queryKey: ['conteo-resumen'],
    queryFn:  () => api.get('/conteo-inventario/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: rawConteos, refetch: refetchLista } = useQuery({
    queryKey: ['conteos'],
    queryFn:  () => api.get('/conteo-inventario?limit=100').then((r: any) => r.data?.data ?? r.data),
  });

  const conteos: Conteo[] = useMemo(() => {
    if (!rawConteos) return [];
    if (Array.isArray(rawConteos)) return rawConteos as Conteo[];
    return (rawConteos as any).items ?? (rawConteos as any).data ?? [];
  }, [rawConteos]);

  const { data: almacenes = [] } = useQuery<Almacen[]>({
    queryKey: ['almacenes'],
    queryFn:  () => api.get('/almacenes').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/conteo-inventario', dto),
    onSuccess: (res: any) => {
      const nuevo: Conteo = res.data?.data ?? res.data;
      qc.invalidateQueries({ queryKey: ['conteos'] });
      qc.invalidateQueries({ queryKey: ['conteo-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      setTipoSel('total');
      message.success(`Hoja ${nuevo.codigo} creada con ${nuevo.totalLineas} líneas`);
      setConteoId(nuevo.id);
      setVista('digitacion');
    },
    onError: (e) => message.error(errMsg(e), 5),
  });

  if (vista === 'digitacion' && conteoId) {
    return (
      <ConteoDigitacion
        conteoId={conteoId}
        onBack={() => { setVista('lista'); refetchLista(); }}
      />
    );
  }

  // ── Resumen totales ──
  const byEstado = Object.fromEntries(resumen.map(r => [r.estado, r.cantidad]));
  const enCurso  = (byEstado['en_conteo'] ?? 0) + (byEstado['en_digitacion'] ?? 0) + (byEstado['en_revision'] ?? 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AuditOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Conteo Físico de Inventario</Title>
            <Text type="secondary">Ciclo de conteo · Ajuste de stock por delta · Modalidad ciega</Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
          Nueva Hoja de Conteo
        </Button>
      </div>

      {enCurso > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={`${enCurso} conteo(s) en curso`}
          description="Solo puede haber un conteo activo por almacén. Cierra los abiertos antes de crear uno nuevo en el mismo almacén."
        />
      )}

      <Card bordered={false}>
        <Table<Conteo>
          dataSource={conteos}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 10, showTotal: t => `${t} conteos` }}
          onRow={row => ({
            style: { cursor: 'pointer' },
            onClick: () => { setConteoId(row.id); setVista('digitacion'); },
          })}
          columns={[
            {
              title: 'Código', dataIndex: 'codigo', key: 'cod', width: 130,
              render: v => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</Text>,
            },
            {
              title: 'Nombre', dataIndex: 'nombre', key: 'nom', ellipsis: true,
              render: v => v ?? '—',
            },
            {
              title: 'Tipo', dataIndex: 'tipo', key: 'tp', width: 110,
              render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '—',
            },
            {
              title: 'Progreso', key: 'prog', width: 170,
              render: (_, r) => {
                const total = Number(r.totalLineas ?? 0);
                const contadas = Number(r.lineasContadas ?? 0);
                const pct = total > 0 ? Math.round((contadas / total) * 100) : 0;
                return <Progress percent={pct} size="small"
                  format={() => `${contadas}/${total}`}
                  strokeColor={pct === 100 ? token.colorSuccess : undefined} />;
              },
            },
            {
              title: 'Dif.', dataIndex: 'totalDiferencias', key: 'dif', width: 70, align: 'center',
              render: v => {
                const n = Number(v ?? 0);
                return n > 0
                  ? <Tag color="orange" style={{ fontSize: 11 }}>{n}</Tag>
                  : <Tag color="green"  style={{ fontSize: 11 }}>0</Tag>;
              },
            },
            {
              title: 'Estado', dataIndex: 'estado', key: 'est', width: 120,
              render: (v: ConteoEstado) => {
                if (!v) return '—';
                const c = ESTADO_CONFIG[v] ?? { color: 'default', label: v };
                return <Tag color={c.color}>{c.label}</Tag>;
              },
            },
            {
              title: 'Fecha', dataIndex: 'createdAt', key: 'f', width: 96,
              render: v => v ? fecha(v) : '—',
            },
            {
              title: '', key: 'a', width: 80, align: 'right',
              render: (_, r) => (
                <Button size="small" type="link"
                  onClick={e => { e.stopPropagation(); setConteoId(r.id); setVista('digitacion'); }}>
                  Abrir →
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Crear */}
      <Modal
        title={<Space><AuditOutlined />Nueva Hoja de Conteo</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); setTipoSel('total'); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear y abrir"
        width={520}
        destroyOnClose
      >
        <Form
          form={formCrear}
          layout="vertical"
          initialValues={{ tipo: 'total', modalidad: 'ciego', umbralTipo: 'unidades', umbralValor: 10 }}
          onFinish={values => {
            const dto: any = { ...values };
            if (tipoSel === 'categoria' && values.filtroTexto) {
              dto.filtros = { categorias: values.filtroTexto.split(',').map((s: string) => s.trim()).filter(Boolean) };
            } else if (tipoSel === 'marca' && values.filtroTexto) {
              dto.filtros = { marcas: values.filtroTexto.split(',').map((s: string) => s.trim()).filter(Boolean) };
            }
            delete dto.filtroTexto;
            crear.mutate(dto);
          }}
        >
          <Form.Item name="nombre" label="Nombre / Descripción" rules={[{ required: true, message: 'Obligatorio' }]}>
            <Input placeholder="Conteo Mensual Agosto 2026" autoFocus />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="almacenId" label="Almacén" rules={[{ required: true, message: 'Selecciona almacén' }]}>
                <Select placeholder="Seleccionar" showSearch optionFilterProp="children">
                  {almacenes.map((a: Almacen) => <Option key={a.id} value={a.id}>{a.nombre}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tipo" label="Tipo de Conteo" rules={[{ required: true }]}>
                <Select onChange={v => setTipoSel(String(v))}>
                  {TIPOS_CONTEO.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="modalidad"
                label="Modalidad"
                tooltip="Ciega: el capturador no ve el stock del sistema. Evita sesgo: el contador anota lo que físicamente hay, no lo que el sistema dice."
                rules={[{ required: true }]}
              >
                <Select>
                  <Option value="ciego">Ciega (recomendada)</Option>
                  <Option value="informado">Informada (muestra stock sistema)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {(tipoSel === 'categoria' || tipoSel === 'marca') && (
            <Form.Item
              name="filtroTexto"
              label={tipoSel === 'categoria' ? 'Categorías (separadas por coma)' : 'Marcas (separadas por coma)'}
              rules={[{ required: true, message: 'Ingresa al menos un valor' }]}
            >
              <Input placeholder={tipoSel === 'categoria' ? 'Lácteos, Bebidas, Granos' : 'Nestlé, Unilever'} />
            </Form.Item>
          )}

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="umbralTipo" label="Tipo de Umbral" tooltip="Diferencia a partir de la cual se solicita segundo recuento">
                <Select>
                  <Option value="unidades">Unidades</Option>
                  <Option value="valor">Valor ($)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="umbralValor" label="Valor del Umbral" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={4} placeholder="10" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={2} placeholder="Observaciones del conteo" />
          </Form.Item>
        </Form>

        <Alert type="info" showIcon style={{ fontSize: 12, marginTop: 4 }}
          message="Se cargará el stock actual de los productos en el almacén seleccionado, ordenados por ubicación física (pasillo → estante → nivel → posición)."
        />
      </Modal>
    </div>
  );
}
