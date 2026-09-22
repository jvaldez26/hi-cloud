import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Button, DatePicker, Select, Input, Switch, Space, Typography,
  Table, Tag, Drawer, Grid, Dropdown, Spin, Alert, Tooltip, theme,
} from 'antd';
import {
  FilterOutlined, DownloadOutlined, ExpandAltOutlined, ShrinkOutlined,
  FileExcelOutlined, FilePdfOutlined, FileTextOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  FiltrosEstadoResultados, filtrosERDesdeURL, filtrosERAURLParams, rangoRapido,
  OPCIONES_COMPARACION, OPCIONES_DETALLE,
} from '../../utils/filtrosEstadoResultados';
import { armarFilasER, claveDeFila, mapaMontosPorClave, filtrarFilasER, NOMBRES_BLOQUES, FilaER } from '../../utils/estadoResultadosFilas';
import { reportesFinancierosApi, EstadoResultadosPeriodo } from '../../api/reportesFinancieros.api';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const fmtFecha = (d?: string) => d ? dayjs(d).format('DD/MM/YYYY') : '—';

export default function EstadoResultadosDetallado() {
  const { token } = theme.useToken();
  const screens  = useBreakpoint();
  const esMovil  = screens.md === false;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosERDesdeURL(params), [params]);

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [search, setSearch] = useState('');
  const [bloquesAbiertos, setBloquesAbiertos] = useState<Set<string>>(
    filtros.detalle === 'detallado' ? new Set(NOMBRES_BLOQUES) : new Set(),
  );

  const actualizarFiltros = (parciales: Partial<FiltrosEstadoResultados>) => {
    const siguiente = { ...filtros, ...parciales };
    setParams(filtrosERAURLParams(siguiente), { replace: true });
    if (parciales.detalle) setBloquesAbiertos(parciales.detalle === 'detallado' ? new Set(NOMBRES_BLOQUES) : new Set());
  };

  const toggleBloque = (nombre: string) => setBloquesAbiertos(prev => {
    const next = new Set(prev);
    next.has(nombre) ? next.delete(nombre) : next.add(nombre);
    return next;
  });

  const { data: er, isLoading, isError } = useQuery({
    queryKey: ['estado-resultados-detallado', filtros.desde, filtros.hasta, filtros.comparacion, filtros.ocultarCuentasEnCero],
    queryFn:  () => reportesFinancierosApi.estadoResultadosDetallado(filtros),
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

  // Filas base: con término de búsqueda siempre se arman TODAS abiertas (para
  // poder encontrar una cuenta aunque su bloque esté colapsado en la vista);
  // sin búsqueda, se respeta bloquesAbiertos.
  const filasBase = useMemo(() => {
    if (!er) return [] as FilaER[];
    const abiertos = search.trim() ? new Set(NOMBRES_BLOQUES) : bloquesAbiertos;
    return armarFilasER(er.periodo, abiertos);
  }, [er, bloquesAbiertos, search]);

  const filas = useMemo(() => filtrarFilasER(filasBase, search), [filasBase, search]);

  const mapaAcumulado    = useMemo(() => er?.acumulado ? mapaMontosPorClave(er.acumulado.periodo) : null, [er]);
  const mapaAnioAnterior = useMemo(() => er?.anioAnterior ? mapaMontosPorClave(er.anioAnterior.periodo) : null, [er]);
  const mapasPorMes      = useMemo(
    () => er?.porMes ? er.porMes.meses.map(m => mapaMontosPorClave(m.periodo)) : null,
    [er],
  );
  const filasTotal = useMemo(() => {
    if (!er?.porMes) return [] as FilaER[];
    return armarFilasER(er.porMes.total, search.trim() ? new Set(NOMBRES_BLOQUES) : bloquesAbiertos);
  }, [er, bloquesAbiertos, search]);
  const filasTotalFiltradas = useMemo(() => filtrarFilasER(filasTotal, search), [filasTotal, search]);

  const estiloFila = (f: FilaER) => {
    if (f.tipo === 'calculada') return { fontWeight: 800, background: f.monto < 0 ? token.colorErrorBg : token.colorInfoBg, borderTop: `2px solid ${token.colorPrimary}` };
    if (f.tipo === 'total') return { fontWeight: 700, background: token.colorFillSecondary, borderTop: `1px solid ${token.colorBorderSecondary}` };
    if (f.tipo === 'header') return { fontWeight: 600, cursor: 'pointer', background: token.colorFillAlter };
    return {};
  };

  const columnaNombre = {
    title: 'Bloque / Cuenta', dataIndex: 'nombre', key: 'nombre', fixed: 'left' as const, width: 260,
    render: (_: any, f: FilaER) => (
      <Space size={6}>
        {f.tipo === 'header' && <Text style={{ fontSize: 10 }}>{bloquesAbiertos.has(f.bloque) ? '▼' : '▶'}</Text>}
        {f.tipo === 'cuenta' && filtros.mostrarCodigo && <Text type="secondary" style={{ fontSize: 11 }}>{f.codigo}</Text>}
        <Text
          strong={f.tipo !== 'cuenta'}
          style={{ paddingLeft: f.tipo === 'cuenta' || f.tipo === 'total' ? 16 : 0, textTransform: f.tipo === 'calculada' ? 'uppercase' : undefined }}
        >
          {f.nombre}
        </Text>
      </Space>
    ),
  };

  const columnaMonto = (title: string, key: string, obtener: (f: FilaER) => number) => ({
    title, key, align: 'right' as const, width: 150,
    render: (_: any, f: FilaER) => (
      <Text strong={f.tipo !== 'cuenta'} style={{ fontFamily: 'monospace', color: obtener(f) < 0 ? '#dc2626' : undefined }}>
        {fmtMoney(obtener(f))}
      </Text>
    ),
  });

  const columnaPct = (title: string, obtener: (f: FilaER) => number | null) => ({
    title, key: `${title}`, align: 'right' as const, width: 90,
    render: (_: any, f: FilaER) => {
      const v = obtener(f);
      return <Text type="secondary">{v === null ? '—' : `${v}%`}</Text>;
    },
  });

  const columnas = useMemo(() => {
    if (er?.porMes) {
      const meses = er.porMes.meses;
      return [
        columnaNombre,
        ...meses.map((m, i) => columnaMonto(dayjs(m.desde).format('MMM'), `m${m.mes}`, f => mapasPorMes?.[i]?.get(claveDeFila(f)) ?? 0)),
        columnaMonto('Total', 'total', f => mapaMontosPorClave(er.porMes!.total).get(claveDeFila(f)) ?? f.monto),
      ];
    }
    if (filtros.comparacion === 'mes-vs-acumulado' && er?.acumulado) {
      return [
        columnaNombre,
        { title: `Mes (${fmtFecha(er.desde)} – ${fmtFecha(er.hasta)})`, children: [
          columnaMonto('Monto', 'monto', f => f.monto),
          ...(filtros.mostrarPorcentajes ? [columnaPct('% Ingresos', f => f.porcentajeIngresos)] : []),
        ] },
        { title: `Acumulado (${fmtFecha(er.acumulado.desde)} – ${fmtFecha(er.acumulado.hasta)})`, children: [
          columnaMonto('Monto', 'acumulado', f => mapaAcumulado?.get(claveDeFila(f)) ?? 0),
        ] },
      ];
    }
    if (filtros.comparacion === 'anio-anterior' && er?.anioAnterior) {
      return [
        columnaNombre,
        columnaMonto('Monto', 'monto', f => f.monto),
        ...(filtros.mostrarPorcentajes ? [columnaPct('% Ingresos', f => f.porcentajeIngresos)] : []),
        columnaMonto('Año anterior', 'anterior', f => mapaAnioAnterior?.get(claveDeFila(f)) ?? 0),
        columnaMonto('Diferencia', 'diferencia', f => f.monto - (mapaAnioAnterior?.get(claveDeFila(f)) ?? 0)),
      ];
    }
    return [
      columnaNombre,
      columnaMonto('Monto', 'monto', f => f.monto),
      ...(filtros.mostrarPorcentajes ? [
        columnaPct('% Ingresos', f => f.porcentajeIngresos),
        columnaPct('% Margen', f => f.porcentajeMargen),
      ] : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [er, filtros.comparacion, filtros.mostrarCodigo, filtros.mostrarPorcentajes, filtros.redondearSinDecimales, bloquesAbiertos, mapaAcumulado, mapaAnioAnterior, mapasPorMes]);

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
        <Text type="secondary" style={{ fontSize: 12 }}>Comparación</Text>
        <Select style={{ width: '100%' }} value={filtros.comparacion} options={OPCIONES_COMPARACION}
          onChange={v => actualizarFiltros({ comparacion: v })} />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Detalle</Text>
        <Select style={{ width: '100%' }} value={filtros.detalle} options={OPCIONES_DETALLE}
          onChange={v => actualizarFiltros({ detalle: v })} />
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código de cuenta</Text></Space>
        <Space><Switch size="small" checked={filtros.ocultarCuentasEnCero} onChange={v => actualizarFiltros({ ocultarCuentasEnCero: v })} /><Text>Ocultar cuentas en cero</Text></Space>
        <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
        <Space><Switch size="small" checked={filtros.mostrarPorcentajes} onChange={v => actualizarFiltros({ mostrarPorcentajes: v })} /><Text>Mostrar columnas de %</Text></Space>
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
      if (key === 'excel') reportesFinancierosApi.descargarEstadoResultadosExcel(filtros);
      if (key === 'csv')   reportesFinancierosApi.descargarEstadoResultadosCsv(filtros);
      if (key === 'pdf')   reportesFinancierosApi.descargarEstadoResultadosPdf(filtros);
    },
  };

  // En "Por mes" el banner y el resumen muestran el AÑO completo (mismo dato
  // que la columna Total de la tabla), no el rango desde/hasta del filtro —
  // ese rango solo decide qué año mostrar (por su "hasta"), la tabla siempre
  // es de 12 meses completos.
  const periodo: EstadoResultadosPeriodo | undefined = er?.porMes ? er.porMes.total : er?.periodo;
  const rangoBanner = er?.porMes
    ? { desde: `${er.porMes.anio}-01-01`, hasta: `${er.porMes.anio}-12-31` }
    : { desde: er?.desde, hasta: er?.hasta };

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
            placeholder="Buscar cuenta por código o nombre..."
            allowClear style={{ width: 260 }}
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <Tooltip title="Expandir todos los bloques">
            <Button icon={<ExpandAltOutlined />} onClick={() => setBloquesAbiertos(new Set(NOMBRES_BLOQUES))} />
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
            <Col xs={24} sm={12} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Comparación</Text>
              <Select style={{ width: '100%' }} value={filtros.comparacion} options={OPCIONES_COMPARACION}
                onChange={v => actualizarFiltros({ comparacion: v })} /></Col>
            <Col xs={24} sm={12} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Detalle</Text>
              <Select style={{ width: '100%' }} value={filtros.detalle} options={OPCIONES_DETALLE}
                onChange={v => actualizarFiltros({ detalle: v })} /></Col>
            <Col xs={24} md={24}>
              <Space size={20} wrap>
                <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código</Text></Space>
                <Space><Switch size="small" checked={filtros.ocultarCuentasEnCero} onChange={v => actualizarFiltros({ ocultarCuentasEnCero: v })} /><Text>Ocultar cuentas en cero</Text></Space>
                <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
                <Space><Switch size="small" checked={filtros.mostrarPorcentajes} onChange={v => actualizarFiltros({ mostrarPorcentajes: v })} /><Text>Mostrar % de columnas</Text></Space>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <Drawer title="Filtros" placement="bottom" height="auto" open={esMovil && filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)}>
        {filtrosContent}
      </Drawer>

      <Spin spinning={isLoading}>
        {isError && <Alert type="error" showIcon message="No se pudo cargar el Estado de Resultados." style={{ marginBottom: 16 }} />}
        {er && periodo && (
          <>
            <div style={{
              background: periodo.gananciaPerdidaDelPeriodo.monto >= 0 ? '#f0fdf4' : '#fef2f2',
              border: `2px solid ${periodo.gananciaPerdidaDelPeriodo.monto >= 0 ? '#86efac' : '#fca5a5'}`,
              borderRadius: 12, padding: '12px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              {periodo.gananciaPerdidaDelPeriodo.monto >= 0
                ? <RiseOutlined style={{ color: '#059669', fontSize: 20 }} />
                : <FallOutlined style={{ color: '#dc2626', fontSize: 20 }} />}
              <div>
                <Text strong style={{ color: '#111827' }}>Del {fmtFecha(rangoBanner.desde)} al {fmtFecha(rangoBanner.hasta)}</Text>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Ganancia (Pérdida) del Período:{' '}
                  <Text strong style={{ color: periodo.gananciaPerdidaDelPeriodo.monto >= 0 ? '#059669' : '#dc2626' }}>
                    {fmtMoney(periodo.gananciaPerdidaDelPeriodo.monto)}
                  </Text>
                  {filtros.mostrarPorcentajes && periodo.gananciaPerdidaDelPeriodo.porcentajeMargen !== null && (
                    <Tag color={periodo.gananciaPerdidaDelPeriodo.monto >= 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                      Margen: {periodo.gananciaPerdidaDelPeriodo.porcentajeMargen}%
                    </Tag>
                  )}
                </div>
              </div>
            </div>

            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Table<FilaER>
                size="small"
                rowKey="key"
                columns={columnas as any}
                dataSource={er.porMes ? filasTotalFiltradas : filas}
                pagination={false}
                scroll={{ x: 'max-content' }}
                onRow={(record) => ({
                  onClick: () => {
                    if (record.tipo === 'header') { toggleBloque(record.bloque); return; }
                    if (record.tipo === 'cuenta' && record.codigo) irALibroMayor(record.codigo);
                  },
                  style: { ...estiloFila(record), cursor: record.tipo === 'header' || record.tipo === 'cuenta' ? 'pointer' : undefined },
                })}
                locale={{ emptyText: 'Sin cuentas para mostrar con estos filtros' }}
              />
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
}
