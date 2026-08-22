import { useState, useRef } from 'react';
import {
  Row, Col, Input, Button, Table, Card, Form, Select, InputNumber,
  Typography, Divider, Tag, Space, Modal, message, DatePicker,
} from 'antd';
import {
  ShoppingCartOutlined, DeleteOutlined, PrinterOutlined,
  SearchOutlined, BarcodeOutlined, MedicineBoxOutlined, FileExcelOutlined, PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { farmaciaApi } from '../../api/farmacia.api';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

interface CartItem {
  medicamentoId: number;
  nombreGenerico: string;
  concentracion?: string;
  forma?: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  instrucciones?: string;
  requiereReceta?: boolean;
  recetaVerificada?: boolean;
  loteId?: number;
  numeroLote?: string;
  fechaVencimiento?: string;
  total: number;
}

export default function DispensacionPage() {
  const qc = useQueryClient();
  const barcodeRef = useRef<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCedula, setClienteCedula] = useState('');
  const [recetaMedico, setRecetaMedico] = useState('');
  const [recetaNumero, setRecetaNumero] = useState('');
  const [arsNombre, setArsNombre] = useState('');
  const [arsAfiliado, setArsAfiliado] = useState('');
  const [autorizacionArs, setAutorizacionArs] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [montoCubierto, setMontoCubierto] = useState(0);
  const [farmaceutico, setFarmaceutico] = useState('');
  const [recetaFecha, setRecetaFecha] = useState<any>(null);
  const [notas, setNotas] = useState('');
  const [modalMed, setModalMed] = useState(false);
  const [selectedMed, setSelectedMed] = useState<any>(null);
  const [cantForm] = Form.useForm();

  const { data: busquedaData, isFetching: buscando } = useQuery({
    queryKey: ['farmacia-search', search],
    queryFn: () => farmaciaApi.medicamentos({ search, limit: 10 }),
    enabled: search.length >= 2,
  });

  const dispensar = useMutation({
    mutationFn: (b: any) => farmaciaApi.crearDispensacion(b),
    onSuccess: async (disp) => {
      qc.invalidateQueries({ queryKey: ['farmacia-dashboard'] });
      setCart([]);
      setClienteNombre(''); setClienteCedula(''); setRecetaMedico(''); setRecetaNumero('');
      setArsNombre(''); setArsAfiliado(''); setAutorizacionArs(''); setMontoCubierto(0); setDescuentoGlobal(0); setRecetaFecha(null); setNotas('');
      // Abrir PDF en nueva pestaña
      const blob = await farmaciaApi.pdfDispensacion(disp.id).then(r => r.data);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      message.success(`Dispensación ${disp.numero} creada`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al dispensar'),
  });

  const agregarMed = (med: any) => {
    setSelectedMed(med);
    cantForm.setFieldsValue({ cantidad: 1, descuento: 0, instrucciones: '', recetaVerificada: false });
    setModalMed(true);
  };

  const confirmarAgregar = () => {
    cantForm.validateFields().then(v => {
      const total = Number(v.cantidad) * Number(selectedMed.precioVenta) * (1 - (v.descuento ?? 0) / 100);
      setCart(prev => {
        const idx = prev.findIndex(i => i.medicamentoId === selectedMed.id);
        if (idx >= 0) {
          const upd = [...prev];
          upd[idx] = { ...upd[idx], cantidad: upd[idx].cantidad + v.cantidad, total: upd[idx].total + total };
          return upd;
        }
        return [...prev, {
          medicamentoId: selectedMed.id,
          nombreGenerico: selectedMed.nombreGenerico,
          concentracion: selectedMed.concentracion,
          forma: selectedMed.forma,
          cantidad: v.cantidad,
          precioUnitario: Number(selectedMed.precioVenta),
          descuento: v.descuento ?? 0,
          instrucciones: v.instrucciones,
          requiereReceta: selectedMed.requiereReceta,
          recetaVerificada: v.recetaVerificada ?? false,
          total,
        }];
      });
      setModalMed(false);
      setSearch('');
    });
  };

  const buscarBarra = async (codigo: string) => {
    if (!codigo.trim()) return;
    try {
      const med = await farmaciaApi.buscarBarra(codigo.trim());
      agregarMed(med);
    } catch {
      message.error('Medicamento no encontrado');
    }
  };

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal - descuentoGlobal - montoCubierto;

  const confirmarDispensacion = () => {
    if (!cart.length) { message.warning('Agrega medicamentos al carrito'); return; }
    dispensar.mutate({
      clienteNombre: clienteNombre || null,
      clienteCedula: clienteCedula || null,
      recetaMedico: recetaMedico || null,
      recetaNumero: recetaNumero || null,
      recetaFecha: recetaFecha ? dayjs(recetaFecha).format('YYYY-MM-DD') : null,
      arsNombre: arsNombre || null,
      arsNumeroAfiliado: arsAfiliado || null,
      autorizacionArs: autorizacionArs || null,
      farmaceuticoNombre: farmaceutico || null,
      descuento: descuentoGlobal,
      montoCubierto,
      metodoPago,
      notas: notas || null,
      items: cart.map(i => ({
        medicamentoId: i.medicamentoId,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        descuento: i.descuento,
        instrucciones: i.instrucciones,
        requeriReceta: i.requiereReceta,
        recetaVerificada: i.recetaVerificada,
      })),
    });
  };

  const cartColumns = [
    { title: 'Medicamento', dataIndex: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
    { title: 'Cant.', dataIndex: 'cantidad', width: 60 },
    { title: 'P.Unit', dataIndex: 'precioUnitario', width: 90, render: (v: number) => `RD$ ${v.toFixed(2)}` },
    { title: 'Desc%', dataIndex: 'descuento', width: 65, render: (v: number) => v > 0 ? `${v}%` : '-' },
    { title: 'Total', dataIndex: 'total', width: 100, render: (v: number) => `RD$ ${v.toFixed(2)}` },
    {
      title: '', key: 'del', width: 40,
      render: (_: any, r: any) => (
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => setCart(prev => prev.filter(i => i.medicamentoId !== r.medicamentoId))} />
      ),
    },
  ];

  const exportarCarrito = () => {
    const filas = cart.map((r: any) => ({
      'Medicamento': `${r.nombreGenerico} ${r.concentracion ?? ''}`,
      'Cantidad': r.cantidad,
      'Precio Unitario': r.precioUnitario,
      'Descuento %': r.descuento,
      'Total': r.total,
    }));
    exportarExcel(filas, `Dispensacion-${hoyRD()}`);
    message.success(`${filas.length} ítems exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          <ShoppingCartOutlined style={{ marginRight: 8 }} />Dispensación — POS
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportarCarrito}>Excel</Button>
          <RefreshByKeyButton queryKey={['farmacia-dispensacion']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCart([])}>Nueva Dispensación</Button>
        </div>
      </div>

      <Row gutter={16}>
        {/* Panel izquierdo: búsqueda */}
        <Col xs={24} lg={14}>
          <Card title="Buscar Medicamento" size="small" style={{ marginBottom: 12 }}>
            <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
              <Input
                ref={barcodeRef}
                prefix={<BarcodeOutlined />}
                placeholder="Escanear código de barra o Enter"
                onPressEnter={(e) => { buscarBarra((e.target as any).value); (e.target as any).value = ''; }}
                style={{ width: '60%' }}
              />
              <Input.Search
                prefix={<SearchOutlined />}
                placeholder="Buscar por nombre..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                loading={buscando}
                style={{ width: '40%' }}
                onSearch={() => {}}
                allowClear
              />
            </Space.Compact>
            {search.length >= 2 && (
              <Table
                dataSource={busquedaData?.data ?? []}
                rowKey="id"
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={false}
                columns={[
                  { title: 'Medicamento', render: (_: any, r: any) => `${r.nombreGenerico} ${r.concentracion ?? ''} (${r.forma ?? ''})` },
                  { title: 'Stock', dataIndex: 'stockActual', width: 70, render: (v: number) => <Tag color={v === 0 ? 'error' : v <= 5 ? 'warning' : 'success'}>{v}</Tag> },
                  { title: 'Precio', dataIndex: 'precioVenta', width: 100, render: (v: number) => `RD$ ${Number(v).toFixed(2)}` },
                  {
                    title: '', key: 'add', width: 60,
                    render: (_: any, r: any) => <Button type="primary" size="small" icon={<MedicineBoxOutlined />} disabled={r.stockActual === 0} onClick={() => agregarMed(r)}>+</Button>,
                  },
                ]}
              />
            )}
          </Card>

          {/* Datos del cliente / receta */}
          <Card title="Datos de Dispensación" size="small">
            <Row gutter={8}>
              <Col span={12}><Input placeholder="Nombre del paciente" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="Cédula" value={clienteCedula} onChange={e => setClienteCedula(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="Médico de receta" value={recetaMedico} onChange={e => setRecetaMedico(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="N° Receta" value={recetaNumero} onChange={e => setRecetaNumero(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><DatePicker placeholder="Fecha receta" value={recetaFecha} onChange={setRecetaFecha} format="DD/MM/YYYY" style={{ width: '100%', marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="ARS / Seguro" value={arsNombre} onChange={e => setArsNombre(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="N° Afiliado ARS" value={arsAfiliado} onChange={e => setArsAfiliado(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="Autorización ARS" value={autorizacionArs} onChange={e => setAutorizacionArs(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={12}><Input placeholder="Farmacéutico" value={farmaceutico} onChange={e => setFarmaceutico(e.target.value)} style={{ marginBottom: 8 }} /></Col>
              <Col span={24}><Input.TextArea placeholder="Notas adicionales" value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ marginBottom: 8 }} /></Col>
            </Row>
          </Card>
        </Col>

        {/* Panel derecho: carrito + totales */}
        <Col xs={24} lg={10}>
          <Card title={<Space><ShoppingCartOutlined />Carrito ({cart.length})</Space>} size="small">
            <Table
              dataSource={cart}
              columns={cartColumns}
              rowKey="medicamentoId"
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'Carrito vacío' }}
            />
            <Divider style={{ margin: '12px 0' }} />

            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Subtotal:</Text>
                <Text strong>RD$ {subtotal.toFixed(2)}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>Descuento:</Text>
                <InputNumber min={0} value={descuentoGlobal} onChange={v => setDescuentoGlobal(Number(v ?? 0))} prefix="RD$" precision={2} size="small" style={{ width: 130 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>Cubierto ARS:</Text>
                <InputNumber min={0} value={montoCubierto} onChange={v => setMontoCubierto(Number(v ?? 0))} prefix="RD$" precision={2} size="small" style={{ width: 130 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>ITBIS (Exento):</Text>
                <Text>RD$ 0.00</Text>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 16 }}>TOTAL:</Text>
                <Text strong style={{ fontSize: 18, color: '#1677ff' }}>RD$ {total.toFixed(2)}</Text>
              </div>

              <Select
                value={metodoPago}
                onChange={setMetodoPago}
                style={{ width: '100%', marginTop: 8 }}
                options={[
                  { value: 'efectivo', label: 'Efectivo' },
                  { value: 'tarjeta', label: 'Tarjeta' },
                  { value: 'transferencia', label: 'Transferencia' },
                  { value: 'credito', label: 'Crédito' },
                  { value: 'ars', label: 'ARS' },
                ]}
              />

              <Button
                type="primary"
                block
                size="large"
                icon={<PrinterOutlined />}
                onClick={confirmarDispensacion}
                loading={dispensar.isPending}
                disabled={cart.length === 0}
                style={{ marginTop: 8 }}
              >
                Dispensar e Imprimir Recibo
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Modal cantidad al agregar */}
      <Modal
        open={modalMed}
        title={selectedMed ? `${selectedMed.nombreGenerico} ${selectedMed.concentracion ?? ''}` : ''}
        onCancel={() => setModalMed(false)}
        onOk={confirmarAgregar}
        destroyOnClose
      >
        {selectedMed?.requiereReceta && (
          <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            <Text type="warning">Este medicamento requiere receta médica verificada</Text>
          </div>
        )}
        <Form form={cantForm} layout="vertical">
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]} initialValue={1}>
            <InputNumber min={1} max={selectedMed?.stockActual ?? 1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="descuento" label="Descuento %" initialValue={0}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="instrucciones" label="Instrucciones al paciente">
            <Input.TextArea rows={2} placeholder="ej: Tomar 1 tableta cada 8 horas con alimentos" />
          </Form.Item>
          {selectedMed?.requiereReceta && (
            <Form.Item name="recetaVerificada" valuePropName="checked" label="Receta verificada">
              <input type="checkbox" />
            </Form.Item>
          )}
        </Form>
        <div style={{ textAlign: 'right' }}>
          <Text type="secondary">Stock disponible: <strong>{selectedMed?.stockActual ?? 0}</strong></Text>
          <br />
          <Text type="secondary">Precio: <strong>RD$ {Number(selectedMed?.precioVenta ?? 0).toFixed(2)}</strong></Text>
        </div>
      </Modal>
    </div>
  );
}
