import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Tabs, Table, Tag, Button, Descriptions, Row, Col, Spin, Checkbox, Radio, Alert, Switch, Space, Divider,
  Modal, Form, InputNumber, DatePicker, Select, Input, message, Progress, theme, Tooltip
} from 'antd';
import dayjs from 'dayjs';
import { ArrowLeft, FileText, DollarSign, Plus, Printer, Mail, RefreshCw, Scissors, FileSignature } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';
import api from '../../api/client';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import { EmailConCopiaModal } from '../../components/ui/EmailConCopiaModal';
import { ahora, fecha, hoyRD } from '../../utils/fechaRD';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const estadoColor: Record<string, string> = { al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default', refinanciado: 'purple', desembolso_parcial: 'gold' };
const cuotaColor: Record<string, string> = { pendiente: 'default', pagada: 'green', vencida: 'red', pagada_parcial: 'orange' };
const estadoGarantiaColor: Record<string, string> = { activa: 'green', liberada: 'blue', ejecutada: 'red' };
const estadoGaranteColor: Record<string, string> = { activo: 'green', liberado: 'blue' };

/**
 * Etapa 6 (Seguridad): anular un pago, liberar/ejecutar una garantía y
 * liberar un garante ya quedan registrados en el backend (quién, cuándo,
 * motivo — pagos.service.ts/garantias.service.ts/garantes.service.ts), pero
 * esta pantalla nunca lo mostraba — solo la etiqueta de estado, sin decir
 * quién lo hizo ni por qué. Un Tooltip sobre el Tag de estado, sin agregar
 * columnas nuevas a tablas que ya van apretadas de ancho.
 */
function tooltipAuditoria(partes: { quien?: string; cuando?: any; motivo?: string }): string | undefined {
  const { quien, cuando, motivo } = partes;
  if (!quien && !cuando && !motivo) return undefined;
  const lineas = [
    quien ? `Por: ${quien}` : null,
    cuando ? `Fecha: ${String(cuando).slice(0, 19).replace('T', ' ')}` : null,
    motivo ? `Motivo: ${motivo}` : null,
  ].filter(Boolean);
  return lineas.join(' · ');
}

type TipoPago = 'cuotas' | 'abono_parcial' | 'abono_extraordinario_capital' | 'liquidar';

/** Lo que falta de una cuota — capital+interés+cargos pendientes, cero si ya está saldada. */
function pendienteDeCuota(c: any): number {
  const cargosTotal = Array.isArray(c.cargos) ? c.cargos.reduce((a: number, x: any) => a + Number(x.monto ?? 0), 0) : 0;
  return Math.max(0, Number(c.capital) - Number(c.capitalPagado)) +
    Math.max(0, Number(c.interes) - Number(c.interesPagado)) +
    Math.max(0, cargosTotal - Number(c.cargosPagados ?? 0));
}

function VehiculoDetalle({ vehiculoId }: { vehiculoId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prestamista-vehiculo', vehiculoId],
    queryFn: () => prestamistalApi.getVehiculo(vehiculoId),
  });
  if (isLoading) return <Spin size="small" />;
  if (!data) return <div>Vehículo no encontrado</div>;
  const v: any = data;
  const hoy = ahora();
  const vence = v.fechaVencePoliza ? new Date(v.fechaVencePoliza) : null;
  const dias = vence ? Math.ceil((vence.getTime() - hoy.getTime()) / 86400000) : null;
  const polizaTag = !vence ? null
    : dias! < 0 ? <Tag color="red">Póliza vencida hace {Math.abs(dias!)}d</Tag>
    : dias! <= 30 ? <Tag color="orange">Vence en {dias}d</Tag>
    : <Tag color="green">Vigente hasta {fecha(v.fechaVencePoliza)}</Tag>;

  return (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
      <Descriptions.Item label="Placa"><b>{v.placa ?? '—'}</b></Descriptions.Item>
      <Descriptions.Item label="Chasis">{v.chasis ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Motor">{v.motor ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Marca">{v.marca ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Modelo">{v.modelo ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Año">{v.anio ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Color">{v.color ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Tipo">{v.tipoVehiculo ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Valor Mercado">{fmt(v.valorMercado)}</Descriptions.Item>
      <Descriptions.Item label="Valor Factura">{fmt(v.valorFactura)}</Descriptions.Item>
      <Descriptions.Item label="Aseguradora">{v.aseguradora ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="No. Póliza">{v.polizaSeguro ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Seguro">{polizaTag ?? '—'}</Descriptions.Item>
    </Descriptions>
  );
}

export default function DetallePrestamo() {
  const { token: C } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pagoOpen, setPagoOpen] = useState(false);
  // C1: una clave por intento de pago — se genera al ABRIR el formulario, no
  // al enviarlo, para que un reintento de red (el usuario nunca vio
  // respuesta) reuse la misma clave en vez de generar una nueva en cada
  // intento. Ver PrPago.claveIdempotencia / PagosService.registrar().
  const [pagoClave, setPagoClave] = useState<string>(() => crypto.randomUUID());
  const [garantiaOpen, setGarantiaOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [formPago] = Form.useForm();
  const [formGarantia] = Form.useForm();
  const [formCancelar] = Form.useForm();

  // ── Anular pago (§1), garantes (§2) y ciclo de vida de garantías (§3) ──
  const [anularPagoTarget, setAnularPagoTarget] = useState<any>(null);
  const [formAnularPago] = Form.useForm();
  const [garanteOpen, setGaranteOpen] = useState(false);
  const [formGarante] = Form.useForm();
  const [liberarGaranteTarget, setLiberarGaranteTarget] = useState<any>(null);
  const [formLiberarGarante] = Form.useForm();
  const [liberarGarantiaTarget, setLiberarGarantiaTarget] = useState<any>(null);
  const [formLiberarGarantia] = Form.useForm();
  const [ejecutarGarantiaTarget, setEjecutarGarantiaTarget] = useState<any>(null);
  const [formEjecutarGarantia] = Form.useForm();

  // ── Desembolsos parciales (§4), reestructuración (§5) y condonación (§6) ──
  const [tramoOpen, setTramoOpen] = useState(false);
  const [formTramo] = Form.useForm();
  const [reestructurarOpen, setReestructurarOpen] = useState(false);
  const [formReestructurar] = Form.useForm();
  const [condonarOpen, setCondonarOpen] = useState(false);
  const [formCondonar] = Form.useForm();

  // ── Registrar Pago (rediseño) ──────────────────────────────────────────
  const [tipoPago, setTipoPago] = useState<TipoPago>('cuotas');
  const [cuotasSel, setCuotasSel] = useState<number[]>([]);
  const [destinoExcedente, setDestinoExcedente] = useState<'' | 'siguientes_cuotas' | 'capital'>('');
  const [abonoOpcion, setAbonoOpcion] = useState<'reducir_cuota' | 'reducir_plazo'>('reducir_cuota');
  const [pagoMixto, setPagoMixto] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string>('');
  const [supervisorToken, setSupervisorToken] = useState<string | null>(null);
  const [supervisorOpen, setSupervisorOpen] = useState(false);
  const [formSupervisor] = Form.useForm();
  const [pagoRecienCreado, setPagoRecienCreado] = useState<any>(null);
  const [emailReciboOpen, setEmailReciboOpen] = useState(false);
  const montoPagadoWatch = Form.useWatch('montoPagado', formPago);
  const fechaWatch = Form.useWatch('fecha', formPago);
  const montoRecibidoWatch = Form.useWatch('montoRecibido', formPago);
  const formasPagoWatch = Form.useWatch('formasPago', formPago);

  const { data: prestamo, isLoading } = useQuery({
    queryKey: ['prestamista-prestamo', id],
    queryFn: () => prestamistalApi.getPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: pagos = [] } = useQuery({
    queryKey: ['prestamista-pagos', id],
    queryFn: () => prestamistalApi.getPagosByPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['prestamista-garantias', id],
    queryFn: () => prestamistalApi.getGarantiasByPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: garantes = [] } = useQuery({
    queryKey: ['prestamista-garantes', id],
    queryFn: () => prestamistalApi.getGarantesByPrestamo(Number(id)),
    enabled: !!id,
  });

  const { data: tramos = [] } = useQuery({
    queryKey: ['prestamista-desembolsos-parciales', id],
    queryFn: () => prestamistalApi.getDesembolsosParciales(Number(id)),
    enabled: !!id,
  });

  // Cajas abiertas hoy — para el selector cuando el pago/tramo es en efectivo
  // (Etapa 5, Parte B). Mismo patrón que GastosPage.
  const { data: cajasHoy } = useQuery({
    queryKey: ['caja-hoy-prestamista'],
    queryFn: () => api.get('/caja/hoy').then(r => {
      const d = r.data?.data ?? r.data;
      if (Array.isArray(d?.cajas)) return d.cajas as any[];
      if (d?.id)                   return [d] as any[];
      return [] as any[];
    }),
    enabled: pagoOpen || tramoOpen,
    staleTime: 30_000,
  });

  const cuotasPendientes: any[] = useMemo(
    () => (prestamo?.cuotas ?? []).filter((c: any) => c.estado !== 'pagada').sort((a: any, b: any) => a.numeroCuota - b.numeroCuota),
    [prestamo],
  );
  const montoSeleccionado = useMemo(
    () => Math.round(cuotasSel.reduce((a, cid) => a + pendienteDeCuota(cuotasPendientes.find((c: any) => c.id === cid) ?? {}), 0) * 100) / 100,
    [cuotasSel, cuotasPendientes],
  );

  /** Clic en la fila i: selecciona el prefijo [0..i] (o [0..i-1] si ya estaba seleccionada) — el backend exige exactamente un prefijo, nunca saltar una. */
  const toggleCuotaHasta = (indice: number) => {
    const yaSeleccionada = cuotasSel.includes(cuotasPendientes[indice]?.id);
    const hasta = yaSeleccionada ? indice - 1 : indice;
    setCuotasSel(cuotasPendientes.slice(0, hasta + 1).map((c: any) => c.id));
  };
  const seleccionarVencidas = () => {
    let hasta = -1;
    cuotasPendientes.forEach((c: any, i: number) => { if (Number(c.diasMora) > 0) hasta = i; });
    setCuotasSel(cuotasPendientes.slice(0, hasta + 1).map((c: any) => c.id));
  };

  // Vista previa — recalcula en el servidor cada vez que cambia algo relevante (debounced).
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!pagoOpen || !id) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const monto = Number(montoPagadoWatch);
    // 'liquidar': el servidor ignora el monto enviado y calcula el exacto —
    // la vista previa debe pedirse igual aunque el campo todavía esté vacío.
    if (tipoPago !== 'liquidar' && (!monto || monto <= 0)) { setPreview(null); setPreviewError(''); return; }
    previewTimer.current = setTimeout(() => {
      const body: any = {
        prestamoId: Number(id), montoPagado: monto > 0 ? monto : 1, tipoPago,
        fecha: fechaWatch ? fechaWatch.format('YYYY-MM-DD') : undefined,
      };
      if (tipoPago === 'cuotas' || tipoPago === 'abono_extraordinario_capital') body.cuotasSeleccionadas = cuotasSel;
      if (destinoExcedente) body.destinoExcedente = destinoExcedente;
      if (tipoPago === 'abono_extraordinario_capital') body.abonoExtraordinarioOpcion = abonoOpcion;
      prestamistalApi.previewPago(body)
        .then((d: any) => { setPreview(d); setPreviewError(''); })
        .catch((e: any) => { setPreview(null); setPreviewError(e?.response?.data?.message ?? 'No se pudo calcular la vista previa'); });
    }, 400);
  }, [pagoOpen, id, tipoPago, cuotasSel, montoPagadoWatch, fechaWatch, destinoExcedente, abonoOpcion]);

  const esRetroactivo = fechaWatch && fechaWatch.isBefore(dayjs(hoyRD()), 'day');

  // Monto a pagar: se auto-llena según el tipo, pero el cajero puede editarlo a mano.
  useEffect(() => {
    if (!pagoOpen) return;
    if (tipoPago === 'cuotas') formPago.setFieldValue('montoPagado', montoSeleccionado || undefined);
  }, [pagoOpen, tipoPago, montoSeleccionado, formPago]);

  // Liquidar: el monto exacto solo se conoce después de que el servidor lo calcule (vista previa).
  useEffect(() => {
    if (tipoPago === 'liquidar' && preview?.montoTotalAplicado != null) {
      formPago.setFieldValue('montoPagado', preview.montoTotalAplicado);
    }
  }, [tipoPago, preview, formPago]);

  const autorizarSupervisor = useMutation({
    mutationFn: (vals: any) => api.post('/auth/verificar-supervisor', {
      email: vals.email, password: vals.password, clave: 'pago_retroactivo',
      action: 'Pago retroactivo', detail: `Préstamo ${prestamo?.numero ?? ''}`,
    }).then((r: any) => r.data),
    onSuccess: (d: any) => {
      if (!d?.ok) { message.error('Credenciales de supervisor incorrectas'); return; }
      setSupervisorToken(d.supervisorToken ?? 'sesion');
      setSupervisorOpen(false);
      formSupervisor.resetFields();
      message.success(`Autorizado por ${d.nombre}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al autorizar'),
  });

  const enviarReciboCorreo = useMutation({
    mutationFn: (params: { email: string; cc?: string; cco?: string }) =>
      prestamistalApi.enviarReciboCorreo(pagoRecienCreado.id, params),
    onSuccess: () => { message.success('Recibo enviado por correo'); setEmailReciboOpen(false); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al enviar el recibo'),
  });

  const registrarPago = useMutation({
    mutationFn: (vals: any) => {
      const body: any = {
        prestamoId: Number(id),
        montoPagado: vals.montoPagado,
        tipoPago,
        fecha: vals.fecha ? vals.fecha.format('YYYY-MM-DD') : undefined,
        notas: vals.observaciones,
        claveIdempotencia: pagoClave,
      };
      if (tipoPago === 'cuotas' || tipoPago === 'abono_extraordinario_capital') body.cuotasSeleccionadas = cuotasSel;
      if (destinoExcedente) body.destinoExcedente = destinoExcedente;
      if (tipoPago === 'abono_extraordinario_capital') body.abonoExtraordinarioOpcion = abonoOpcion;
      if (pagoMixto && vals.formasPago?.length) {
        body.formasPago = vals.formasPago;
      } else {
        body.metodoPago = vals.formaPago;
        body.referencia = vals.referencia;
      }
      if (vals.formaPago === 'efectivo' && !pagoMixto) {
        body.montoRecibido = vals.montoRecibido;
        if (vals.cajaDiariaId) body.cajaDiariaId = vals.cajaDiariaId;
      }
      const headers = esRetroactivo && supervisorToken && supervisorToken !== 'sesion'
        ? { 'x-supervisor-token': supervisorToken } : undefined;
      return prestamistalApi.registrarPago(body, headers);
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-pagos', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-dashboard'] });
      setPagoOpen(false);
      formPago.resetFields();
      setPagoClave(crypto.randomUUID());
      setCuotasSel([]); setTipoPago('cuotas'); setDestinoExcedente(''); setPagoMixto(false);
      setSupervisorToken(null); setPreview(null);
      setPagoRecienCreado(d?.pago ?? null);
      message.success('Pago registrado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar pago'),
  });

  const crearGarantia = useMutation({
    // fechaTasacion se captura en el formulario pero pr_garantias no tiene
    // esa columna (ni CrearGarantiaDto ese campo) — se excluye del body
    // para no chocar con forbidNonWhitelisted (Etapa 1).
    mutationFn: ({ fechaTasacion, ...vals }: any) =>
      prestamistalApi.crearGarantia({ prestamoId: Number(id), deudorId: prestamo?.deudorId, ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantias', id] });
      setGarantiaOpen(false);
      formGarantia.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar garantía'),
  });

  const anularPago = useMutation({
    mutationFn: ({ pagoId, motivo }: { pagoId: number; motivo: string }) => prestamistalApi.anularPago(pagoId, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-pagos', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-dashboard'] });
      setAnularPagoTarget(null);
      formAnularPago.resetFields();
      message.success('Pago anulado — saldos y cuotas revertidos');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular el pago'),
  });

  const crearGarante = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearGarante({ prestamoId: Number(id), ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantes', id] });
      setGaranteOpen(false);
      formGarante.resetFields();
      message.success('Garante agregado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar garante'),
  });

  const liberarGarante = useMutation({
    mutationFn: ({ garanteId, motivo }: { garanteId: number; motivo?: string }) => prestamistalApi.liberarGarante(garanteId, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantes', id] });
      setLiberarGaranteTarget(null);
      formLiberarGarante.resetFields();
      message.success('Garante liberado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al liberar garante'),
  });

  const liberarGarantia = useMutation({
    mutationFn: ({ garantiaId, motivo }: { garantiaId: number; motivo?: string }) => prestamistalApi.liberarGarantia(garantiaId, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantias', id] });
      setLiberarGarantiaTarget(null);
      formLiberarGarantia.resetFields();
      message.success('Garantía liberada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al liberar garantía'),
  });

  const ejecutarGarantia = useMutation({
    mutationFn: ({ garantiaId, motivo }: { garantiaId: number; motivo: string }) => prestamistalApi.ejecutarGarantia(garantiaId, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-garantias', id] });
      setEjecutarGarantiaTarget(null);
      formEjecutarGarantia.resetFields();
      message.success('Garantía ejecutada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al ejecutar garantía'),
  });

  const registrarTramo = useMutation({
    mutationFn: (vals: any) => prestamistalApi.registrarDesembolsoParcial({
      prestamoId: Number(id), monto: vals.monto, fecha: vals.fecha.format('YYYY-MM-DD'),
      metodoPago: vals.metodoPago, notas: vals.notas,
      ...(vals.metodoPago === 'efectivo' && vals.cajaDiariaId ? { cajaDiariaId: vals.cajaDiariaId } : {}),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-desembolsos-parciales', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-prestamos'] });
      setTramoOpen(false);
      formTramo.resetFields();
      message.success(d?.completo ? 'Desembolso completado' : 'Tramo registrado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar el tramo'),
  });

  const reestructurar = useMutation({
    mutationFn: (vals: any) => prestamistalApi.reestructurarPrestamo(Number(id), vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      setReestructurarOpen(false);
      formReestructurar.resetFields();
      message.success('Préstamo reestructurado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al reestructurar'),
  });

  const condonar = useMutation({
    mutationFn: (vals: any) => prestamistalApi.condonarPrestamo(Number(id), vals),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      setCondonarOpen(false);
      formCondonar.resetFields();
      message.success(`Condonado: ${fmt(d?.moraCondonada ?? 0)} de mora, ${fmt(d?.interesCondonado ?? 0)} de interés`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al condonar'),
  });

  const cancelar = useMutation({
    mutationFn: (vals: any) => prestamistalApi.cancelarPrestamo(Number(id), vals.motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-prestamos'] });
      setCancelarOpen(false);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cancelar préstamo'),
  });

  const recalcular = useMutation({
    mutationFn: () => prestamistalApi.recalcularPrestamo(Number(id)),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamo', id] });
      qc.invalidateQueries({ queryKey: ['prestamista-prestamos'] });
      message.success(`Saldos recalculados → ${d?.estado ?? 'ok'}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al recalcular'),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  if (!prestamo) return <div style={{ padding: 24 }}>Préstamo no encontrado</div>;

  const cuotas: any[] = prestamo.cuotas ?? [];
  const pagado = Number(prestamo.montoPrincipal) - Number(prestamo.saldoCapital);
  const pctPagado = prestamo.montoPrincipal > 0 ? Math.round((pagado / Number(prestamo.montoPrincipal)) * 100) : 0;
  const activo = !['pagado', 'cancelado', 'refinanciado'].includes(prestamo.estado);
  // §4 — con desembolso pendiente no se puede cobrar, reestructurar ni condonar.
  const operable = activo && prestamo.estado !== 'desembolso_parcial';
  const faltaPorDesembolsar = Math.max(0, Number(prestamo.montoPrincipal) - Number(prestamo.desembolsado ?? prestamo.montoPrincipal));

  const exportarCuotas = () => {
    const filas = cuotas.map((r: any) => ({
      '#': r.numeroCuota,
      'Vencimiento': r.fechaVencimiento?.slice(0, 10),
      'Capital': r.capitalCuota,
      'Interés': r.interesCuota,
      'Cuota Total': r.cuotaTotal,
      'Capital Pagado': r.capitalPagado,
      'Interés Pagado': r.interesPagado,
      'Mora': r.moraGenerada,
      'Días Mora': r.diasMora,
      'Estado': r.estado,
    }));
    exportarExcel(filas, `Cuotas-${prestamo.numero}-${hoyRD()}`);
    message.success(`${filas.length} cuotas exportadas`);
  };

  const exportarPagos = () => {
    const filas = (pagos as any[]).map((r: any) => ({
      'Número': r.numero,
      'Fecha': r.fecha?.toString().slice(0, 10),
      'Total Pagado': r.montoPagado,
      'Capital': r.aplicadoCapital,
      'Interés': r.aplicadoInteres,
      'Mora': r.aplicadoMora,
      'Forma Pago': r.metodoPago,
    }));
    exportarExcel(filas, `Pagos-${prestamo.numero}-${hoyRD()}`);
    message.success(`${filas.length} pagos exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/prestamista/prestamos')}>Volver</Button>
        <h2 style={{ margin: 0, color: C.colorText }}>{prestamo.numero}</h2>
        <Tag color={estadoColor[prestamo.estado] ?? 'default'}>{prestamo.estado?.replace('_', ' ')}</Tag>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon={<FileText size={14} />} onClick={() => window.open(prestamistalApi.pdfAmortizacion(Number(id)), '_blank')}>PDF Amortización</Button>
          <Button icon={<FileSignature size={14} />} onClick={() => window.open(prestamistalApi.pdfContrato(Number(id)), '_blank')}>Contrato</Button>
          <Button icon={<FileSignature size={14} />} onClick={() => window.open(prestamistalApi.pdfPagare(Number(id)), '_blank')}>Pagaré</Button>
          <Button onClick={() => recalcular.mutate()} loading={recalcular.isPending}>Recalcular Saldos</Button>
          {operable && <Button icon={<RefreshCw size={14} />} onClick={() => setReestructurarOpen(true)}>Reestructurar</Button>}
          {operable && <Button icon={<Scissors size={14} />} onClick={() => setCondonarOpen(true)}>Condonar</Button>}
          {activo && prestamo.estado === 'desembolso_parcial' && (
            <Button type="primary" icon={<DollarSign size={14} />} onClick={() => { formTramo.resetFields(); setTramoOpen(true); }}>
              Registrar Tramo
            </Button>
          )}
          {operable && <Button type="primary" icon={<DollarSign size={14} />} onClick={() => {
            setPagoClave(crypto.randomUUID()); setCuotasSel([]); setTipoPago('cuotas');
            setDestinoExcedente(''); setPagoMixto(false); setSupervisorToken(null); setPreview(null);
            formPago.setFieldsValue({ fecha: dayjs(hoyRD()) });
            setPagoOpen(true);
          }}>Registrar Pago</Button>}
          {activo && <Button danger onClick={() => setCancelarOpen(true)}>Cancelar</Button>}
        </div>
      </div>

      {prestamo.estado === 'desembolso_parcial' && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message={`Desembolso pendiente: falta entregar ${fmt(faltaPorDesembolsar)} de ${fmt(prestamo.montoPrincipal)} — no se le puede cobrar hasta completarlo.`}
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {([
          { label: 'Capital',       value: fmt(prestamo.montoPrincipal), color: undefined },
          { label: 'Saldo Capital', value: fmt(prestamo.saldoCapital),   color: C.colorWarning },
          { label: 'Saldo Interés', value: fmt(prestamo.saldoInteres),   color: undefined },
          { label: 'Mora',          value: fmt(prestamo.saldoMora),      color: Number(prestamo.saldoMora) > 0 ? C.colorError : undefined },
          { label: 'Saldo Total',   value: fmt(prestamo.saldoTotal),     color: C.colorError },
        ] as const).map(({ label, value, color }) => (
          <Col xs={12} sm={8} md={4} key={label}>
            <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
              <div style={{ fontSize: 11, color: C.colorTextSecondary, marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: color ?? C.colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            </Card>
          </Col>
        ))}
        <Col xs={12} sm={8} md={4}>
          <Card size="small" styles={{ body: { padding: '10px 14px' } }}>
            <div style={{ fontSize: 11, color: C.colorTextSecondary, marginBottom: 6 }}>Avance Pago</div>
            <Progress percent={pctPagado} size="small" status={pctPagado === 100 ? 'success' : 'active'} />
          </Card>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'info',
          label: 'Información',
          children: (
            <Card>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
                <Descriptions.Item label="Deudor">{prestamo.deudorNombre}</Descriptions.Item>
                <Descriptions.Item label="Producto">{prestamo.productoNombre}</Descriptions.Item>
                <Descriptions.Item label="Método Amortización">{prestamo.metodoAmortizacion}</Descriptions.Item>
                <Descriptions.Item label="Tasa Mensual">{prestamo.tasaInteresMensual}%</Descriptions.Item>
                <Descriptions.Item label="Plazo">{prestamo.plazoMeses} meses</Descriptions.Item>
                <Descriptions.Item label="Frecuencia Pago">{prestamo.frecuenciaPago}</Descriptions.Item>
                <Descriptions.Item label="Cuota Periódica">{fmt(prestamo.cuotaPeriodica)}</Descriptions.Item>
                <Descriptions.Item label="Fecha Desembolso">{prestamo.fechaDesembolso?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Primer Pago">{prestamo.fechaPrimerPago?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Vencimiento">{prestamo.fechaVencimiento?.slice(0, 10)}</Descriptions.Item>
                <Descriptions.Item label="Días Mora Actual">{prestamo.diasMoraActual ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Cuotas Vencidas">{prestamo.cuotasVencidas ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Total Pagado">{fmt(prestamo.totalPagado)}</Descriptions.Item>
                <Descriptions.Item label="Total Interés Pagado">{fmt(prestamo.totalInteresPagado)}</Descriptions.Item>
                <Descriptions.Item label="Total Mora Pagada">{fmt(prestamo.totalMoraPagada)}</Descriptions.Item>
                {prestamo.observaciones && <Descriptions.Item label="Observaciones" span={3}>{prestamo.observaciones}</Descriptions.Item>}
              </Descriptions>
            </Card>
          ),
        },
        {
          key: 'cuotas',
          label: `Cuotas (${cuotas.length})`,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 2 }}>
                <Button icon={<FileExcelOutlined />} onClick={exportarCuotas}>Excel</Button>
                <RefreshByKeyButton queryKey={['prestamista-prestamo']} />
                <VideoTutorialButton />
              </div>
              <Table
                dataSource={cuotas.map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: '#', dataIndex: 'numeroCuota', width: 50 },
                  { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
                  { title: 'Capital', dataIndex: 'capital', render: fmt },
                  { title: 'Interés', dataIndex: 'interes', render: fmt },
                  { title: 'Cuota Total', dataIndex: 'cuotaTotal', render: fmt },
                  { title: 'Capital Pag.', dataIndex: 'capitalPagado', render: fmt },
                  { title: 'Interés Pag.', dataIndex: 'interesPagado', render: fmt },
                  { title: 'Mora', dataIndex: 'moraGenerada', render: (v: any) => <span style={{ color: Number(v) > 0 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
                  { title: 'Días Mora', dataIndex: 'diasMora', render: (v: any) => v > 0 ? <Tag color="red">{v}</Tag> : 0 },
                  { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={cuotaColor[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag> },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'pagos',
          label: `Pagos (${(pagos as any[]).length})`,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 2 }}>
                <Button icon={<FileExcelOutlined />} onClick={exportarPagos}>Excel</Button>
                <RefreshByKeyButton queryKey={['prestamista-pagos']} />
                <VideoTutorialButton />
              </div>
              <Table
                dataSource={(pagos as any[]).map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'Número', dataIndex: 'numero', width: 110 },
                  { title: 'Fecha', dataIndex: 'fecha', render: (v: any) => v?.toString().slice(0, 10) },
                  { title: 'Total Pagado', dataIndex: 'montoPagado', render: fmt },
                  { title: 'Capital', dataIndex: 'aplicadoCapital', render: fmt },
                  { title: 'Interés', dataIndex: 'aplicadoInteres', render: fmt },
                  { title: 'Mora', dataIndex: 'aplicadoMora', render: fmt },
                  { title: 'Forma Pago', dataIndex: 'metodoPago' },
                  {
                    title: 'Estado', dataIndex: 'estado',
                    render: (v: string, r: any) => {
                      const tag = <Tag color={v === 'anulado' ? 'red' : 'green'}>{v ?? 'activo'}</Tag>;
                      if (v !== 'anulado') return tag;
                      const detalle = tooltipAuditoria({ quien: r.anuladoPorNombre, cuando: r.anuladoEn, motivo: r.motivoAnulacion });
                      return detalle ? <Tooltip title={detalle}>{tag}</Tooltip> : tag;
                    },
                  },
                  {
                    title: '', key: 'acciones', width: 130,
                    render: (_: any, r: any) => (
                      <Space size={4}>
                        <Button size="small" icon={<FileText size={13} />} onClick={() => window.open(prestamistalApi.pdfRecibo(r.id), '_blank')} />
                        {r.estado !== 'anulado' && (
                          <Button size="small" danger onClick={() => setAnularPagoTarget(r)}>Anular</Button>
                        )}
                      </Space>
                    ),
                  },
                ]}
              />
            </div>
          ),
        },
        ...(prestamo.vehiculoId ? [{
          key: 'vehiculo',
          label: 'Vehículo',
          children: (
            <Card>
              <VehiculoDetalle vehiculoId={prestamo.vehiculoId} />
            </Card>
          ),
        }] : []),
        {
          key: 'garantias',
          label: `Garantías (${(garantias as any[]).length})`,
          children: (
            <div>
              <Button icon={<Plus size={14} />} style={{ marginBottom: 12 }} onClick={() => setGarantiaOpen(true)}>Agregar Garantía</Button>
              <Table
                dataSource={(garantias as any[]).map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'Tipo', dataIndex: 'tipo' },
                  { title: 'Descripción', dataIndex: 'descripcion' },
                  { title: 'Valor Tasado', dataIndex: 'valorTasado', render: fmt },
                  {
                    title: 'Estado', dataIndex: 'estado',
                    render: (v: string, r: any) => {
                      const tag = <Tag color={estadoGarantiaColor[v] ?? 'default'}>{v}</Tag>;
                      if (v !== 'liberada' && v !== 'ejecutada') return tag;
                      const detalle = tooltipAuditoria({ quien: r.cambiadoPorNombre, cuando: r.fechaEjecucion ?? r.updatedAt, motivo: r.motivoCambioEstado });
                      return detalle ? <Tooltip title={detalle}>{tag}</Tooltip> : tag;
                    },
                  },
                  { title: 'Fecha Tasación', dataIndex: 'fechaTasacion', render: (v: string) => v?.slice(0, 10) },
                  {
                    title: '', key: 'acciones', width: 170,
                    render: (_: any, r: any) => r.estado === 'activa' ? (
                      <Space size={4}>
                        <Button size="small" onClick={() => setLiberarGarantiaTarget(r)}>Liberar</Button>
                        <Button size="small" danger onClick={() => setEjecutarGarantiaTarget(r)}>Ejecutar</Button>
                      </Space>
                    ) : null,
                  },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'garantes',
          label: `Garantes (${(garantes as any[]).length})`,
          children: (
            <div>
              <Button icon={<Plus size={14} />} style={{ marginBottom: 12 }} onClick={() => setGaranteOpen(true)}>Agregar Garante</Button>
              <Table
                dataSource={(garantes as any[]).map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'Nombre', dataIndex: 'nombre' },
                  { title: 'Cédula', dataIndex: 'cedula' },
                  { title: 'Teléfono', dataIndex: 'telefono' },
                  { title: 'Relación', dataIndex: 'relacionDeudor' },
                  { title: 'Ingreso Mensual', dataIndex: 'ingresoMensual', render: (v: any) => v != null ? fmt(v) : '—' },
                  {
                    title: 'Estado', dataIndex: 'estado',
                    render: (v: string, r: any) => {
                      const tag = <Tag color={estadoGaranteColor[v] ?? 'default'}>{v}</Tag>;
                      if (v !== 'liberado') return tag;
                      const detalle = tooltipAuditoria({ quien: r.liberadoPorNombre, cuando: r.liberadoEn, motivo: r.motivoLiberacion });
                      return detalle ? <Tooltip title={detalle}>{tag}</Tooltip> : tag;
                    },
                  },
                  {
                    title: '', key: 'acciones', width: 100,
                    render: (_: any, r: any) => r.estado !== 'liberado' ? (
                      <Button size="small" onClick={() => setLiberarGaranteTarget(r)}>Liberar</Button>
                    ) : null,
                  },
                ]}
              />
            </div>
          ),
        },
        ...((tramos as any[]).length ? [{
          key: 'desembolsos',
          label: `Desembolsos (${(tramos as any[]).length})`,
          children: (
            <Table
              dataSource={(tramos as any[]).map((r: any) => ({ ...r, key: r.id }))}
              scroll={{ x: 'max-content' }} size="small"
              columns={[
                { title: 'Fecha', dataIndex: 'fecha', render: (v: any) => v?.toString().slice(0, 10) },
                { title: 'Monto', dataIndex: 'monto', render: fmt },
                { title: 'Forma de Pago', dataIndex: 'metodoPago' },
                { title: 'Notas', dataIndex: 'notas' },
              ]}
            />
          ),
        }] : []),
      ]} />

      {/* Modal pago */}
      <Modal
        title="Registrar Pago" open={pagoOpen} width={740}
        onCancel={() => { setPagoOpen(false); formPago.resetFields(); }}
        onOk={() => formPago.validateFields().then(v => {
          if (esRetroactivo && !supervisorToken) { message.warning('Autoriza con un supervisor primero — la fecha es anterior a hoy'); return; }
          registrarPago.mutate(v);
        })}
        okText="Registrar" confirmLoading={registrarPago.isPending}
      >
        <Form form={formPago} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item label="Tipo de pago">
            <Radio.Group value={tipoPago} onChange={e => { setTipoPago(e.target.value); setCuotasSel([]); }} optionType="button" buttonStyle="solid">
              <Radio.Button value="cuotas">Pagar cuotas</Radio.Button>
              <Radio.Button value="abono_parcial">Abono parcial</Radio.Button>
              <Radio.Button value="abono_extraordinario_capital">Abono extra a capital</Radio.Button>
              <Radio.Button value="liquidar">Liquidar préstamo</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {(tipoPago === 'cuotas' || tipoPago === 'abono_extraordinario_capital') && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.colorTextSecondary }}>
                  Selecciona desde la cuota más vieja — el orden es obligatorio{tipoPago === 'abono_extraordinario_capital' ? ' (opcional aquí)' : ''}
                </span>
                <Button size="small" onClick={seleccionarVencidas}>Cuotas vencidas</Button>
              </div>
              <Table
                size="small" pagination={false} rowKey="id" dataSource={cuotasPendientes} scroll={{ y: 220 }}
                columns={[
                  { title: '', width: 32, render: (_: any, c: any, i: number) => (
                    <Checkbox checked={cuotasSel.includes(c.id)} onChange={() => toggleCuotaHasta(i)} />
                  ) },
                  { title: '#', dataIndex: 'numeroCuota', width: 40 },
                  { title: 'Vence', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
                  { title: 'Mora', dataIndex: 'diasMora', width: 70, render: (v: any) => Number(v) > 0 ? <Tag color="red">{v}d</Tag> : '—' },
                  { title: 'Pendiente', key: 'pend', align: 'right' as const, render: (_: any, c: any) => fmt(pendienteDeCuota(c)) },
                ]}
              />
              <div style={{ textAlign: 'right', margin: '8px 0', fontSize: 13 }}>
                Seleccionado: <b>{fmt(montoSeleccionado)}</b>
              </div>
            </>
          )}

          <Row gutter={12}>
            <Col span={tipoPago === 'liquidar' ? 24 : 12}>
              <Form.Item name="montoPagado" label={tipoPago === 'liquidar' ? 'Monto a Pagar (exacto, calculado)' : 'Monto a Pagar'} rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} prefix="RD$" min={0.01} disabled={tipoPago === 'liquidar'} />
              </Form.Item>
            </Col>
            {tipoPago !== 'liquidar' && (
              <Col span={12}>
                <Form.Item label="Excedente a">
                  <Select value={destinoExcedente || undefined} onChange={v => setDestinoExcedente(v ?? '')} allowClear placeholder="Del producto (por defecto)">
                    <Option value="siguientes_cuotas">Siguientes cuotas</Option>
                    <Option value="capital">Capital (reduce cuota/plazo)</Option>
                  </Select>
                </Form.Item>
              </Col>
            )}
          </Row>

          {tipoPago === 'abono_extraordinario_capital' && (
            <Form.Item label="¿Qué hacer con el capital restante?">
              <Radio.Group value={abonoOpcion} onChange={e => setAbonoOpcion(e.target.value)}>
                <Radio value="reducir_cuota">Reducir la cuota (mismo plazo)</Radio>
                <Radio value="reducir_plazo">Reducir el plazo (misma cuota)</Radio>
              </Radio.Group>
            </Form.Item>
          )}

          {tipoPago === 'cuotas' && montoPagadoWatch != null && montoSeleccionado > 0 && Number(montoPagadoWatch) !== montoSeleccionado && (
            Number(montoPagadoWatch) < montoSeleccionado ? (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                message="El monto es menor a lo seleccionado — se registrará como abono parcial a la cuota más vieja seleccionada." />
            ) : (
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                message={`El excedente (${fmt(Number(montoPagadoWatch) - montoSeleccionado)}) se aplicará a ${destinoExcedente === 'capital' ? 'capital' : 'las siguientes cuotas'}.`} />
            )
          )}
          {previewError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={previewError} />}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha" label="Fecha del Pago" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Pago mixto (varias formas)">
                <Switch checked={pagoMixto} onChange={setPagoMixto} />
              </Form.Item>
            </Col>
          </Row>

          {esRetroactivo && (
            <Alert
              type={supervisorToken ? 'success' : 'warning'} showIcon style={{ marginBottom: 12 }}
              message={supervisorToken ? 'Autorizado por supervisor' : 'Fecha anterior a hoy: requiere autorización de supervisor'}
              action={!supervisorToken && <Button size="small" onClick={() => setSupervisorOpen(true)}>Autorizar</Button>}
            />
          )}

          {!pagoMixto ? (
            <>
              <Form.Item name="formaPago" label="Forma de Pago" initialValue="efectivo">
                <Select>
                  <Option value="efectivo">Efectivo</Option>
                  <Option value="transferencia">Transferencia</Option>
                  <Option value="cheque">Cheque</Option>
                  <Option value="tarjeta">Tarjeta</Option>
                </Select>
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(p, c) => p.formaPago !== c.formaPago}>
                {() => formPago.getFieldValue('formaPago') && formPago.getFieldValue('formaPago') !== 'efectivo' ? (
                  <Form.Item name="referencia" label="Referencia" rules={[{ required: true, message: 'La referencia es obligatoria' }]}>
                    <Input placeholder="N° cheque, transferencia, confirmación..." />
                  </Form.Item>
                ) : (
                  <>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="montoRecibido" label="Monto Recibido"><InputNumber style={{ width: '100%' }} prefix="RD$" /></Form.Item>
                      </Col>
                      <Col span={12}>
                        <div style={{ paddingTop: 30, fontSize: 13 }}>
                          Cambio: <b>{fmt(Math.max(0, Number(montoRecibidoWatch ?? 0) - Number(montoPagadoWatch ?? 0)))}</b>
                        </div>
                      </Col>
                    </Row>
                    <Form.Item
                      name="cajaDiariaId"
                      label="Caja de efectivo (opcional)"
                      tooltip="Si se selecciona, el cobro entra al cuadre de esa caja. Déjalo vacío si no aplica."
                    >
                      <Select
                        placeholder="Seleccionar caja (opcional)"
                        loading={!cajasHoy}
                        allowClear
                        notFoundContent="No hay cajas abiertas hoy"
                        options={(cajasHoy ?? []).map((c: any) => ({
                          value: c.id,
                          label: c.vendedorNombre ? `${c.vendedorNombre} — Caja #${c.id}` : `Caja #${c.id}`,
                        }))}
                      />
                    </Form.Item>
                  </>
                )}
              </Form.Item>
            </>
          ) : (
            <Form.List name="formasPago">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(field => (
                    <Row gutter={8} key={field.key} align="top">
                      <Col span={7}>
                        <Form.Item name={[field.name, 'metodo']} rules={[{ required: true }]} initialValue="efectivo">
                          <Select>
                            <Option value="efectivo">Efectivo</Option>
                            <Option value="transferencia">Transferencia</Option>
                            <Option value="cheque">Cheque</Option>
                            <Option value="tarjeta">Tarjeta</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item name={[field.name, 'monto']} rules={[{ required: true }]}>
                          <InputNumber style={{ width: '100%' }} prefix="RD$" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name={[field.name, 'referencia']}>
                          <Input placeholder="Referencia (obligatoria si no es efectivo)" />
                        </Form.Item>
                      </Col>
                      <Col span={2}><Button danger size="small" onClick={() => remove(field.name)}>Quitar</Button></Col>
                    </Row>
                  ))}
                  <Button icon={<Plus size={14} />} onClick={() => add({ metodo: 'efectivo' })} block>Agregar forma de pago</Button>
                  {formasPagoWatch?.length > 0 && (
                    <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: C.colorTextSecondary }}>
                      Suma: {fmt(formasPagoWatch.reduce((a: number, f: any) => a + Number(f?.monto ?? 0), 0))}
                    </div>
                  )}
                </>
              )}
            </Form.List>
          )}

          <Form.Item name="observaciones" label="Observaciones" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item>

          {preview && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Descriptions size="small" column={2} title="Vista previa (calculada por el servidor)">
                <Descriptions.Item label="Mora">{fmt(preview.aplicadoMora)}</Descriptions.Item>
                <Descriptions.Item label="Interés">{fmt(preview.aplicadoInteres)}</Descriptions.Item>
                <Descriptions.Item label="Capital">{fmt(preview.aplicadoCapital)}</Descriptions.Item>
                <Descriptions.Item label="Cargos">{fmt(preview.aplicadoCargos)}</Descriptions.Item>
                {preview.montoExtraCapital > 0 && <Descriptions.Item label="Extra a capital" span={2}>{fmt(preview.montoExtraCapital)}</Descriptions.Item>}
                <Descriptions.Item label="Cuotas que quedan pagadas" span={2}>{preview.cuotasQuedanPagadas}</Descriptions.Item>
              </Descriptions>
            </>
          )}
        </Form>
      </Modal>

      {/* Modal autorización de supervisor — pago con fecha anterior a hoy */}
      <Modal
        title="Autorización de Supervisor" open={supervisorOpen} onCancel={() => setSupervisorOpen(false)}
        onOk={() => formSupervisor.validateFields().then(v => autorizarSupervisor.mutate(v))}
        okText="Autorizar" confirmLoading={autorizarSupervisor.isPending}
      >
        <p style={{ color: C.colorTextSecondary, fontSize: 13 }}>
          Registrar un pago con fecha anterior a hoy requiere la contraseña de un ADMIN o CONTADOR de esta empresa.
        </p>
        <Form form={formSupervisor} layout="vertical">
          <Form.Item name="email" label="Correo del supervisor" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="Contraseña" rules={[{ required: true }]}><Input.Password /></Form.Item>
        </Form>
      </Modal>

      {/* Modal post-pago: imprimir / WhatsApp / correo */}
      <Modal title="Pago registrado" open={!!pagoRecienCreado} onCancel={() => setPagoRecienCreado(null)} footer={null}>
        <p>Pago <b>{pagoRecienCreado?.numero}</b> registrado correctamente.</p>
        <Space wrap>
          <Button icon={<Printer size={14} />} onClick={() => pagoRecienCreado && window.open(prestamistalApi.pdfRecibo(pagoRecienCreado.id), '_blank')}>
            Imprimir
          </Button>
          {pagoRecienCreado && <WhatsAppButton tipo="recibo-prestamo" id={pagoRecienCreado.id} sendPdf folio={pagoRecienCreado.numero} />}
          <Button icon={<Mail size={14} />} onClick={() => setEmailReciboOpen(true)}>Enviar por correo</Button>
        </Space>
      </Modal>

      <EmailConCopiaModal
        open={emailReciboOpen} title="Enviar recibo por correo"
        documentoInfo={`Recibo ${pagoRecienCreado?.numero ?? ''}`}
        onCancel={() => setEmailReciboOpen(false)}
        onEnviar={params => enviarReciboCorreo.mutate(params)}
        loading={enviarReciboCorreo.isPending}
      />

      {/* Modal garantía */}
      <Modal title="Agregar Garantía" open={garantiaOpen} onCancel={() => { setGarantiaOpen(false); formGarantia.resetFields(); }}
        onOk={() => formGarantia.validateFields().then(v => crearGarantia.mutate(v))} okText="Guardar" confirmLoading={crearGarantia.isPending}>
        <Form form={formGarantia} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select>
              <Option value="inmueble">Inmueble</Option>
              <Option value="vehiculo">Vehículo</Option>
              <Option value="joya">Joya / Prenda</Option>
              <Option value="electrodomestico">Electrodoméstico</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="valorTasado" label="Valor Tasado (RD$)"><InputNumber style={{ width: '100%' }} prefix="RD$" /></Form.Item>
          <Form.Item name="fechaTasacion" label="Fecha Tasación"><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal cancelar */}
      <Modal title="Cancelar Préstamo" open={cancelarOpen} onCancel={() => setCancelarOpen(false)}
        onOk={() => formCancelar.validateFields().then(v => cancelar.mutate(v))} okText="Cancelar Préstamo" okButtonProps={{ danger: true }} confirmLoading={cancelar.isPending}>
        <Form form={formCancelar} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="motivo" label="Motivo de cancelación" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal anular pago (§1) — motivo obligatorio; el 403 de supervisor
          SIEMPRE (clave anular_pago_prestamo) lo resuelve el interceptor global. */}
      <Modal
        title="Anular Pago" open={!!anularPagoTarget}
        onCancel={() => { setAnularPagoTarget(null); formAnularPago.resetFields(); }}
        onOk={() => formAnularPago.validateFields().then(v => anularPago.mutate({ pagoId: anularPagoTarget.id, motivo: v.motivo }))}
        okText="Anular Pago" okButtonProps={{ danger: true }} confirmLoading={anularPago.isPending}
      >
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`Se revertirán las cuotas, saldos y el asiento contable del pago ${anularPagoTarget?.numero ?? ''}.`} />
        <Form form={formAnularPago} layout="vertical">
          <Form.Item name="motivo" label="Motivo de la anulación" rules={[{ required: true, whitespace: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal garante (§2) */}
      <Modal title="Agregar Garante" open={garanteOpen} onCancel={() => { setGaranteOpen(false); formGarante.resetFields(); }}
        onOk={() => formGarante.validateFields().then(v => crearGarante.mutate(v))} okText="Guardar" confirmLoading={crearGarante.isPending}>
        <Form form={formGarante} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="cedula" label="Cédula"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="direccion" label="Dirección"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="ocupacion" label="Ocupación"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="ingresoMensual" label="Ingreso Mensual (RD$)"><InputNumber style={{ width: '100%' }} prefix="RD$" min={0} /></Form.Item></Col>
          </Row>
          <Form.Item name="relacionDeudor" label="Relación con el deudor"><Input placeholder="Cónyuge, hermano, socio..." /></Form.Item>
        </Form>
      </Modal>

      {/* Modal liberar garante (§2) — motivo opcional, no mueve dinero */}
      <Modal title="Liberar Garante" open={!!liberarGaranteTarget}
        onCancel={() => { setLiberarGaranteTarget(null); formLiberarGarante.resetFields(); }}
        onOk={() => formLiberarGarante.validateFields().then(v => liberarGarante.mutate({ garanteId: liberarGaranteTarget.id, motivo: v.motivo }))}
        okText="Liberar" confirmLoading={liberarGarante.isPending}>
        <p style={{ color: C.colorTextSecondary, fontSize: 13 }}>
          {liberarGaranteTarget?.nombre} deja de respaldar este préstamo. Esto no afecta otros préstamos que respalde.
        </p>
        <Form form={formLiberarGarante} layout="vertical">
          <Form.Item name="motivo" label="Motivo (opcional)"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal liberar garantía (§3) — caso normal, motivo opcional, no requiere supervisor */}
      <Modal title="Liberar Garantía" open={!!liberarGarantiaTarget}
        onCancel={() => { setLiberarGarantiaTarget(null); formLiberarGarantia.resetFields(); }}
        onOk={() => formLiberarGarantia.validateFields().then(v => liberarGarantia.mutate({ garantiaId: liberarGarantiaTarget.id, motivo: v.motivo }))}
        okText="Liberar" confirmLoading={liberarGarantia.isPending}>
        <p style={{ color: C.colorTextSecondary, fontSize: 13 }}>
          La garantía "{liberarGarantiaTarget?.descripcion}" queda liberada — ya no respalda este préstamo.
        </p>
        <Form form={formLiberarGarantia} layout="vertical">
          <Form.Item name="motivo" label="Motivo (opcional)"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal ejecutar garantía (§3) — la acción más grave: motivo
          obligatorio, supervisor SIEMPRE (clave ejecutar_garantia). */}
      <Modal title="Ejecutar Garantía" open={!!ejecutarGarantiaTarget}
        onCancel={() => { setEjecutarGarantiaTarget(null); formEjecutarGarantia.resetFields(); }}
        onOk={() => formEjecutarGarantia.validateFields().then(v => ejecutarGarantia.mutate({ garantiaId: ejecutarGarantiaTarget.id, motivo: v.motivo }))}
        okText="Ejecutar Garantía" okButtonProps={{ danger: true }} confirmLoading={ejecutarGarantia.isPending}>
        <Alert type="error" showIcon style={{ marginBottom: 12 }}
          message={`El banco se queda con "${ejecutarGarantiaTarget?.descripcion ?? ''}" por impago. Esta acción requiere autorización de otra persona.`} />
        <Form form={formEjecutarGarantia} layout="vertical">
          <Form.Item name="motivo" label="Motivo de la ejecución" rules={[{ required: true, whitespace: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal registrar tramo (§4) — solo visible con desembolso pendiente */}
      <Modal title="Registrar Tramo de Desembolso" open={tramoOpen}
        onCancel={() => { setTramoOpen(false); formTramo.resetFields(); }}
        onOk={() => formTramo.validateFields().then(v => registrarTramo.mutate(v))}
        okText="Registrar" confirmLoading={registrarTramo.isPending}>
        <p style={{ color: C.colorTextSecondary, fontSize: 13 }}>
          Falta entregar {fmt(faltaPorDesembolsar)} de {fmt(prestamo.montoPrincipal)}.
        </p>
        <Form form={formTramo} layout="vertical" initialValues={{ fecha: dayjs(hoyRD()), metodoPago: 'efectivo' }}>
          <Form.Item name="monto" label="Monto del tramo" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} prefix="RD$" min={0.01} max={faltaPorDesembolsar} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="metodoPago" label="Forma de Pago">
                <Select onChange={val => { if (val !== 'efectivo') formTramo.setFieldsValue({ cajaDiariaId: undefined }); }}>
                  <Option value="efectivo">Efectivo</Option>
                  <Option value="transferencia">Transferencia</Option>
                  <Option value="cheque">Cheque</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate={(p, c) => p.metodoPago !== c.metodoPago}>
            {() => formTramo.getFieldValue('metodoPago') === 'efectivo' ? (
              <Form.Item
                name="cajaDiariaId"
                label="Caja de efectivo (opcional)"
                tooltip="Si se selecciona, el desembolso sale del cuadre de esa caja. Déjalo vacío si no aplica."
              >
                <Select
                  placeholder="Seleccionar caja (opcional)"
                  loading={!cajasHoy}
                  allowClear
                  notFoundContent="No hay cajas abiertas hoy"
                  options={(cajasHoy ?? []).map((c: any) => ({
                    value: c.id,
                    label: c.vendedorNombre ? `${c.vendedorNombre} — Caja #${c.id}` : `Caja #${c.id}`,
                  }))}
                />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal reestructurar (§5) — distinto de refinanciar: el MISMO préstamo,
          solo cambia el plan de las cuotas totalmente pendientes. Supervisor
          SIEMPRE + motivo obligatorio. */}
      <Modal title="Reestructurar Préstamo" open={reestructurarOpen}
        onCancel={() => { setReestructurarOpen(false); formReestructurar.resetFields(); }}
        onOk={() => formReestructurar.validateFields().then(v => reestructurar.mutate(v))}
        okText="Reestructurar" confirmLoading={reestructurar.isPending}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Solo cambia el plan de las cuotas totalmente pendientes (sin ningún pago aplicado) — el historial ya pagado no se toca." />
        <Form form={formReestructurar} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="nuevoPlazoMeses" label="Nuevo plazo (cuotas restantes)">
                <InputNumber style={{ width: '100%' }} min={1} placeholder="Deja vacío para mantener" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nuevaTasaInteresMensual" label="Nueva tasa mensual (%)">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="Deja vacío para mantener" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="nuevoMetodoAmortizacion" label="Nuevo método de amortización">
            <Select allowClear placeholder="Deja vacío para mantener">
              <Option value="frances">Francés</Option>
              <Option value="aleman">Alemán</Option>
            </Select>
          </Form.Item>
          <Form.Item name="motivo" label="Motivo" rules={[{ required: true, whitespace: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal condonar (§6) — solo mora y/o interés, NUNCA capital. Supervisor
          SIEMPRE + motivo obligatorio. */}
      <Modal title="Condonar Mora / Interés" open={condonarOpen}
        onCancel={() => { setCondonarOpen(false); formCondonar.resetFields(); }}
        onOk={() => formCondonar.validateFields().then(v => {
          if (!v.moraACondonar && !v.interesACondonar) { message.warning('Indica un monto de mora o interés a condonar'); return; }
          condonar.mutate(v);
        })}
        okText="Condonar" confirmLoading={condonar.isPending}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`Saldo de mora: ${fmt(prestamo.saldoMora)} — Saldo de interés: ${fmt(prestamo.saldoInteres)}. El capital nunca se condona.`} />
        <Form form={formCondonar} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="moraACondonar" label="Mora a condonar">
                <InputNumber style={{ width: '100%' }} prefix="RD$" min={0} max={Number(prestamo.saldoMora)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="interesACondonar" label="Interés a condonar">
                <InputNumber style={{ width: '100%' }} prefix="RD$" min={0} max={Number(prestamo.saldoInteres)} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="motivo" label="Motivo" rules={[{ required: true, whitespace: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
