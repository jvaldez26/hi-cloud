import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Input, Select, Space, Typography,
  InputNumber, Tag, Tooltip, Divider, Badge, Empty, Slider,
  Checkbox, Switch, message, theme,
} from 'antd';
import {
  PrinterOutlined, QrcodeOutlined, SearchOutlined, PlusOutlined,
  MinusOutlined, DeleteOutlined, BarcodeOutlined, FileTextOutlined,
  SettingOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { QRCode } from 'antd';
import JsBarcode from 'jsbarcode';
import { productosApi } from '../../api/productos.api';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ProductoEtiqueta {
  id:           number;
  codigo:       string;
  nombre:       string;
  precio:       number;
  porcentajeIva: number;
  unidadMedida: string;
  categoria?:   string;
  imagenUrl?:   string;
  cantidad:     number;
}

type PlantillaId = 'mini' | 'estandar' | 'bodega' | 'precio';

type TipoCodigo = 'qr' | 'barcode';

interface ConfigEtiqueta {
  mostrarPrecio:    boolean;
  mostrarCodigo:    boolean;
  mostrarCategoria: boolean;
  mostrarEmpresa:   boolean;
  mostrarQR:        boolean;
  tipoCodigo:       TipoCodigo;
  precioConIva:     boolean;
  nombreEmpresa:    string;
  colorFondo:       string;
  colorTexto:       string;
}

const PLANTILLAS: Record<PlantillaId, {
  nombre: string; ancho: number; alto: number;
  cols: number; desc: string; mmW: number; mmH: number;
}> = {
  mini:     { nombre: 'Mini',      ancho: 151, alto:  96, cols: 4, desc: '40×25mm — Artículos pequeños',  mmW: 40,  mmH: 25 },
  estandar: { nombre: 'Estándar',  ancho: 227, alto: 151, cols: 3, desc: '60×40mm — Uso general',          mmW: 60,  mmH: 40 },
  bodega:   { nombre: 'Bodega',    ancho: 378, alto: 189, cols: 2, desc: '100×50mm — Almacén e inventario', mmW: 100, mmH: 50 },
  precio:   { nombre: 'Precio',    ancho: 189, alto: 113, cols: 3, desc: '50×30mm — Etiqueta de precio',   mmW: 50,  mmH: 30 },
};

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

// ── Canvas de barras a 3× para impresión térmica sin antialiasing ─────────────

function BarcodeCanvas({
  valor, barHeight, bgColor, maxWidthCss,
}: {
  valor:        string;
  barHeight:    number;
  bgColor:      string;
  maxWidthCss?: number; // ancho máximo CSS; si el canvas natural lo supera, se comprime con pixelated
}) {
  const ref   = useRef<HTMLCanvasElement>(null);
  const SCALE = 3; // 3 canvas-px por módulo → barras densas, sin interpolación

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      JsBarcode(canvas, valor || '000000', {
        format:       'CODE128',
        width:        SCALE,
        height:       barHeight * SCALE,
        margin:       8 * SCALE, // 8px CSS de quiet zone interno en el canvas
        displayValue: false,
        background:   bgColor || '#ffffff',
        lineColor:    '#000000',
      });
      const csW = canvas.width  / SCALE;
      const csH = canvas.height / SCALE;
      // Si el canvas natural es más ancho que el espacio disponible, comprimirlo CSS
      // image-rendering: pixelated asegura nearest-neighbor → barras nítidas aun comprimidas
      canvas.style.width  = `${maxWidthCss && csW > maxWidthCss ? maxWidthCss : csW}px`;
      canvas.style.height = `${csH}px`;
    } catch {
      // código incompatible con CODE128 — canvas vacío
    }
  }, [valor, barHeight, bgColor, maxWidthCss]);

  return (
    <canvas ref={ref} style={{ imageRendering: 'pixelated', display: 'block' }} />
  );
}

// ── Código (QR o barras) ──────────────────────────────────────────────────────

function CodigoEtiqueta({
  valor, tipo, size, bgColor,
}: {
  valor:   string;
  tipo:    TipoCodigo;
  size:    number;
  bgColor: string;
}) {
  if (tipo === 'barcode') {
    return <BarcodeCanvas valor={valor} barHeight={size * 0.6} bgColor={bgColor} />;
  }
  return <QRCode value={valor} size={size} bordered={false} bgColor={bgColor} type="svg" />;
}

// ── Componente de una etiqueta ────────────────────────────────────────────────

function Etiqueta({
  producto, plantilla, config, preview = false,
}: {
  producto:  ProductoEtiqueta;
  plantilla: PlantillaId;
  config:    ConfigEtiqueta;
  preview?:  boolean;
}) {
  const pl       = PLANTILLAS[plantilla];
  const scale    = preview ? 1 : 1;
  const ancho    = pl.ancho * scale;
  const alto     = pl.alto  * scale;
  const precioFinal = config.precioConIva
    ? producto.precio * (1 + producto.porcentajeIva / 100)
    : producto.precio;

  const padEtiqueta = plantilla === 'mini' ? 6 : 8;
  // Ancho máximo del canvas del barcode: ancho etiqueta − padding etiqueta×2 − 16px quiet zone lateral del wrapper (8px c/lado)
  const barcodeMaxW = ancho - padEtiqueta * 2 - 16;

  const estiloBase: React.CSSProperties = {
    width:           ancho,
    height:          alto,
    border:          '1px solid #ccc',
    borderRadius:    4,
    background:      config.colorFondo,
    color:           config.colorTexto,
    fontFamily:      '"Helvetica Neue", Arial, sans-serif',
    overflow:        'hidden',
    position:        'relative',
    boxSizing:       'border-box',
    display:         'flex',
    flexDirection:   'column',
    padding:         padEtiqueta,
    pageBreakInside: 'avoid',
    breakInside:     'avoid',
  };

  const qrSize = plantilla === 'mini' ? 44 : plantilla === 'estandar' ? 60 : plantilla === 'precio' ? 52 : 74;

  // Barcode al fondo, sin padding vertical extra — las alturas están calibradas para caber en cada plantilla
  const barcodeAbajo = config.mostrarQR && config.tipoCodigo === 'barcode' ? (
    <div style={{ padding: '0 8px', display: 'flex', justifyContent: 'center' }}>
      <BarcodeCanvas
        valor={producto.codigo}
        barHeight={plantilla === 'mini' ? 13 : plantilla === 'estandar' ? 18 : plantilla === 'precio' ? 12 : 22}
        bgColor={config.colorFondo}
        maxWidthCss={barcodeMaxW}
      />
    </div>
  ) : null;

  return (
    <div style={estiloBase}>
      {/* Mini */}
      {plantilla === 'mini' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', flex: 1, gap: 4, alignItems: 'center' }}>
            {config.mostrarQR && config.tipoCodigo === 'qr' && (
              <div style={{ flexShrink: 0 }}>
                <CodigoEtiqueta valor={producto.codigo} tipo="qr" size={qrSize} bgColor={config.colorFondo} />
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2, marginBottom: 2, wordBreak: 'break-word' }}>
                {producto.nombre.slice(0, 40)}
              </div>
              {config.mostrarCodigo && <div style={{ fontSize: 8, color: '#6b7280' }}>{producto.codigo}</div>}
              {config.mostrarPrecio && (
                <div style={{ fontSize: 11, fontWeight: 900, color: '#1a56db', marginTop: 2 }}>
                  {fmt(precioFinal)}
                </div>
              )}
            </div>
          </div>
          {barcodeAbajo}
        </div>
      )}

      {/* Estándar */}
      {plantilla === 'estandar' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {config.mostrarEmpresa && (
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#1a56db', marginBottom: 3 }}>
              {config.nombreEmpresa}
            </div>
          )}
          <div style={{ display: 'flex', flex: 1, gap: 6 }}>
            {config.mostrarQR && config.tipoCodigo === 'qr' && (
              <div style={{ flexShrink: 0 }}>
                <CodigoEtiqueta valor={producto.codigo} tipo="qr" size={qrSize} bgColor={config.colorFondo} />
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.3, marginBottom: 3, wordBreak: 'break-word' }}>
                {producto.nombre.slice(0, 55)}
              </div>
              {config.mostrarCodigo && <div style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Cód: {producto.codigo}</div>}
              {config.mostrarCategoria && producto.categoria && (
                <div style={{ fontSize: 8, color: '#9ca3af' }}>{producto.categoria}</div>
              )}
            </div>
          </div>
          {barcodeAbajo}
          {config.mostrarPrecio && (
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#1a56db' }}>{fmt(precioFinal)}</span>
              {config.precioConIva && <span style={{ fontSize: 8, color: '#9ca3af', marginLeft: 3 }}>ITBIS incl.</span>}
            </div>
          )}
        </div>
      )}

      {/* Bodega */}
      {plantilla === 'bodega' && (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {config.mostrarEmpresa && (
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#1a56db', marginBottom: 4 }}>
              {config.nombreEmpresa}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.3, marginBottom: 4, wordBreak: 'break-word' }}>
                {producto.nombre}
              </div>
              {config.mostrarCodigo && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>Código: <strong>{producto.codigo}</strong></div>}
              {config.mostrarCategoria && producto.categoria && (
                <div style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>{producto.categoria}</div>
              )}
              <div style={{ fontSize: 8, color: '#9ca3af' }}>Unidad: {producto.unidadMedida}</div>
            </div>
            {config.mostrarQR && config.tipoCodigo === 'qr' && (
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <CodigoEtiqueta valor={producto.codigo} tipo="qr" size={qrSize} bgColor={config.colorFondo} />
                <div style={{ fontSize: 7, color: '#9ca3af', marginTop: 2, textAlign: 'center' }}>{producto.codigo}</div>
              </div>
            )}
          </div>
          {barcodeAbajo}
          {config.mostrarPrecio && (
            <div style={{ borderTop: '1px dashed #ddd', paddingTop: 4, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: '#6b7280' }}>Precio {config.precioConIva ? '(ITBIS incl.)' : '+ ITBIS'}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#1a56db' }}>{fmt(precioFinal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Precio */}
      {plantilla === 'precio' && (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 2 }}>
          {config.mostrarEmpresa && (
            <div style={{ fontSize: 6, fontWeight: 700, textTransform: 'uppercase', color: '#1a56db', lineHeight: 1 }}>
              {config.nombreEmpresa}
            </div>
          )}
          <div style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.1, wordBreak: 'break-word', maxWidth: '100%' }}>
            {producto.nombre.slice(0, 35)}
          </div>
          {config.mostrarPrecio && (
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1a56db', lineHeight: 1 }}>
              {fmt(precioFinal)}
            </div>
          )}
          {config.mostrarQR && config.tipoCodigo === 'qr' && (
            <CodigoEtiqueta valor={producto.codigo} tipo="qr" size={qrSize} bgColor={config.colorFondo} />
          )}
          {barcodeAbajo}
          {config.mostrarCodigo && <div style={{ fontSize: 6, color: '#9ca3af', lineHeight: 1 }}>{producto.codigo}</div>}
        </div>
      )}
    </div>
  );
}

// ── Hoja de etiquetas (para imprimir) ────────────────────────────────────────

function HojaEtiquetas({
  items, plantilla, config,
}: {
  items:     ProductoEtiqueta[];
  plantilla: PlantillaId;
  config:    ConfigEtiqueta;
}) {
  const todas: ProductoEtiqueta[] = [];
  items.forEach(p => {
    for (let i = 0; i < p.cantidad; i++) todas.push(p);
  });

  if (todas.length === 0) return null;

  // Una etiqueta = una página física. Sin padding ni gap extra que genere hojas en blanco.
  return (
    <>
      {todas.map((p, i) => (
        <div
          key={`${p.id}-${i}`}
          style={{
            pageBreakAfter: i < todas.length - 1 ? 'always' : 'auto',
            breakAfter:     i < todas.length - 1 ? 'page'   : 'auto',
          }}
        >
          <Etiqueta producto={p} plantilla={plantilla} config={config} />
        </div>
      ))}
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function EtiquetasPage() {
  const empresaItem = useAuthStore(s => s.empresas.find(e => e.empresaId === s.empresaActual));

  const [busqueda,         setBusqueda]         = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [plantilla,  setPlantilla]  = useState<PlantillaId>('precio');
  const [seleccionados, setSeleccionados] = useState<ProductoEtiqueta[]>([]);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [config, setConfig] = useState<ConfigEtiqueta>({
    mostrarPrecio:    true,
    mostrarCodigo:    true,
    mostrarCategoria: false,
    mostrarEmpresa:   true,
    mostrarQR:        true,
    tipoCodigo:       'barcode',
    precioConIva:     true,
    nombreEmpresa:    empresaItem?.nombre ?? '',
    colorFondo:       '#ffffff',
    colorTexto:       '#1e293b',
  });

  const { token } = theme.useToken();
  const printRef = useRef<HTMLDivElement>(null);

  // Debounce: el query al servidor se lanza 300ms después de que el usuario deja de escribir
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Mismo endpoint que Órdenes de Compra: /productos con ILIKE (case-insensitive)
  const { data: productosPaginados, isLoading } = useQuery({
    queryKey: ['etiquetas-productos', busquedaDebounced],
    queryFn:  () => productosApi.list(1, 50, busquedaDebounced, false),
    staleTime: 30_000,
  });
  const productos = productosPaginados?.data ?? [];

  const agregarProducto = (p: any) => {
    if (seleccionados.find(s => s.id === p.id)) {
      setSeleccionados(prev => prev.map(s => s.id === p.id ? { ...s, cantidad: s.cantidad + 1 } : s));
    } else {
      setSeleccionados(prev => [...prev, { ...p, cantidad: 1 }]);
    }
  };

  const actualizarCantidad = (id: number, cantidad: number) => {
    if (cantidad <= 0) {
      setSeleccionados(prev => prev.filter(p => p.id !== id));
    } else {
      setSeleccionados(prev => prev.map(p => p.id === id ? { ...p, cantidad } : p));
    }
  };

  const totalEtiquetas = seleccionados.reduce((s, p) => s + p.cantidad, 0);

  const handlePrint = () => {
    if (seleccionados.length === 0) { message.warning('Agrega productos primero'); return; }
    const pl = PLANTILLAS[plantilla];
    const styleEl = document.createElement('style');
    styleEl.textContent = `@media print { @page { size: ${pl.mmW}mm ${pl.mmH}mm; margin: 0; } }`;
    document.head.appendChild(styleEl);
    window.print();
    document.head.removeChild(styleEl);
  };

  const updConf = (key: keyof ConfigEtiqueta, val: any) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BarcodeOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Impresión de Etiquetas</Title>
            <Text type="secondary">Genera etiquetas con código QR o de barras para tus productos</Text>
          </div>
        </div>
        <Space>
          <RefreshByKeyButton queryKey={['etiquetas']} />
          <VideoTutorialButton />
          <Button icon={<SettingOutlined />} onClick={() => setMostrarConfig(!mostrarConfig)}>
            Configurar
          </Button>
          <Badge count={totalEtiquetas} showZero={false}>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
              disabled={seleccionados.length === 0}
              size="large"
            >
              Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ''}
            </Button>
          </Badge>
        </Space>
      </div>

      <Row gutter={[16, 16]}>

        {/* ── Panel izquierdo ─────────────────────────────────────────── */}
        <Col xs={24} lg={16}>

          {/* Selector de plantilla */}
          <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 10 }}>Plantilla de Etiqueta</Text>
            <Row gutter={[8, 8]}>
              {(Object.entries(PLANTILLAS) as [PlantillaId, typeof PLANTILLAS.mini][]).map(([id, pl]) => (
                <Col key={id} xs={12} sm={6}>
                  <div
                    onClick={() => setPlantilla(id)}
                    style={{
                      border:       `2px solid ${plantilla === id ? token.colorPrimary : token.colorBorderSecondary}`,
                      borderRadius: 8,
                      padding:      10,
                      cursor:       'pointer',
                      textAlign:    'center',
                      background:   plantilla === id ? token.colorPrimaryBg : token.colorBgContainer,
                      transition:   'all .2s',
                    }}
                  >
                    <BarcodeOutlined style={{ fontSize: 20, color: plantilla === id ? token.colorPrimary : token.colorTextTertiary, display: 'block', margin: '0 auto 4px' }} />
                    <Text strong style={{ fontSize: 12, color: plantilla === id ? token.colorPrimary : token.colorText }}>{pl.nombre}</Text>
                    <div style={{ fontSize: 10, color: token.colorTextTertiary }}>{pl.desc}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>

          {/* Configuración opcional */}
          {mostrarConfig && (
            <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16, background: token.colorFillAlter }}>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>Configuración de campos</Text>
              <Row gutter={[12, 8]}>
                <Col xs={24} sm={8}><Switch checked={config.mostrarPrecio}    onChange={v => updConf('mostrarPrecio', v)} /> <Text style={{ fontSize: 12 }}> Precio</Text></Col>
                <Col xs={24} sm={8}><Switch checked={config.mostrarCodigo}    onChange={v => updConf('mostrarCodigo', v)} /> <Text style={{ fontSize: 12 }}> Código</Text></Col>
                <Col xs={24} sm={8}>
                  <Switch checked={config.mostrarQR} onChange={v => updConf('mostrarQR', v)} />
                  <Text style={{ fontSize: 12 }}> Código</Text>
                  {config.mostrarQR && (
                    <Select
                      size="small"
                      value={config.tipoCodigo}
                      onChange={v => updConf('tipoCodigo', v)}
                      style={{ marginLeft: 6, width: 110 }}
                      options={[
                        { value: 'qr',      label: '▣ QR Code'   },
                        { value: 'barcode', label: '▋ Barras'    },
                      ]}
                    />
                  )}
                </Col>
                <Col xs={24} sm={8}><Switch checked={config.mostrarEmpresa}   onChange={v => updConf('mostrarEmpresa', v)} /> <Text style={{ fontSize: 12 }}> Empresa</Text></Col>
                <Col xs={24} sm={8}><Switch checked={config.mostrarCategoria} onChange={v => updConf('mostrarCategoria', v)} /> <Text style={{ fontSize: 12 }}> Categoría</Text></Col>
                <Col xs={24} sm={8}><Switch checked={config.precioConIva}    onChange={v => updConf('precioConIva', v)} />  <Text style={{ fontSize: 12 }}> Precio + ITBIS</Text></Col>
              </Row>
              <Row gutter={12} style={{ marginTop: 12 }}>
                <Col xs={24} sm={12}>
                  <Text style={{ fontSize: 12 }}>Nombre empresa:</Text>
                  <Input size="small" value={config.nombreEmpresa} onChange={e => updConf('nombreEmpresa', e.target.value)} style={{ marginTop: 4 }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Text style={{ fontSize: 12 }}>Fondo:</Text>
                  <input type="color" value={config.colorFondo} onChange={e => updConf('colorFondo', e.target.value)}
                    style={{ width: '100%', height: 30, marginTop: 4, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }} />
                </Col>
                <Col xs={12} sm={6}>
                  <Text style={{ fontSize: 12 }}>Texto:</Text>
                  <input type="color" value={config.colorTexto} onChange={e => updConf('colorTexto', e.target.value)}
                    style={{ width: '100%', height: 30, marginTop: 4, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }} />
                </Col>
              </Row>
            </Card>
          )}

          {/* Búsqueda de productos */}
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input
                prefix={<SearchOutlined />}
                placeholder="Buscar productos por nombre o código..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                allowClear
              />
            </div>

            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {isLoading && <Text type="secondary">Buscando...</Text>}
              {!isLoading && productos.length === 0 && (
                <Empty description="Sin productos que mostrar" />
              )}
              {productos.map((p: any) => {
                const yaAgregado = seleccionados.find(s => s.id === p.id);
                return (
                  <div
                    key={p.id}
                    style={{
                      display:       'flex',
                      alignItems:    'center',
                      gap:           10,
                      padding:       '8px 4px',
                      borderBottom:  `1px solid ${token.colorBorderSecondary}`,
                      borderRadius:  yaAgregado ? 6 : 0,
                      background:    yaAgregado ? token.colorPrimaryBg : 'transparent',
                      cursor:        'pointer',
                    }}
                    onClick={() => agregarProducto(p)}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 6,
                      background: token.colorFillSecondary, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, overflow: 'hidden',
                    }}>
                      {p.imagenUrl
                        ? <img src={p.imagenUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <BarcodeOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                      }
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <Text strong style={{ fontSize: 13 }}>{p.nombre}</Text>
                      <div>
                        <Tag style={{ fontSize: 10 }}>{p.codigo}</Tag>
                        {p.categoria && <Tag color="blue" style={{ fontSize: 10 }}>{p.categoria}</Tag>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: token.colorPrimary }}>
                        {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(p.precio)}
                      </div>
                      <Text type="secondary" style={{ fontSize: 10 }}>+{p.porcentajeIva}% ITBIS</Text>
                    </div>
                    {yaAgregado
                      ? <Tag color="blue" style={{ fontSize: 11 }}>✓ {yaAgregado.cantidad}</Tag>
                      : <Button size="small" icon={<PlusOutlined />} type="primary" ghost onClick={e => { e.stopPropagation(); agregarProducto(p); }}>Agregar</Button>
                    }
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        {/* ── Panel derecho ───────────────────────────────────────────── */}
        <Col xs={24} lg={8}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, position: 'sticky', top: 80 }}
            title={
              <Space>
                <EyeOutlined />
                Lista de Etiquetas
                {totalEtiquetas > 0 && <Tag color="blue">{totalEtiquetas} total</Tag>}
              </Space>
            }
          >
            {seleccionados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <QrcodeOutlined style={{ fontSize: 40, color: '#d9d9d9', marginBottom: 8 }} />
                <div><Text type="secondary">Agrega productos de la lista</Text></div>
              </div>
            ) : (
              <>
                {seleccionados.map(p => (
                  <div key={p.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <Text strong style={{ fontSize: 12 }}>{p.nombre}</Text>
                        <div><Tag style={{ fontSize: 9 }}>{p.codigo}</Tag></div>
                      </div>
                      <Button
                        size="small" type="text" danger icon={<DeleteOutlined />}
                        onClick={() => setSeleccionados(prev => prev.filter(s => s.id !== p.id))}
                      />
                    </div>

                    {/* Preview de la etiqueta */}
                    <div style={{ transform: 'scale(0.75)', transformOrigin: 'top left', marginBottom: -PLANTILLAS[plantilla].alto * 0.25 }}>
                      <Etiqueta producto={p} plantilla={plantilla} config={config} preview />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 11 }}>Cantidad:</Text>
                      <Button size="small" icon={<MinusOutlined />} onClick={() => actualizarCantidad(p.id, p.cantidad - 1)} />
                      <InputNumber
                        size="small" min={1} max={999} value={p.cantidad}
                        onChange={v => actualizarCantidad(p.id, v ?? 1)}
                        style={{ width: 60 }}
                      />
                      <Button size="small" icon={<PlusOutlined />} onClick={() => actualizarCantidad(p.id, p.cantidad + 1)} />
                    </div>
                    <Divider style={{ margin: '8px 0' }} />
                  </div>
                ))}

                <Button
                  type="primary"
                  icon={<PrinterOutlined />}
                  block
                  size="large"
                  onClick={handlePrint}
                  style={{ marginTop: 8 }}
                >
                  Imprimir {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''}
                </Button>
                <Button
                  block
                  style={{ marginTop: 8 }}
                  onClick={() => setSeleccionados([])}
                >
                  Limpiar lista
                </Button>
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* Estilos de impresión globales */}
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; height: auto !important; }
          body > * { display: none !important; }
          body > #etiquetas-print { display: block !important; }
          #etiquetas-print svg { shape-rendering: crispEdges !important; }
          #etiquetas-print canvas { image-rendering: pixelated !important; }
        }
      `}</style>

      {/* Portal: hijo directo de body para que el CSS de impresión lo aísle del #root */}
      {createPortal(
        <div id="etiquetas-print" style={{ display: 'none' }}>
          <HojaEtiquetas items={seleccionados} plantilla={plantilla} config={config} />
        </div>,
        document.body
      )}
    </div>
  );
}
