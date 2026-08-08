/**
 * SeccionBalanza — Configuración → Balanzas
 *
 * Tabs:
 *   1. Probador:    pega/escanea código → diagnóstico EAN + patrón
 *   2. Patrones:    CRUD de patrones de decodificación (ADMIN/CONTADOR)
 *   3. Asistente:   Calibración con ≥2 etiquetas distintas
 *   4. Sin config:  Productos pesables con PLU o unidad incorrecta
 *   5. Formatos:    Exportación de catálogo a balanza (ADMIN/CONTADOR)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Tabs, Card, Input, Button, Space, Tag, Typography, Table, Form,
  Select, InputNumber, Switch, Modal, Tooltip, Alert, Steps, Spin,
  Popconfirm, Badge, Divider, message, Empty,
} from 'antd';
import {
  ScanOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined,
  ArrowRightOutlined, ReloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TipoDato = 'peso' | 'precio';

interface Patron {
  id: number;
  nombre: string;
  prefijo: string;
  longitudPlu: number;
  tipoDato: TipoDato;
  longitudValor: number;
  decimalesValor: number;
  unidadPeso?: string;
  tieneCheckValor: boolean;
  longitudTotal: number;
  prioridad: number;
}

interface CandidatoPatron {
  prefijo: string;
  longitudPlu: number;
  tipoDato: TipoDato;
  longitudValor: number;
  decimalesValor: number;
  tieneCheckValor: boolean;
  longitudTotal: number;
  plu: number;
  valor: number;
}

interface BalanzaParseResult {
  patron: Patron;
  plu: number;
  valor: number;
  tipoDato: TipoDato;
  unidadPeso?: string;
}

interface ProbarResponse {
  codigo: string;
  eanValido: boolean;
  resultado: BalanzaParseResult | null;
  candidatos: CandidatoPatron[];
}

interface ProductoSinConfig {
  id: number;
  codigo: string;
  nombre: string;
  unidadMedida: string;
  plu: number | null;
  sinPlu: boolean;
  advertenciaUnidad: string | null;
}

interface Formato {
  id: number;
  nombre: string;
  separador?: string;
  columnas: { campo: string; largo: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const candidatoKey = (c: CandidatoPatron) =>
  `${c.prefijo}|${c.longitudPlu}|${c.tipoDato}|${c.longitudValor}|${c.decimalesValor}|${c.tieneCheckValor}|${c.longitudTotal}`;

const intersectarCandidatos = (a: CandidatoPatron[], b: CandidatoPatron[]): CandidatoPatron[] => {
  const keysB = new Set(b.map(candidatoKey));
  return a.filter(c => keysB.has(candidatoKey(c)));
};

function geometriaLabel(p: {
  prefijo: string; longitudPlu: number; longitudValor: number;
  tieneCheckValor: boolean; longitudTotal: number;
}): string {
  const bonus = p.tieneCheckValor ? 1 : 0;
  const suma = p.prefijo.length + p.longitudPlu + p.longitudValor + bonus + 1;
  const ok = suma === p.longitudTotal;
  return `${p.prefijo.length}+${p.longitudPlu}+${p.longitudValor}+${bonus}+1=${suma} ${ok ? '✅' : `❌ (esperado ${p.longitudTotal})`}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const balanzaApi = {
  listarPatrones: () =>
    api.get<{ data: Patron[] }>('/balanza/patrones').then(r => r.data.data),
  crearPatron: (body: Omit<Patron, 'id'>) =>
    api.post<{ data: Patron }>('/balanza/patrones', body).then(r => r.data.data),
  actualizarPatron: (id: number, body: Partial<Patron>) =>
    api.patch<{ data: Patron }>(`/balanza/patrones/${id}`, body).then(r => r.data.data),
  eliminarPatron: (id: number) =>
    api.delete(`/balanza/patrones/${id}`),
  listarFormatos: () =>
    api.get<{ data: Formato[] }>('/balanza/formatos').then(r => r.data.data),
  crearFormato: (body: Omit<Formato, 'id'>) =>
    api.post<{ data: Formato }>('/balanza/formatos', body).then(r => r.data.data),
  eliminarFormato: (id: number) =>
    api.delete(`/balanza/formatos/${id}`),
  probar: (codigo: string) =>
    api.post<{ data: ProbarResponse }>('/balanza/probar', { codigo }).then(r => r.data.data),
  calibrarFiltrar: (payload: { codigo: string; plu: number; valor: number; tipoDato: TipoDato }) =>
    api.post<{ data: CandidatoPatron[] }>('/balanza/calibrar/filtrar', payload).then(r => r.data.data),
  productosSinConfigurar: () =>
    api.get<{ data: ProductoSinConfig[] }>('/balanza/productos-sin-configurar').then(r => r.data.data),
};

// ── Tab 1: Probador ───────────────────────────────────────────────────────────

function TabProbador() {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<ProbarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<any>(null);

  const probar = useCallback(async (cod: string) => {
    const c = cod.trim();
    if (!c) return;
    setLoading(true);
    try {
      const res = await balanzaApi.probar(c);
      setResultado(res);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al probar el código');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-submit after 12 or 13 digits (barcode scanner sends Enter)
  const handleChange = (val: string) => {
    setCodigo(val);
    if (val.length >= 12 && val.length <= 13 && /^\d+$/.test(val)) {
      probar(val);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" title={<><ScanOutlined /> Probar código de barras</>}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            ref={inputRef}
            value={codigo}
            onChange={e => handleChange(e.target.value)}
            onPressEnter={() => probar(codigo)}
            placeholder="Escanea o pega un código EAN-13 / UPC-A (12 o 13 dígitos)"
            maxLength={14}
            style={{ fontFamily: 'monospace', fontSize: 16 }}
            autoFocus
          />
          <Button
            type="primary"
            loading={loading}
            onClick={() => probar(codigo)}
            icon={<ScanOutlined />}
          >
            Probar
          </Button>
          <Button
            onClick={() => { setCodigo(''); setResultado(null); inputRef.current?.focus(); }}
          >
            Limpiar
          </Button>
        </Space.Compact>
        <Text type="secondary" style={{ fontSize: 12 }}>
          El lector de código de barras envía Enter automáticamente — también puedes pegar el código y presionar Enter.
        </Text>
      </Card>

      {loading && <Spin tip="Analizando..." />}

      {resultado && !loading && (
        <Card size="small">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* EAN */}
            <Space>
              {resultado.eanValido
                ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
              }
              <Text strong style={{ fontSize: 15, fontFamily: 'monospace' }}>
                {resultado.codigo}
              </Text>
              <Tag color={resultado.eanValido ? 'success' : 'error'}>
                {resultado.eanValido ? 'EAN válido' : 'EAN inválido'}
              </Tag>
            </Space>

            {!resultado.eanValido && (
              <Alert
                type="error"
                showIcon
                message="El dígito verificador no coincide"
                description="Este código no pasa la validación EAN-13 / UPC-A. No es una etiqueta de balanza; se tratará como producto normal."
              />
            )}

            {resultado.eanValido && !resultado.resultado && (
              <Alert
                type="warning"
                showIcon
                message="Sin coincidencia"
                description="El código es EAN válido pero no coincide con ningún patrón activo de balanza. Puede ser un producto con código propio iniciado en '2', o puede que necesites configurar el patrón."
              />
            )}

            {resultado.resultado && (
              <Card
                size="small"
                style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}
              >
                <Space direction="vertical" size={4}>
                  <Text strong style={{ color: '#135200' }}>
                    ✅ Patrón: {resultado.resultado.patron.nombre}
                  </Text>
                  <Space wrap>
                    <Tag color="blue">PLU: {resultado.resultado.plu}</Tag>
                    <Tag color={resultado.resultado.tipoDato === 'peso' ? 'cyan' : 'purple'}>
                      {resultado.resultado.tipoDato === 'peso'
                        ? `Peso: ${resultado.resultado.valor.toFixed(3)} ${resultado.resultado.unidadPeso ?? 'kg'}`
                        : `Precio: $${resultado.resultado.valor.toFixed(2)}`
                      }
                    </Tag>
                    <Tag>Prioridad: {resultado.resultado.patron.prioridad}</Tag>
                  </Space>
                </Space>
              </Card>
            )}

            {resultado.eanValido && resultado.candidatos.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', color: '#1677ff', fontSize: 12 }}>
                  {resultado.candidatos.length} interpretación(es) geométrica(s) posible(s) ↓
                </summary>
                <Table
                  size="small"
                  dataSource={resultado.candidatos}
                  rowKey={candidatoKey}
                  pagination={false}
                  style={{ marginTop: 8 }}
                  columns={[
                    { title: 'Pref.', dataIndex: 'prefijo', width: 50 },
                    { title: 'PLU', dataIndex: 'longitudPlu', width: 50 },
                    { title: 'Tipo', dataIndex: 'tipoDato', width: 60 },
                    { title: 'Valor dig.', dataIndex: 'longitudValor', width: 80 },
                    { title: 'Dec.', dataIndex: 'decimalesValor', width: 50 },
                    { title: 'Check int.', dataIndex: 'tieneCheckValor', width: 80,
                      render: (v: boolean) => v ? '✓' : '-' },
                    { title: 'Long.', dataIndex: 'longitudTotal', width: 60 },
                    { title: 'PLU valor', dataIndex: 'plu', width: 80 },
                    { title: 'Valor', dataIndex: 'valor', width: 80,
                      render: (v: number, r: CandidatoPatron) =>
                        `${v.toFixed(r.decimalesValor)} ${r.tipoDato === 'peso' ? 'kg' : '$'}` },
                  ]}
                />
              </details>
            )}
          </Space>
        </Card>
      )}
    </Space>
  );
}

// ── Tab 2: Patrones CRUD ──────────────────────────────────────────────────────

const PREFIJOS = ['2', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'];

function FormPatron({
  initial, onFinish, loading,
}: {
  initial?: Partial<Patron>;
  onFinish: (vals: any) => void;
  loading: boolean;
}) {
  const [form] = Form.useForm();
  const tipoDato = Form.useWatch('tipoDato', form);
  const prefijo = Form.useWatch('prefijo', form);
  const longitudPlu = Form.useWatch('longitudPlu', form);
  const longitudValor = Form.useWatch('longitudValor', form);
  const tieneCheckValor = Form.useWatch('tieneCheckValor', form);
  const longitudTotal = Form.useWatch('longitudTotal', form);

  const bonus = tieneCheckValor ? 1 : 0;
  const suma = (prefijo?.length ?? 0) + (longitudPlu ?? 0) + (longitudValor ?? 0) + bonus + 1;
  const geoOk = suma === longitudTotal;

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        tipoDato: 'peso',
        longitudPlu: 5,
        longitudValor: 5,
        decimalesValor: 3,
        tieneCheckValor: false,
        longitudTotal: 13,
        prioridad: 100,
        ...initial,
      }}
      onFinish={onFinish}
    >
      <Form.Item name="nombre" label="Nombre descriptivo" rules={[{ required: true }]}>
        <Input placeholder="Ej: Mettler Toledo 5-PLU peso" maxLength={100} />
      </Form.Item>

      <Form.Item label="Geometría del código" style={{ marginBottom: 0 }}>
        <Alert
          style={{ marginBottom: 12 }}
          type={geoOk ? 'success' : 'warning'}
          showIcon
          message={
            prefijo && longitudPlu && longitudValor && longitudTotal
              ? `prefijo(${prefijo?.length ?? 0}) + PLU(${longitudPlu ?? '?'}) + valor(${longitudValor ?? '?'}) + check(${bonus}) + 1 = ${suma} ${geoOk ? '✅' : `≠ ${longitudTotal} ❌`}`
              : 'Complete los campos para ver la validación de geometría'
          }
        />
      </Form.Item>

      <Form.Item name="prefijo" label="Prefijo EAN" rules={[{ required: true }]}>
        <Select placeholder="Ej: 2, 20, 21…">
          {PREFIJOS.map(p => <Option key={p} value={p}>{p}</Option>)}
        </Select>
      </Form.Item>

      <Form.Item name="longitudTotal" label="Longitud total" rules={[{ required: true }]}>
        <Select>
          <Option value={13}>13 (EAN-13)</Option>
          <Option value={12}>12 (UPC-A)</Option>
        </Select>
      </Form.Item>

      <Form.Item name="longitudPlu" label="Longitud PLU (dígitos)" rules={[{ required: true }]}>
        <InputNumber min={4} max={6} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="tipoDato" label="¿Qué contiene el campo de valor?" rules={[{ required: true }]}>
        <Select>
          <Option value="peso">Peso (kg, lb…)</Option>
          <Option value="precio">Precio (moneda local)</Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="longitudValor"
        label={
          <span>
            Longitud del valor (dígitos puros){' '}
            <Tooltip title="NO incluye el dígito verificador interno. Si tieneCheckValor=true, ese dígito se suma aparte.">
              <InfoCircleOutlined />
            </Tooltip>
          </span>
        }
        rules={[{ required: true }]}
      >
        <InputNumber min={3} max={8} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="decimalesValor" label="Decimales del valor" rules={[{ required: true }]}>
        <InputNumber min={0} max={6} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="tieneCheckValor" label="¿Tiene dígito verificador interno?" valuePropName="checked">
        <Switch checkedChildren="Sí" unCheckedChildren="No" />
      </Form.Item>

      {tipoDato === 'peso' && (
        <Form.Item name="unidadPeso" label="Unidad de peso esperada" rules={[{ required: true }]}>
          <Select placeholder="Ej: KG, LB">
            <Option value="KG">KG</Option>
            <Option value="LB">LB</Option>
            <Option value="G">G</Option>
          </Select>
        </Form.Item>
      )}

      <Form.Item name="prioridad" label="Prioridad (menor = gana primero)">
        <InputNumber min={1} max={32767} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block disabled={!geoOk}>
          Guardar patrón
        </Button>
      </Form.Item>
    </Form>
  );
}

function TabPatrones({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState<Patron | null>(null);

  const { data: patrones = [], isLoading } = useQuery({
    queryKey: ['balanza-patrones'],
    queryFn: balanzaApi.listarPatrones,
  });

  const crear = useMutation({
    mutationFn: (vals: any) => {
      const { nombre, prefijo, longitudPlu, tipoDato, longitudValor,
              decimalesValor, unidadPeso, tieneCheckValor, longitudTotal, prioridad } = vals;
      return balanzaApi.crearPatron({
        nombre, prefijo, longitudPlu, tipoDato, longitudValor,
        decimalesValor, unidadPeso: tipoDato === 'precio' ? undefined : unidadPeso,
        tieneCheckValor, longitudTotal, prioridad: prioridad ?? 100,
      });
    },
    onSuccess: () => {
      message.success('Patrón creado');
      setModalVisible(false);
      qc.invalidateQueries({ queryKey: ['balanza-patrones'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear'),
  });

  const editar = useMutation({
    mutationFn: (vals: any) =>
      balanzaApi.actualizarPatron(editando!.id, {
        ...vals,
        unidadPeso: vals.tipoDato === 'precio' ? undefined : vals.unidadPeso,
      }),
    onSuccess: () => {
      message.success('Patrón actualizado');
      setModalVisible(false);
      setEditando(null);
      qc.invalidateQueries({ queryKey: ['balanza-patrones'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar'),
  });

  const eliminar = useMutation({
    mutationFn: balanzaApi.eliminarPatron,
    onSuccess: () => {
      message.success('Patrón eliminado');
      qc.invalidateQueries({ queryKey: ['balanza-patrones'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar'),
  });

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' },
    { title: 'Pref.', dataIndex: 'prefijo', key: 'prefijo', width: 55 },
    { title: 'PLU', dataIndex: 'longitudPlu', key: 'longitudPlu', width: 50 },
    { title: 'Tipo', dataIndex: 'tipoDato', key: 'tipoDato', width: 65,
      render: (v: TipoDato) => <Tag color={v === 'peso' ? 'cyan' : 'purple'}>{v}</Tag> },
    { title: 'Valor', dataIndex: 'longitudValor', key: 'longitudValor', width: 55 },
    { title: 'Dec.', dataIndex: 'decimalesValor', key: 'decimalesValor', width: 50 },
    { title: 'UOM', dataIndex: 'unidadPeso', key: 'unidadPeso', width: 55,
      render: (v?: string) => v ?? '—' },
    { title: 'Chk', dataIndex: 'tieneCheckValor', key: 'tieneCheckValor', width: 50,
      render: (v: boolean) => v ? '✓' : '—' },
    { title: 'Long.', dataIndex: 'longitudTotal', key: 'longitudTotal', width: 55 },
    { title: 'Prio.', dataIndex: 'prioridad', key: 'prioridad', width: 55 },
    {
      title: 'Geometría',
      key: 'geo',
      render: (_: any, r: Patron) => {
        const bonus = r.tieneCheckValor ? 1 : 0;
        const suma = r.prefijo.length + r.longitudPlu + r.longitudValor + bonus + 1;
        return <Tag color={suma === r.longitudTotal ? 'success' : 'error'}>
          {suma === r.longitudTotal ? '✅' : `${suma}≠${r.longitudTotal}`}
        </Tag>;
      },
    },
    ...(isAdmin ? [{
      title: '',
      key: 'acciones',
      width: 90,
      render: (_: any, r: Patron) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditando(r); setModalVisible(true); }} />
          <Popconfirm
            title="¿Eliminar este patrón?"
            onConfirm={() => eliminar.mutate(r.id)}
            okText="Sí" cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {isAdmin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setEditando(null); setModalVisible(true); }}
          >
            Nuevo patrón
          </Button>
        )}
        {!isAdmin && (
          <Text type="secondary">Solo ADMIN y CONTADOR pueden crear o editar patrones.</Text>
        )}
      </div>

      <Table
        dataSource={patrones}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        scroll={{ x: 800 }}
        locale={{ emptyText: <Empty description="Sin patrones configurados" /> }}
      />

      <Modal
        title={editando ? 'Editar patrón' : 'Nuevo patrón de decodificación'}
        open={modalVisible}
        footer={null}
        onCancel={() => { setModalVisible(false); setEditando(null); }}
        width={520}
        destroyOnClose
      >
        <FormPatron
          initial={editando ?? undefined}
          onFinish={editando ? editar.mutate : crear.mutate}
          loading={crear.isPending || editar.isPending}
        />
      </Modal>
    </>
  );
}

// ── Tab 3: Asistente de calibración ──────────────────────────────────────────

type EtiquetaCaptura = {
  codigo: string;
  candidatos: CandidatoPatron[];
  plu: number;
  valor: number;
  tipoDato: TipoDato;
};

function TabAsistente({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [paso, setPaso] = useState(0); // 0=intro, 1=etiqueta1, 2=etiqueta2, 3=resultado
  const [etiquetas, setEtiquetas] = useState<EtiquetaCaptura[]>([]);
  const [interseccion, setInterseccion] = useState<CandidatoPatron[]>([]);

  // Estado formulario etiqueta actual
  const [codigoActual, setCodigoActual] = useState('');
  const [candidatosActuales, setCandidatosActuales] = useState<CandidatoPatron[] | null>(null);
  const [pluConfirmado, setPluConfirmado] = useState<number | null>(null);
  const [valorConfirmado, setValorConfirmado] = useState<number | null>(null);
  const [tipoDatoConfirmado, setTipoDatoConfirmado] = useState<TipoDato>('peso');
  const [loadingProbar, setLoadingProbar] = useState(false);
  const [loadingFiltrar, setLoadingFiltrar] = useState(false);
  const [loadingGuardar, setLoadingGuardar] = useState(false);
  const [nombrePatron, setNombrePatron] = useState('');
  const [unidadPesoPatron, setUnidadPesoPatron] = useState<string>('KG');

  const esEtiqueta = paso >= 1;
  const numEtiqueta = Math.max(1, paso); // 1-based

  const reset = () => {
    setPaso(0);
    setEtiquetas([]);
    setInterseccion([]);
    setCodigoActual('');
    setCandidatosActuales(null);
    setPluConfirmado(null);
    setValorConfirmado(null);
    setNombrePatron('');
  };

  const probarCodigo = async (cod: string) => {
    const c = cod.trim();
    if (!c) return;
    setLoadingProbar(true);
    setCandidatosActuales(null);
    setPluConfirmado(null);
    setValorConfirmado(null);
    try {
      const res = await balanzaApi.probar(c);
      if (!res.eanValido) {
        message.error('El código no pasa la validación EAN-13/UPC-A. Prueba con otra etiqueta.');
        return;
      }
      setCandidatosActuales(res.candidatos);
      // Pre-fill PLU from first candidate
      if (res.candidatos.length > 0) {
        setPluConfirmado(res.candidatos[0].plu);
        setValorConfirmado(res.candidatos[0].valor);
        setTipoDatoConfirmado(res.candidatos[0].tipoDato);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al probar el código');
    } finally {
      setLoadingProbar(false);
    }
  };

  const confirmarEtiqueta = async () => {
    if (!codigoActual || pluConfirmado == null || valorConfirmado == null) return;
    setLoadingFiltrar(true);
    try {
      const candidatosFiltrados = await balanzaApi.calibrarFiltrar({
        codigo: codigoActual,
        plu: pluConfirmado,
        valor: valorConfirmado,
        tipoDato: tipoDatoConfirmado,
      });

      if (candidatosFiltrados.length === 0) {
        message.warning(
          'Ningún patrón geométrico produce exactamente ese PLU y valor. ' +
          'Verifica los datos o prueba con una etiqueta diferente.',
        );
        return;
      }

      const nuevaEtiqueta: EtiquetaCaptura = {
        codigo:   codigoActual,
        candidatos: candidatosFiltrados,
        plu:      pluConfirmado,
        valor:    valorConfirmado,
        tipoDato: tipoDatoConfirmado,
      };

      const nuevasEtiquetas = [...etiquetas, nuevaEtiqueta];
      setEtiquetas(nuevasEtiquetas);

      // Calcular intersección
      const inter = nuevasEtiquetas.length === 1
        ? candidatosFiltrados
        : nuevasEtiquetas.slice(1).reduce(
            (acc, e) => intersectarCandidatos(acc, e.candidatos),
            nuevasEtiquetas[0].candidatos,
          );

      setInterseccion(inter);

      // Reset campo
      setCodigoActual('');
      setCandidatosActuales(null);
      setPluConfirmado(null);
      setValorConfirmado(null);

      if (nuevasEtiquetas.length >= 2) {
        if (inter.length === 0) {
          message.error('Las etiquetas no comparten ningún patrón geométrico común. Pueden ser de balanzas diferentes.');
          setPaso(3); // show result (empty)
        } else if (inter.length === 1) {
          message.success('¡Patrón único encontrado!');
          setPaso(3);
        } else {
          // Ambigüedad — pedir más
          message.info(`Quedan ${inter.length} candidatos. Escanea otra etiqueta para desambiguar.`);
          setPaso(paso + 1);
        }
      } else {
        // Primera etiqueta OK — pedir segunda
        setPaso(2);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al filtrar candidatos');
    } finally {
      setLoadingFiltrar(false);
    }
  };

  const guardarPatron = async () => {
    if (interseccion.length !== 1 || !nombrePatron.trim()) return;
    const c = interseccion[0];
    setLoadingGuardar(true);
    try {
      await balanzaApi.crearPatron({
        nombre: nombrePatron.trim(),
        prefijo: c.prefijo,
        longitudPlu: c.longitudPlu,
        tipoDato: c.tipoDato,
        longitudValor: c.longitudValor,
        decimalesValor: c.decimalesValor,
        tieneCheckValor: c.tieneCheckValor,
        longitudTotal: c.longitudTotal,
        unidadPeso: c.tipoDato === 'peso' ? unidadPesoPatron : undefined,
        prioridad: 100,
      });
      message.success('Patrón guardado correctamente');
      qc.invalidateQueries({ queryKey: ['balanza-patrones'] });
      reset();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Error al guardar el patrón');
    } finally {
      setLoadingGuardar(false);
    }
  };

  const EtiquetaForm = () => (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          value={codigoActual}
          onChange={e => {
            setCodigoActual(e.target.value);
            setCandidatosActuales(null);
            if (e.target.value.length >= 12 && /^\d+$/.test(e.target.value)) {
              probarCodigo(e.target.value);
            }
          }}
          onPressEnter={() => probarCodigo(codigoActual)}
          placeholder={`Escanea la etiqueta ${numEtiqueta}`}
          style={{ fontFamily: 'monospace' }}
          autoFocus
        />
        <Button
          loading={loadingProbar}
          onClick={() => probarCodigo(codigoActual)}
          icon={<ScanOutlined />}
        >
          Analizar
        </Button>
      </Space.Compact>

      {candidatosActuales !== null && (
        <Card size="small" title="Confirma los valores reales del producto">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={`Se encontraron ${candidatosActuales.length} interpretación(es) posible(s). Confirma los valores REALES del producto.`}
            />
            <Form layout="inline">
              <Form.Item label="PLU real">
                <InputNumber
                  value={pluConfirmado ?? undefined}
                  onChange={v => setPluConfirmado(v ?? null)}
                  min={1}
                  placeholder="Ej: 12345"
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="Valor real">
                <InputNumber
                  value={valorConfirmado ?? undefined}
                  onChange={v => setValorConfirmado(v ?? null)}
                  min={0.001}
                  step={0.001}
                  placeholder="Ej: 4.500"
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="Tipo">
                <Select
                  value={tipoDatoConfirmado}
                  onChange={setTipoDatoConfirmado}
                  style={{ width: 100 }}
                >
                  <Option value="peso">Peso</Option>
                  <Option value="precio">Precio</Option>
                </Select>
              </Form.Item>
            </Form>
            <Button
              type="primary"
              loading={loadingFiltrar}
              disabled={pluConfirmado == null || valorConfirmado == null}
              onClick={confirmarEtiqueta}
              icon={<ArrowRightOutlined />}
            >
              Confirmar etiqueta {numEtiqueta}
            </Button>
          </Space>
        </Card>
      )}

      {etiquetas.length > 0 && (
        <Card size="small" title="Etiquetas capturadas" style={{ background: '#f6f8ff' }}>
          {etiquetas.map((e, i) => (
            <Space key={i} style={{ display: 'flex', marginBottom: 4 }}>
              <Tag color="blue">#{i + 1}</Tag>
              <Text code style={{ fontSize: 12 }}>{e.codigo}</Text>
              <Tag>PLU {e.plu}</Tag>
              <Tag color={e.tipoDato === 'peso' ? 'cyan' : 'purple'}>
                {e.tipoDato === 'peso' ? `${e.valor.toFixed(3)} kg` : `$${e.valor.toFixed(2)}`}
              </Tag>
              <Tag>{e.candidatos.length} candidato(s)</Tag>
            </Space>
          ))}
          {etiquetas.length >= 2 && (
            <Divider style={{ margin: '8px 0' }} />
          )}
          {etiquetas.length >= 2 && (
            <Space>
              <Text type={interseccion.length === 1 ? 'success' : 'warning'}>
                Intersección: {interseccion.length} candidato(s)
              </Text>
            </Space>
          )}
        </Card>
      )}
    </Space>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {!isAdmin && (
        <Alert
          type="warning"
          showIcon
          message="Solo ADMIN y CONTADOR pueden guardar patrones. Puedes usar el asistente para analizar, pero no para guardar."
        />
      )}

      <Steps
        current={Math.min(paso, 2)}
        items={[
          { title: 'Etiqueta 1', description: 'Escanear y confirmar' },
          { title: 'Etiqueta 2', description: 'Diferente peso/precio' },
          { title: 'Resultado', description: 'Patrón identificado' },
        ]}
        size="small"
      />

      {paso === 0 && (
        <Card size="small">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Title level={5} style={{ margin: 0 }}>¿Cómo funciona el asistente?</Title>
            <Paragraph>
              Escanea <Text strong>dos etiquetas con pesos distintos</Text> del mismo producto
              (o productos diferentes de la misma balanza). El asistente descubrirá
              automáticamente la geometría del código — prefijo, longitud PLU, longitud del valor,
              decimales y si tiene verificador interno.
            </Paragraph>
            <Alert
              type="info"
              showIcon
              message="Una sola etiqueta no es suficiente"
              description="Varias combinaciones de prefijo y longitud pueden coincidir con una sola etiqueta por casualidad. Con dos etiquetas de pesos diferentes solo sobrevive el patrón real."
            />
            <Button type="primary" onClick={() => setPaso(1)}>
              Comenzar asistente <ArrowRightOutlined />
            </Button>
          </Space>
        </Card>
      )}

      {(paso === 1 || paso === 2 || (paso > 2 && interseccion.length > 1)) && (
        <Card
          size="small"
          title={
            paso <= 2
              ? `Etiqueta ${numEtiqueta} de ${paso <= 2 ? 2 : numEtiqueta} — peso/precio DIFERENTE al anterior`
              : `Etiqueta ${numEtiqueta} — desambiguación (${interseccion.length} candidatos restantes)`
          }
        >
          <EtiquetaForm />
        </Card>
      )}

      {paso === 3 && (
        <Card
          size="small"
          title={
            interseccion.length === 1
              ? '✅ Patrón identificado'
              : interseccion.length === 0
                ? '❌ Sin candidatos comunes'
                : `⚠️ Ambigüedad — ${interseccion.length} candidatos`
          }
        >
          {interseccion.length === 0 && (
            <Space direction="vertical">
              <Alert
                type="error"
                showIcon
                message="No se encontró ningún patrón que funcione con ambas etiquetas"
                description="Es posible que las etiquetas sean de balanzas con modelos incompatibles, o que los valores confirmados sean incorrectos."
              />
              <Button onClick={reset}>Reintentar</Button>
            </Space>
          )}

          {interseccion.length > 1 && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                message={`Quedan ${interseccion.length} candidatos. Añade más etiquetas para desambiguar.`}
              />
              <Table
                dataSource={interseccion}
                rowKey={candidatoKey}
                size="small"
                pagination={false}
                columns={[
                  { title: 'Pref.', dataIndex: 'prefijo' },
                  { title: 'PLU', dataIndex: 'longitudPlu' },
                  { title: 'Tipo', dataIndex: 'tipoDato' },
                  { title: 'Valor', dataIndex: 'longitudValor' },
                  { title: 'Dec.', dataIndex: 'decimalesValor' },
                  { title: 'Chk', dataIndex: 'tieneCheckValor', render: (v: boolean) => v ? '✓' : '—' },
                  { title: 'Long.', dataIndex: 'longitudTotal' },
                ]}
              />
              <Button onClick={() => setPaso(paso + 1)} type="default">
                Escanear otra etiqueta <ArrowRightOutlined />
              </Button>
            </Space>
          )}

          {interseccion.length === 1 && (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {(() => {
                const c = interseccion[0];
                return (
                  <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                    <Space wrap>
                      <Tag>Prefijo: <Text strong>{c.prefijo}</Text></Tag>
                      <Tag>PLU: <Text strong>{c.longitudPlu} dígitos</Text></Tag>
                      <Tag color={c.tipoDato === 'peso' ? 'cyan' : 'purple'}>
                        {c.tipoDato === 'peso' ? 'Peso' : 'Precio'}: {c.longitudValor} dígitos, {c.decimalesValor} dec.
                      </Tag>
                      <Tag color={c.tieneCheckValor ? 'gold' : 'default'}>
                        {c.tieneCheckValor ? '✓ Check interno' : 'Sin check interno'}
                      </Tag>
                      <Tag>EAN-{c.longitudTotal}</Tag>
                    </Space>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text code style={{ fontSize: 12 }}>
                      Geometría: {geometriaLabel(c)}
                    </Text>
                  </Card>
                );
              })()}

              {isAdmin ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form layout="inline">
                    <Form.Item label="Nombre del patrón" required>
                      <Input
                        value={nombrePatron}
                        onChange={e => setNombrePatron(e.target.value)}
                        placeholder="Ej: Mettler Toledo estándar"
                        style={{ width: 280 }}
                        maxLength={100}
                      />
                    </Form.Item>
                    {interseccion[0]?.tipoDato === 'peso' && (
                      <Form.Item label="Unidad">
                        <Select
                          value={unidadPesoPatron}
                          onChange={setUnidadPesoPatron}
                          style={{ width: 80 }}
                        >
                          <Option value="KG">KG</Option>
                          <Option value="LB">LB</Option>
                          <Option value="G">G</Option>
                        </Select>
                      </Form.Item>
                    )}
                  </Form>
                  <Space>
                    <Button
                      type="primary"
                      loading={loadingGuardar}
                      disabled={!nombrePatron.trim()}
                      onClick={guardarPatron}
                      icon={<CheckCircleOutlined />}
                    >
                      Guardar patrón
                    </Button>
                    <Button onClick={reset}>
                      Descartar y reiniciar
                    </Button>
                  </Space>
                </Space>
              ) : (
                <Alert
                  type="info"
                  message="Patrón identificado — pide a un ADMIN o CONTADOR que lo guarde."
                />
              )}
            </Space>
          )}
        </Card>
      )}

      {paso > 0 && paso < 3 && (
        <Button danger onClick={reset} size="small">
          Cancelar asistente
        </Button>
      )}
    </Space>
  );
}

// ── Tab 4: Productos sin configurar ─────────────────────────────────────────

function TabSinConfigurar() {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['balanza-productos-sin-configurar'],
    queryFn: balanzaApi.productosSinConfigurar,
  });

  const sinPlu = data.filter(p => p.sinPlu);
  const conAdvertencia = data.filter(p => !p.sinPlu && p.advertenciaUnidad);

  const columns = [
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 100 },
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' },
    { title: 'Unidad', dataIndex: 'unidadMedida', key: 'unidadMedida', width: 80 },
    {
      title: 'PLU',
      dataIndex: 'plu',
      key: 'plu',
      width: 80,
      render: (v: number | null) => v ?? <Tag color="warning">Sin PLU</Tag>,
    },
    {
      title: 'Estado',
      key: 'estado',
      render: (_: any, r: ProductoSinConfig) => {
        if (r.sinPlu) return <Tag color="error" icon={<WarningOutlined />}>Sin PLU asignado</Tag>;
        if (r.advertenciaUnidad) return (
          <Tooltip title={r.advertenciaUnidad}>
            <Tag color="warning" icon={<WarningOutlined />}>Unidad inválida</Tag>
          </Tooltip>
        );
        return <Tag color="success">OK</Tag>;
      },
    },
  ];

  if (isLoading) return <Spin />;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          {sinPlu.length > 0 && (
            <Badge count={sinPlu.length} color="red">
              <Tag color="error">Sin PLU</Tag>
            </Badge>
          )}
          {conAdvertencia.length > 0 && (
            <Badge count={conAdvertencia.length} color="orange">
              <Tag color="warning">Unidad inválida</Tag>
            </Badge>
          )}
          {data.length === 0 && (
            <Tag color="success">✅ Todos los productos pesables están correctamente configurados</Tag>
          )}
        </Space>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>Actualizar</Button>
      </div>

      {data.length > 0 && (
        <>
          <Alert
            type="info"
            showIcon
            message="Cómo resolver"
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>
                  <Text strong>Sin PLU:</Text> abre el producto en Inventario → Productos, activa
                  la opción «Pesable» y asigna el número PLU de la balanza.
                </li>
                <li>
                  <Text strong>Unidad inválida:</Text> la unidad de medida del producto no está en
                  el catálogo UOM como tipo «peso» con decimales. Corrige la unidad del producto o
                  registra la unidad en el catálogo.
                </li>
              </ul>
            }
          />
          <Table
            dataSource={data}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            rowClassName={(r: ProductoSinConfig) =>
              r.sinPlu ? 'ant-table-row-danger' : r.advertenciaUnidad ? 'ant-table-row-warning' : ''
            }
          />
        </>
      )}
    </Space>
  );
}

// ── Tab 5: Formatos de exportación ───────────────────────────────────────────

function TabFormatos({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const { data: formatos = [], isLoading } = useQuery({
    queryKey: ['balanza-formatos'],
    queryFn: balanzaApi.listarFormatos,
  });

  const crear = useMutation({
    mutationFn: (vals: any) =>
      balanzaApi.crearFormato({
        nombre: vals.nombre,
        separador: vals.separador,
        columnas: [],
      }),
    onSuccess: () => {
      message.success('Formato creado');
      setModalVisible(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['balanza-formatos'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const eliminar = useMutation({
    mutationFn: balanzaApi.eliminarFormato,
    onSuccess: () => {
      message.success('Formato eliminado');
      qc.invalidateQueries({ queryKey: ['balanza-formatos'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const columns = [
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre' },
    {
      title: 'Separador',
      dataIndex: 'separador',
      key: 'separador',
      width: 100,
      render: (v?: string) => v ? <Text code>{v}</Text> : '—',
    },
    {
      title: 'Columnas',
      dataIndex: 'columnas',
      key: 'columnas',
      render: (cols: Formato['columnas']) => cols?.length ?? 0,
      width: 80,
    },
    ...(isAdmin ? [{
      title: '',
      key: 'acciones',
      width: 60,
      render: (_: any, r: Formato) => (
        <Popconfirm
          title="¿Eliminar este formato?"
          onConfirm={() => eliminar.mutate(r.id)}
          okText="Sí" cancelText="No"
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }] : []),
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="Exportación de catálogo"
        description="Define formatos de archivo para exportar el catálogo de productos a la balanza. La exportación de archivos se implementará en la siguiente versión."
        style={{ marginBottom: 12 }}
      />
      {isAdmin && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
          style={{ marginBottom: 12 }}
        >
          Nuevo formato
        </Button>
      )}
      <Table
        dataSource={formatos}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="Sin formatos configurados" /> }}
      />
      <Modal
        title="Nuevo formato de exportación"
        open={modalVisible}
        footer={null}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={crear.mutate}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
            <Input placeholder="Ej: Dibal G-300 CSV" maxLength={100} />
          </Form.Item>
          <Form.Item name="separador" label="Separador de campos">
            <Select allowClear placeholder="Vacío = longitud fija">
              <Option value=",">,  (coma)</Option>
              <Option value=";">; (punto y coma)</Option>
              <Option value="|">| (barra)</Option>
              <Option value="\t">TAB</Option>
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={crear.isPending} block>
            Crear formato
          </Button>
        </Form>
      </Modal>
    </>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SeccionBalanza() {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'contador';

  const { data: sinConfigurar = [] } = useQuery({
    queryKey: ['balanza-productos-sin-configurar'],
    queryFn: balanzaApi.productosSinConfigurar,
    staleTime: 60_000,
  });

  const totalProblemas = sinConfigurar.length;

  const items = [
    {
      key: 'probador',
      label: <><ScanOutlined /> Probador</>,
      children: <TabProbador />,
    },
    {
      key: 'patrones',
      label: 'Patrones',
      children: <TabPatrones isAdmin={isAdmin} />,
    },
    {
      key: 'asistente',
      label: 'Asistente de calibración',
      children: <TabAsistente isAdmin={isAdmin} />,
    },
    {
      key: 'sin-configurar',
      label: (
        <Badge count={totalProblemas} size="small" offset={[6, -2]}>
          Productos
        </Badge>
      ),
      children: <TabSinConfigurar />,
    },
    {
      key: 'formatos',
      label: 'Formatos de exportación',
      children: <TabFormatos isAdmin={isAdmin} />,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>Balanzas etiquetadoras</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Configura los patrones de decodificación de etiquetas EAN-13 / UPC-A generadas por balanzas.
        El Probador y el Asistente están disponibles para todos los roles.
        Crear y editar patrones requiere rol ADMIN o CONTADOR.
      </Text>
      <Tabs items={items} defaultActiveKey="probador" destroyInactiveTabPane={false} />
    </div>
  );
}
