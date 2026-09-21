import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Button, DatePicker, Select, Input, Switch, Space, Typography,
  Table, Tag, Drawer, Grid, Dropdown, Spin, Alert, Tooltip,
} from 'antd';
import {
  FilterOutlined, DownloadOutlined, CheckCircleOutlined, WarningOutlined,
  ExpandAltOutlined, ShrinkOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  FiltrosBalanceGeneral, filtrosDesdeURL, filtrosAURLParams,
  OPCIONES_COMPARAR_CON, OPCIONES_NIVEL_DETALLE,
} from '../../utils/filtrosBalanceGeneral';
import { reportesFinancierosApi, NodoBalanceGeneral } from '../../api/reportesFinancieros.api';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type NodoDisplay = NodoBalanceGeneral & { esCalculada?: boolean; hijos: NodoDisplay[] };

const fmtFecha = (d?: string) => d ? dayjs(d).format('DD/MM/YYYY') : '—';

function coincide(n: NodoBalanceGeneral, term: string): boolean {
  const t = term.toLowerCase();
  return n.codigo.toLowerCase().includes(t) || n.nombre.toLowerCase().includes(t);
}

function filtrarArbol(nodos: NodoDisplay[], term: string): NodoDisplay[] {
  if (!term.trim()) return nodos;
  const out: NodoDisplay[] = [];
  for (const n of nodos) {
    if (coincide(n, term)) { out.push(n); continue; }
    const hijosFiltrados = filtrarArbol(n.hijos, term);
    if (hijosFiltrados.length) out.push({ ...n, hijos: hijosFiltrados });
  }
  return out;
}

function todosLosCodigos(nodos: NodoDisplay[]): string[] {
  const out: string[] = [];
  for (const n of nodos) { out.push(n.codigo); out.push(...todosLosCodigos(n.hijos)); }
  return out;
}

export default function BalanceGeneralDetallado() {
  const screens  = useBreakpoint();
  const esMovil  = screens.md === false;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDesdeURL(params), [params]);

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [expandInicializado, setExpandInicializado] = useState(false);

  const actualizarFiltros = (parciales: Partial<FiltrosBalanceGeneral>) => {
    setParams(filtrosAURLParams({ ...filtros, ...parciales }), { replace: true });
  };

  const { data: bg, isLoading, isError } = useQuery({
    queryKey: ['balance-general-detallado', filtros],
    queryFn:  () => reportesFinancierosApi.balanceGeneralDetallado(filtros),
  });

  // Al llegar datos nuevos (o cambiar de fecha/nivel), expandir todo por
  // defecto una vez — con nivel 2 por defecto el árbol es poco profundo, así
  // que partir expandido es lo más útil.
  useEffect(() => {
    if (bg && !expandInicializado) {
      const todos = [...todosLosCodigos((bg.activo.nodos as NodoDisplay[]) ?? []),
        ...todosLosCodigos((bg.pasivo.nodos as NodoDisplay[]) ?? []),
        ...todosLosCodigos((bg.patrimonio.nodos as NodoDisplay[]) ?? [])];
      setExpandedKeys(todos);
      setExpandInicializado(true);
    }
  }, [bg, expandInicializado]);

  const conComparativo = filtros.compararCon !== 'ninguno';

  const fmtMoney = (v: number | undefined) => {
    const n = v ?? 0;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency', currency: 'DOP',
      minimumFractionDigits: filtros.redondearSinDecimales ? 0 : 2,
      maximumFractionDigits: filtros.redondearSinDecimales ? 0 : 2,
    }).format(n);
  };

  const irALibroMayor = (codigo: string) => {
    navigate(`/libro-mayor?codigo=${encodeURIComponent(codigo)}&hasta=${filtros.fechaCorte}`);
  };

  const columnas = useMemo(() => {
    const cols: any[] = [
      {
        title: 'Cuenta', dataIndex: 'nombre', key: 'nombre',
        render: (_: any, r: NodoDisplay) => (
          <Space size={6}>
            {filtros.mostrarCodigo && r.codigo && <Text type="secondary" style={{ fontSize: 11 }}>{r.codigo}</Text>}
            <Text strong={r.esCuentaGrupo} italic={r.esCalculada}>{r.nombre}</Text>
            {r.esCalculada && <Tag color="blue" style={{ fontSize: 10 }}>Calculado</Tag>}
          </Space>
        ),
      },
      {
        title: 'Monto', dataIndex: 'monto', key: 'monto', align: 'right' as const, width: 150,
        render: (v: number) => <Text strong style={{ fontFamily: 'monospace' }}>{fmtMoney(v)}</Text>,
      },
    ];
    if (filtros.mostrarPorcentajeVertical) {
      cols.push({
        title: '% Vert.', dataIndex: 'porcentajeVertical', key: 'pct', align: 'right' as const, width: 80,
        render: (v: number) => <Text type="secondary">{v}%</Text>,
      });
    }
    if (conComparativo) {
      cols.push(
        { title: 'Comparado', dataIndex: 'comparado', key: 'comparado', align: 'right' as const, width: 140,
          render: (v?: number) => fmtMoney(v ?? 0) },
        { title: 'Diferencia', dataIndex: 'diferencia', key: 'diferencia', align: 'right' as const, width: 140,
          render: (v?: number) => (
            <Text style={{ color: (v ?? 0) >= 0 ? '#059669' : '#dc2626' }}>{fmtMoney(v ?? 0)}</Text>
          ) },
        { title: '%', dataIndex: 'diferenciaPct', key: 'diferenciaPct', align: 'right' as const, width: 80,
          render: (v: number | null | undefined) => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}%` },
      );
    }
    return cols;
  }, [filtros.mostrarCodigo, filtros.mostrarPorcentajeVertical, filtros.redondearSinDecimales, conComparativo]);

  const renderSeccion = (titulo: string, color: string, seccion: any, extra?: NodoDisplay[]) => {
    const nodos = filtrarArbol([...(seccion.nodos as NodoDisplay[]), ...(extra ?? [])], search);
    return (
      <Card
        bordered={false}
        style={{ borderRadius: 12, border: `2px solid ${color}`, marginBottom: 16 }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>{titulo}</Text>
            <Text strong style={{ fontFamily: 'monospace' }}>{fmtMoney(seccion.total)}</Text>
          </div>
        }
      >
        <Table<NodoDisplay>
          size="small"
          rowKey="codigo"
          childrenColumnName="hijos"
          columns={columnas}
          dataSource={nodos}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
          }}
          onRow={(record) => ({
            onClick: () => { if (!record.esCuentaGrupo && !record.esCalculada && record.codigo) irALibroMayor(record.codigo); },
            style: (!record.esCuentaGrupo && !record.esCalculada) ? { cursor: 'pointer' } : undefined,
          })}
          locale={{ emptyText: 'Sin cuentas para mostrar con estos filtros' }}
        />
      </Card>
    );
  };

  const calculadasPatrimonio: NodoDisplay[] = bg ? [
    {
      codigo: '', nombre: 'Resultado del ejercicio', nivel: 0, tipo: 'patrimonio', esCuentaGrupo: false, esCalculada: true,
      monto: bg.patrimonio.calculadas.resultadoDelEjercicio.monto,
      porcentajeVertical: bg.patrimonio.total !== 0 ? +((bg.patrimonio.calculadas.resultadoDelEjercicio.monto / bg.patrimonio.total) * 100).toFixed(1) : 0,
      comparado: bg.patrimonio.calculadas.resultadoDelEjercicio.comparado,
      hijos: [],
    },
    {
      codigo: '', nombre: 'Resultados acumulados', nivel: 0, tipo: 'patrimonio', esCuentaGrupo: false, esCalculada: true,
      monto: bg.patrimonio.calculadas.resultadosAcumulados.monto,
      porcentajeVertical: bg.patrimonio.total !== 0 ? +((bg.patrimonio.calculadas.resultadosAcumulados.monto / bg.patrimonio.total) * 100).toFixed(1) : 0,
      comparado: bg.patrimonio.calculadas.resultadosAcumulados.comparado,
      hijos: [],
    },
  ] : [];

  const filtrosContent = (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Fecha de corte</Text>
        <DatePicker
          style={{ width: '100%' }} format="DD/MM/YYYY"
          value={dayjs(filtros.fechaCorte)}
          onChange={d => d && actualizarFiltros({ fechaCorte: d.format('YYYY-MM-DD') })}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Comparar con</Text>
        <Select
          style={{ width: '100%' }}
          value={filtros.compararCon}
          options={OPCIONES_COMPARAR_CON}
          onChange={v => actualizarFiltros({ compararCon: v })}
        />
      </div>
      {filtros.compararCon === 'fecha-manual' && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Fecha de comparación</Text>
          <DatePicker
            style={{ width: '100%' }} format="DD/MM/YYYY"
            value={filtros.fechaComparacion ? dayjs(filtros.fechaComparacion) : undefined}
            onChange={d => actualizarFiltros({ fechaComparacion: d ? d.format('YYYY-MM-DD') : undefined })}
          />
        </div>
      )}
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>Nivel de detalle</Text>
        <Select
          style={{ width: '100%' }}
          value={filtros.nivelDetalle}
          options={OPCIONES_NIVEL_DETALLE}
          onChange={v => actualizarFiltros({ nivelDetalle: v })}
        />
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código de cuenta</Text></Space>
        <Space><Switch size="small" checked={filtros.ocultarCuentasEnCero} onChange={v => actualizarFiltros({ ocultarCuentasEnCero: v })} /><Text>Ocultar cuentas en cero</Text></Space>
        <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
        <Space><Switch size="small" checked={filtros.mostrarPorcentajeVertical} onChange={v => actualizarFiltros({ mostrarPorcentajeVertical: v })} /><Text>Mostrar % vertical</Text></Space>
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
      if (key === 'excel') reportesFinancierosApi.descargarBalanceGeneralExcel(filtros);
      if (key === 'csv')   reportesFinancierosApi.descargarBalanceGeneralCsv(filtros);
      if (key === 'pdf')   reportesFinancierosApi.descargarBalanceGeneralPdf(filtros);
    },
  };

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
          <Tooltip title="Expandir todo">
            <Button icon={<ExpandAltOutlined />} onClick={() => bg && setExpandedKeys([
              ...todosLosCodigos(bg.activo.nodos as NodoDisplay[]),
              ...todosLosCodigos(bg.pasivo.nodos as NodoDisplay[]),
              ...todosLosCodigos(bg.patrimonio.nodos as NodoDisplay[]),
            ])} />
          </Tooltip>
          <Tooltip title="Colapsar todo">
            <Button icon={<ShrinkOutlined />} onClick={() => setExpandedKeys([])} />
          </Tooltip>
        </Space>
        <Dropdown menu={exportOptions}>
          <Button icon={<DownloadOutlined />} type="primary">Exportar</Button>
        </Dropdown>
      </div>

      {!esMovil && filtrosAbiertos && (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
          <Row gutter={[16, 12]}>
            <Col xs={24} sm={8} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Fecha de corte</Text>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dayjs(filtros.fechaCorte)}
                onChange={d => d && actualizarFiltros({ fechaCorte: d.format('YYYY-MM-DD') })} /></Col>
            <Col xs={24} sm={8} md={6}><Text type="secondary" style={{ fontSize: 12 }}>Comparar con</Text>
              <Select style={{ width: '100%' }} value={filtros.compararCon} options={OPCIONES_COMPARAR_CON}
                onChange={v => actualizarFiltros({ compararCon: v })} /></Col>
            {filtros.compararCon === 'fecha-manual' && (
              <Col xs={24} sm={8} md={5}><Text type="secondary" style={{ fontSize: 12 }}>Fecha de comparación</Text>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY"
                  value={filtros.fechaComparacion ? dayjs(filtros.fechaComparacion) : undefined}
                  onChange={d => actualizarFiltros({ fechaComparacion: d ? d.format('YYYY-MM-DD') : undefined })} /></Col>
            )}
            <Col xs={24} sm={8} md={4}><Text type="secondary" style={{ fontSize: 12 }}>Nivel de detalle</Text>
              <Select style={{ width: '100%' }} value={filtros.nivelDetalle} options={OPCIONES_NIVEL_DETALLE}
                onChange={v => actualizarFiltros({ nivelDetalle: v })} /></Col>
            <Col xs={24} md={24}>
              <Space size={20} wrap>
                <Space><Switch size="small" checked={filtros.mostrarCodigo} onChange={v => actualizarFiltros({ mostrarCodigo: v })} /><Text>Mostrar código</Text></Space>
                <Space><Switch size="small" checked={filtros.ocultarCuentasEnCero} onChange={v => actualizarFiltros({ ocultarCuentasEnCero: v })} /><Text>Ocultar cuentas en cero</Text></Space>
                <Space><Switch size="small" checked={filtros.redondearSinDecimales} onChange={v => actualizarFiltros({ redondearSinDecimales: v })} /><Text>Redondear sin decimales</Text></Space>
                <Space><Switch size="small" checked={filtros.mostrarPorcentajeVertical} onChange={v => actualizarFiltros({ mostrarPorcentajeVertical: v })} /><Text>Mostrar % vertical</Text></Space>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <Drawer title="Filtros" placement="bottom" height="auto" open={esMovil && filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)}>
        {filtrosContent}
      </Drawer>

      <Spin spinning={isLoading}>
        {isError && <Alert type="error" showIcon message="No se pudo cargar el Balance General." style={{ marginBottom: 16 }} />}
        {bg && (
          <>
            <div style={{
              background: bg.totales.cuadrado ? '#f0fdf4' : '#fff7ed',
              border: `2px solid ${bg.totales.cuadrado ? '#86efac' : '#fcd34d'}`,
              borderRadius: 12, padding: '12px 20px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              {bg.totales.cuadrado
                ? <CheckCircleOutlined style={{ color: '#059669', fontSize: 20 }} />
                : <WarningOutlined style={{ color: '#d97706', fontSize: 20 }} />}
              <div>
                <Text strong>Ecuación Contable — Fecha de Corte: {fmtFecha(bg.fechaCorte)}</Text>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Activos ({fmtMoney(bg.totales.activos)}) = Pasivos + Patrimonio ({fmtMoney(bg.totales.pasivosPatrimonio)})
                  {bg.totales.cuadrado
                    ? <Tag color="green" style={{ marginLeft: 8 }}>✓ Cuadrado</Tag>
                    : <Tag color="orange" style={{ marginLeft: 8 }}>Diferencia: {fmtMoney(Math.abs(bg.totales.ecuacion))}</Tag>}
                </div>
                {bg.diferenciaAsientosDescuadrados.cantidad > 0 && (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                    ⚠ {bg.diferenciaAsientosDescuadrados.cantidad} asiento(s) descuadrado(s) — diferencia de {fmtMoney(bg.diferenciaAsientosDescuadrados.total)} (no se absorbe en la ecuación)
                  </div>
                )}
              </div>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                {renderSeccion('ACTIVO', '#bfdbfe', bg.activo)}
              </Col>
              <Col xs={24} md={12}>
                {renderSeccion('PASIVO', '#fca5a5', bg.pasivo)}
                {renderSeccion('PATRIMONIO', '#86efac', bg.patrimonio, calculadasPatrimonio)}
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </div>
  );
}
