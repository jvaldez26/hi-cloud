import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Button, DatePicker, Select, Input, Switch, Space, Typography,
  Table, Drawer, Grid, Dropdown, Spin, Alert, Tooltip, theme,
} from 'antd';
import {
  FilterOutlined, DownloadOutlined, ExpandAltOutlined, ShrinkOutlined,
  FileExcelOutlined, FilePdfOutlined, FileTextOutlined, RiseOutlined, FallOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  FiltrosFlujoEfectivo, filtrosFEDesdeURL, filtrosFEAURLParams,
  OPCIONES_COMPARACION_FE, OPCIONES_DETALLE_FE,
} from '../../utils/filtrosFlujoEfectivo';
import { rangoRapido } from '../../utils/filtrosEstadoResultados';
import { armarFilasFE, claveDeFilaFE, mapaMontosPorClaveFE, filtrarFilasFE, NOMBRES_BLOQUES_FE, FilaFE } from '../../utils/flujoEfectivoFilas';
import { reportesFinancierosApi, FlujoEfectivoPeriodo } from '../../api/reportesFinancieros.api';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const fmtFecha = (d?: string) => d ? dayjs(d).format('DD/MM/YYYY') : '—';

export default function FlujoEfectivoDetallado() {
  const { token } = theme.useToken();
  const screens  = useBreakpoint();
  const esMovil  = screens.md === false;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosFEDesdeURL(params), [params]);

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [search, setSearch] = useState('');
  const [bloquesAbiertos, setBloquesAbiertos] = useState<Set<string>>(
    filtros.detalle === 'detallado' ? new Set(NOMBRES_BLOQUES_FE) : new Set(),
  );

  const actualizarFiltros = (parciales: Partial<FiltrosFlujoEfectivo>) => {
    const siguiente = { ...filtros, ...parciales };
    setParams(filtrosFEAURLParams(siguiente), { replace: true });
    if (parciales.detalle) setBloquesAbiertos(parciales.detalle === 'detallado' ? new Set(NOMBRES_BLOQUES_FE) : new Set());
  };

  const toggleBloque = (nombre: string) => setBloquesAbiertos(prev => {
    const next = new Set(prev);
    next.has(nombre) ? next.delete(nombre) : next.add(nombre);
    return next;
  });

  const { data: fe, isLoading, isError } = useQuery({
    queryKey: ['flujo-efectivo-detallado', filtros.desde, filtros.hasta, filtros.comparacion],
    queryFn:  () => reportesFinancierosApi.flujoEfectivoDetallado(filtros),
  });

  const fmtMoney = (v: number | undefined) => {
    const n = v ?? 0;
    const abs = new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'DOP',
      minimumFractionDigits: filtros.redondearSinDecimales ? 0 : 2,
      maximumFractionDigits: filtros.redondearSinDecimales ? 0 : 2,
    }).format(Math.abs(n));
    return n < 0 ? `(${abs})` : abs;
  };

  const irALibroMayor = (codigo: string) => {
    navigate(`/libro-mayor?codigo=${encodeURIComponent(codigo)}&desde=${filtros.desde}&hasta=${filtros.hasta}`);
  };

  const filasBase = useMemo(() => {
    if (!fe) return [] as FilaFE[];
    const abiertos = search.trim() ? new Set(NOMBRES_BLOQUES_FE) : bloquesAbiertos;
    return armarFilasFE(fe.periodo, abiertos);
  }, [fe, bloquesAbiertos, search]);

  const filas = useMemo(() => filtrarFilasFE(filasBase, search), [filasBase, search]);

  const mapaAcumulado    = useMemo(() => fe?.acumulado ? mapaMontosPorClaveFE(fe.acumulado.periodo) : null, [fe]);
  const mapaAnioAnterior = useMemo(() => fe?.anioAnterior ? mapaMontosPorClaveFE(fe.anioAnterior.periodo) : null, [fe]);
  const mapasPorMes      = useMemo(
    () => fe?.porMes ? fe.porMes.meses.map(m => mapaMontosPorClaveFE(m.periodo)) : null,
    [fe],
  );
  const filasTotal = useMemo(() => {
    if (!fe?.porMes) return [] as FilaFE[];
    return armarFilasFE(fe.porMes.total, search.trim() ? new Set(NOMBRES_BLOQUES_FE) : bloquesAbiertos);
  }, [fe, bloquesAbiertos, search]);
  const filasTotalFiltradas = useMemo(() => filtrarFilasFE(filasTotal, search), [filasTotal, search]);

  const estiloFila = (f: FilaFE) => {
    if (f.tipo === 'resumen') return { fontWeight: 800, background: f.monto < 0 ? token.colorErrorBg : token.colorInfoBg, borderTop: `2px solid ${token.colorPrimary}` };
    if (f.tipo === 'total') return { fontWeight: 700, background: token.colorFillSecondary, borderTop: `1px solid ${token.colorBorderSecondary}` };
    if (f.tipo === 'header') return { fontWeight: 600, cursor: 'pointer', background: token.colorFillAlter };
    if (f.tipo === 'linea') return { fontWeight: 500 };
    return {};
  };

  const columnaNombre = {
    title: 'Bloque / Línea / Cuenta', dataIndex: 'nombre', key: 'nombre', fixed: 'left' as const, width: 300,
    render: (_: any, f: FilaFE) => (
      <Space size={6}>
        {f.tipo === 'header' && <Text style={{ fontSize: 10 }}>{bloquesAbiertos.has(f.bloque) ? '▼' : '▶'}</Text>}
        {f.tipo === 'cuenta' && filtros.mostrarCodigo && <Text type="secondary" style={{ fontSize: 11 }}>{f.codigo}</Text>}
        <Text
          strong={f.tipo !== 'cuenta'}
          style={{
            paddingLeft: f.tipo === 'linea' ? 16 : f.tipo === 'cuenta' || f.tipo === 'total' ? 32 : 0,
            textTransform: f.tipo === 'resumen' ? 'uppercase' : undefined,
          }}
        >
          {f.nombre}
        </Text>
      </Space>
    ),
  };

  const columnaMonto = (title: string, key: string, obtener: (f: FilaFE) => number) => ({
    title, key, align: 'right' as const, width: 160,
    render: (_: any, f: FilaFE) => (
      <Text strong={f.tipo !== 'cuenta'} style={{ fontFamily: 'monospace', color: obtener(f) < 0 ? '#dc2626' : undefined }}>
        {fmtMoney(obtener(f))}
      </Text>
    ),
  });

  const columnas = useMemo(() => {
    if (fe?.porMes) {
      const meses = fe.porMes.meses;
      return [
        columnaNombre,
        ...meses.map((m, i) => columnaMonto(dayjs(m.desde).format('MMM'), `m${m.mes}`, f => mapasPorMes?.[i]?.get(claveDeFilaFE(f)) ?? 0)),
        columnaMonto('Total', 'total', f => mapaMontosPorClaveFE(fe.porMes!.total).get(claveDeFilaFE(f)) ?? f.monto),
      ];
    }
    if (filtros.comparacion === 'mes-vs-acumulado' && fe?.acumulado) {
      return [
        columnaNombre,
        { title: `Mes (${fmtFecha(fe.desde)} – ${fmtFecha(fe.hasta)})`, children: [columnaMonto('Monto', 'monto', f => f.monto)] },
        { title: `Acumulado (${fmtFecha(fe.acumulado.desde)} – ${fmtFecha(fe.acumulado.hasta)})`, children: [
          columnaMonto('Monto', 'acumulado', f => mapaAcumulado?.get(claveDeFilaFE(f)) ?? 0),
        ] },
      ];
    }
    if (filtros.comparacion === 'anio-anterior' && fe?.anioAnterior) {
      return [
        columnaNombre,
        columnaMonto('Monto', 'monto', f => f.monto),
        columnaMonto('Año anterior', 'anterior', f => mapaAnioAnterior?.get(claveDeFilaFE(f)) ?? 0),
        columnaMonto('Diferencia', 'diferencia', f => f.monto - (mapaAnioAnterior?.get(claveDeFilaFE(f)) ?? 0)),
      ];
    }
    return [columnaNombre, columnaMonto('Monto', 'monto', f => f.monto)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fe, filtros.comparacion, filtros.mostrarCodigo, filtros.redondearSinDecimales, bloquesAbiertos, mapaAcumulado, mapaAnioAnterior, mapasPorMes]);

  const filtrosContent = (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Período rápido</Text>
        <Select
          style={{ width: '100%' }}
          placeholder="Seleccionar..."
          allowClear
          options={[
            { value: 'mes-actual',        label: 'Mes actual' },
            { value: 'trimestre-actual',  label: 'Trimestre actual' },
            { value: 'anio-actual',       label: 'Año en curso' },
            { value: 'anio-anterior',     label: 'Año anterior' },
          ]}
          onChange={(v) => v && actualizarFiltros(rangoRapido(v))}
        />
      </div>
      <Row gutter={8}>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Desde</Text>
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dayjs(filtros.desde)}
            onChange={d => d && actualizarFiltros({ desde: d.format('YYYY-MM-DD') })} />
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>Hasta</Text>
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dayjs(filtros.hasta)}
            onChange={d => d && actualizarFiltros({ hasta: d.format('YYYY-MM-DD') })} />
        </Col>
      </Row>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Rango / Comparación</Text>
        <Select style={{ width: '100%' }} value={filtros.comparacion} options={OPCIONES_COMPARACION_FE}
          onChange={v => actualizarFiltros({ comparacion: v })} />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Detalle</Text>
        <Select style={{ width: '100%' }} value={filtros.detalle} options={OPCIONES_DETALLE_FE}
          onChange={v => actualizarFiltros({ detalle: v })} />
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código de cuenta</Text></Space>
        <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
      </Space>
    </Space>
  );

  const exportOptions = {
    items: [
      { key: 'excel', label: 'Excel (.xlsx)', icon: <FileExcelOutlined /> },
      { key: 'csv',   label: 'CSV', icon: <FileTextOutlined /> },
      { key: 'pdf',   label: 'PDF', icon: <FilePdfOutlined /> },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'excel') reportesFinancierosApi.descargarFlujoEfectivoExcel(filtros);
      if (key === 'csv')   reportesFinancierosApi.descargarFlujoEfectivoCsv(filtros);
      if (key === 'pdf')   reportesFinancierosApi.descargarFlujoEfectivoPdf(filtros);
    },
  };

  const periodo: FlujoEfectivoPeriodo | undefined = fe?.porMes ? fe.porMes.total : fe?.periodo;
  const rangoBanner = fe?.porMes
    ? { desde: `${fe.porMes.anio}-01-01`, hasta: `${fe.porMes.anio}-12-31` }
    : { desde: fe?.desde, hasta: fe?.hasta };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          {esMovil ? (
            <Button icon={<FilterOutlined />} onClick={() => setFiltrosAbiertos(true)}>Filtros</Button>
          ) : (
            <Button icon={<FilterOutlined />} onClick={() => setFiltrosAbiertos(v => !v)}>
              {filtrosAbiertos ? 'Ocultar filtros' : 'Mostrar filtros'}
            </Button>
          )}
          <Input.Search
            placeholder="Buscar línea o cuenta por código o nombre..."
            allowClear style={{ width: 260 }}
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <Tooltip title="Expandir todos los bloques">
            <Button icon={<ExpandAltOutlined />} onClick={() => setBloquesAbiertos(new Set(NOMBRES_BLOQUES_FE))} />
          </Tooltip>
          <Tooltip title="Colapsar todos los bloques">
            <Button icon={<ShrinkOutlined />} onClick={() => setBloquesAbiertos(new Set())} />
          </Tooltip>
        </Space>
        <Dropdown menu={exportOptions}>
          <Button icon={<DownloadOutlined />} type="primary">Exportar</Button>
        </Dropdown>
      </div>

      {!esMovil && filtrosAbiertos && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
          <Row gutter={[16, 12]}>
            <Col xs={24} sm={8} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Período rápido</Text>
              <Select style={{ width: '100%' }} placeholder="..." allowClear
                options={[
                  { value: 'mes-actual', label: 'Mes actual' },
                  { value: 'trimestre-actual', label: 'Trimestre actual' },
                  { value: 'anio-actual', label: 'Año en curso' },
                  { value: 'anio-anterior', label: 'Año anterior' },
                ]}
                onChange={(v) => v && actualizarFiltros(rangoRapido(v))} /></Col>
            <Col xs={12} sm={8} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Desde</Text>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dayjs(filtros.desde)}
                onChange={d => d && actualizarFiltros({ desde: d.format('YYYY-MM-DD') })} /></Col>
            <Col xs={12} sm={8} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Hasta</Text>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dayjs(filtros.hasta)}
                onChange={d => d && actualizarFiltros({ hasta: d.format('YYYY-MM-DD') })} /></Col>
            <Col xs={24} sm={12} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Rango / Comparación</Text>
              <Select style={{ width: '100%' }} value={filtros.comparacion} options={OPCIONES_COMPARACION_FE}
                onChange={v => actualizarFiltros({ comparacion: v })} /></Col>
            <Col xs={24} sm={12} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Detalle</Text>
              <Select style={{ width: '100%' }} value={filtros.detalle} options={OPCIONES_DETALLE_FE}
                onChange={v => actualizarFiltros({ detalle: v })} /></Col>
            <Col xs={24} md={24}>
              <Space size={20} wrap>
                <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código</Text></Space>
                <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <Drawer title="Filtros" placement="bottom" height="auto" open={esMovil && filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)}>
        {filtrosContent}
      </Drawer>

      <Spin spinning={isLoading}>
        {isError && <Alert type="error" showIcon message="No se pudo cargar el Estado de Flujo de Efectivo." style={{ marginBottom: 16 }} />}
        {fe && periodo && (
          <>
            {!periodo.cuadrado && (
              <Alert
                type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
                message="El flujo de efectivo NO cuadra"
                description={`Efectivo al Inicio + Cambio Neto debería dar Efectivo al Final. Diferencia: ${fmtMoney(periodo.diferenciaCuadre)}. Hay una cuenta de flujo mal clasificada o falta una — no descargues este reporte hasta corregirlo.`}
              />
            )}
            <div style={{
              background: periodo.cambioNetoEfectivo >= 0 ? '#f0fdf4' : '#fef2f2',
              border: `2px solid ${periodo.cambioNetoEfectivo >= 0 ? '#86efac' : '#fca5a5'}`,
              borderRadius: 12, padding: '12px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              {periodo.cambioNetoEfectivo >= 0
                ? <RiseOutlined style={{ color: '#059669', fontSize: 20 }} />
                : <FallOutlined style={{ color: '#dc2626', fontSize: 20 }} />}
              <div>
                <Text strong style={{ color: '#111827' }}>Del {fmtFecha(rangoBanner.desde)} al {fmtFecha(rangoBanner.hasta)}</Text>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Cambio Neto en el Efectivo:{' '}
                  <Text strong style={{ color: periodo.cambioNetoEfectivo >= 0 ? '#059669' : '#dc2626' }}>
                    {fmtMoney(periodo.cambioNetoEfectivo)}
                  </Text>
                  {' — '}Efectivo al Final: <Text strong style={{ color: '#111827' }}>{fmtMoney(periodo.efectivoFin)}</Text>
                </div>
              </div>
            </div>

            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Table<FilaFE>
                size="small"
                rowKey="key"
                columns={columnas as any}
                dataSource={fe.porMes ? filasTotalFiltradas : filas}
                pagination={false}
                scroll={{ x: 'max-content' }}
                onRow={(record) => ({
                  onClick: () => {
                    if (record.tipo === 'header') { toggleBloque(record.bloque); return; }
                    if (record.tipo === 'cuenta' && record.codigo) irALibroMayor(record.codigo);
                  },
                  style: { ...estiloFila(record), cursor: record.tipo === 'header' || record.tipo === 'cuenta' ? 'pointer' : undefined },
                })}
                locale={{ emptyText: 'Sin movimientos para mostrar con estos filtros' }}
              />
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
}
