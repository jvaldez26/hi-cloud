import { useState, useEffect } from 'react';
import { Form, InputNumber, Input, Select, Modal, Button, Tag, Spin, Popconfirm, message } from 'antd';
import { SendOutlined, DollarOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../../api/restaurante.api';
import type { ModoPOSProps } from './types';

const { Option } = Select;

const ESTADO_BG: Record<string, string> = {
  disponible: '#f6ffed', ocupada: '#e6f4ff', reservada: '#f9f0ff', limpieza: '#fff7e6', inactiva: '#f5f5f5',
};
const ESTADO_BORDER: Record<string, string> = {
  disponible: '#b7eb8f', ocupada: '#91caff', reservada: '#d3adf7', limpieza: '#ffd591', inactiva: '#d9d9d9',
};
const ESTADO_EMOJI: Record<string, string> = {
  disponible: '⬜', ocupada: '🟦', reservada: '🟣', limpieza: '🟡', inactiva: '⬛',
};

export default function RestaurantePOS({ palette }: ModoPOSProps) {
  const C = palette;
  const qc = useQueryClient();
  const [formCobro] = Form.useForm();
  const [formAbrir] = Form.useForm();

  const [areaActiva, setAreaActiva]               = useState<number | null>(null);
  const [mesaSel, setMesaSel]                     = useState<any>(null);
  const [catActiva, setCatActiva]                 = useState<number | null>(null);
  const [modalCobro, setModalCobro]               = useState(false);
  const [modalAbrir, setModalAbrir]               = useState(false);

  const { data: mapa = [], isLoading: loadingMapa } = useQuery({
    queryKey: ['pos-rs-mapa'],
    queryFn: restauranteApi.mapaMesas,
    refetchInterval: 15_000,
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['pos-rs-categorias'],
    queryFn: restauranteApi.listarCategorias,
  });

  const { data: menu = [] } = useQuery({
    queryKey: ['pos-rs-menu', catActiva],
    queryFn: () => restauranteApi.listarMenu({ categoriaId: catActiva, disponible: true }),
  });

  const { data: comanda, isLoading: loadingComanda } = useQuery({
    queryKey: ['pos-rs-comanda', mesaSel?.comandaActualId],
    queryFn: () => restauranteApi.obtenerComanda(mesaSel!.comandaActualId),
    enabled: !!mesaSel?.comandaActualId,
    refetchInterval: 10_000,
  });

  // Al montar: activar primera área
  useEffect(() => {
    if ((mapa as any[]).length > 0 && !areaActiva) {
      setAreaActiva((mapa as any[])[0]?.id);
    }
  }, [mapa, areaActiva]);

  // Al cargar categorías: activar primera
  useEffect(() => {
    if ((categorias as any[]).length > 0 && !catActiva) {
      setCatActiva((categorias as any[])[0]?.id);
    }
  }, [categorias, catActiva]);

  const invalidateMapa = () => qc.invalidateQueries({ queryKey: ['pos-rs-mapa'] });
  const invalidateComanda = () => qc.invalidateQueries({ queryKey: ['pos-rs-comanda', mesaSel?.comandaActualId] });

  const abrirComandaMut = useMutation({
    mutationFn: (b: any) => restauranteApi.abrirComanda(b),
    onSuccess: (cmd: any) => {
      invalidateMapa();
      setModalAbrir(false);
      formAbrir.resetFields();
      setMesaSel((prev: any) => prev ? { ...prev, estado: 'ocupada', comandaActualId: cmd.id, comandaNumero: cmd.numero } : null);
      message.success(`Comanda ${cmd.numero} abierta`);
    },
    onError: () => message.error('Error abriendo comanda'),
  });

  const agregarItemMut = useMutation({
    mutationFn: ({ itemMenu }: { itemMenu: any }) =>
      restauranteApi.agregarItem(mesaSel!.comandaActualId, {
        menuItemId: itemMenu.id, cantidad: 1, precioUnitario: itemMenu.precio,
      }),
    onSuccess: () => invalidateComanda(),
    onError: () => message.error('Error agregando ítem'),
  });

  const cancelarItemMut = useMutation({
    mutationFn: ({ itemId }: { itemId: number }) =>
      restauranteApi.cancelarItem(mesaSel!.comandaActualId, itemId, {}),
    onSuccess: () => invalidateComanda(),
    onError: () => message.error('Error cancelando ítem'),
  });

  const enviarCocinaMut = useMutation({
    mutationFn: () => restauranteApi.enviarACocina(mesaSel!.comandaActualId),
    onSuccess: () => { invalidateComanda(); message.success('Enviado a cocina'); },
    onError: () => message.error('Error enviando a cocina'),
  });

  const cobrarMut = useMutation({
    mutationFn: (b: any) => restauranteApi.cobrarComanda(mesaSel!.comandaActualId, b),
    onSuccess: (data: any) => {
      invalidateMapa();
      qc.removeQueries({ queryKey: ['pos-rs-comanda', mesaSel?.comandaActualId] });
      setModalCobro(false);
      setMesaSel(null);
      formCobro.resetFields();
      const folio = data?.facturaFolio ?? data?.data?.facturaFolio;
      message.success(folio ? `Factura ${folio} generada ✓` : 'Comanda cobrada exitosamente');
    },
    onError: () => message.error('Error cobrando comanda'),
  });

  const areaActual = (mapa as any[]).find((a: any) => a.id === areaActiva);
  const mesasDeArea: any[] = areaActual?.mesas ?? [];
  const items: any[] = ((comanda as any)?.items ?? []).filter((i: any) => !i.cancelado);
  const subtotal = Number((comanda as any)?.subtotal ?? 0);
  const itbis    = subtotal * 0.18;
  const pendientes = items.filter((i: any) => i.estadoCocina === 'pendiente').length;

  const handleSelectMesa = (mesa: any) => {
    if (mesa.estado === 'inactiva') return;
    setMesaSel(mesa);
    setModalAbrir(mesa.estado === 'disponible' || mesa.estado === 'reservada');
    if (mesa.estado === 'disponible' || mesa.estado === 'reservada') {
      formAbrir.setFieldsValue({ mesaId: mesa.id, numPersonas: 2 });
    }
  };

  const isDark = C.bg === '#080E1A';

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bg }}>

      {/* ── Panel izquierdo: Mapa de mesas ─────────────────────────────── */}
      <div style={{
        width: 230, flexShrink: 0, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Area tabs */}
        <div style={{ padding: '8px 8px 4px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
            🍽️ Áreas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(mapa as any[]).map((area: any) => (
              <button key={area.id} onClick={() => setAreaActiva(area.id)} style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: areaActiva === area.id ? (isDark ? 'rgba(59,130,246,.25)' : '#EFF6FF') : 'transparent',
                color: areaActiva === area.id ? C.blue : C.text, fontSize: 12, fontWeight: areaActiva === area.id ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: area.color ?? '#3b82f6', display: 'inline-block', flexShrink: 0 }} />
                {area.nombre}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textSub }}>({area.mesas?.length ?? 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mesas de área activa */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loadingMapa ? (
            <Spin size="small" style={{ display: 'block', margin: '20px auto' }} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {mesasDeArea.map((mesa: any) => (
                <div key={mesa.id} onClick={() => handleSelectMesa(mesa)} style={{
                  borderRadius: 8, border: `2px solid ${mesaSel?.id === mesa.id ? C.blue : ESTADO_BORDER[mesa.estado] ?? '#d9d9d9'}`,
                  background: mesaSel?.id === mesa.id ? (isDark ? 'rgba(59,130,246,.2)' : '#EFF6FF') : (isDark ? 'rgba(255,255,255,.04)' : ESTADO_BG[mesa.estado] ?? '#fff'),
                  padding: '6px 4px', cursor: mesa.estado === 'inactiva' ? 'not-allowed' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  opacity: mesa.estado === 'inactiva' ? 0.4 : 1, userSelect: 'none',
                  transition: 'border-color 0.12s',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{mesa.numero}</span>
                  <span style={{ fontSize: 12 }}>{ESTADO_EMOJI[mesa.estado]}</span>
                  {mesa.estado === 'ocupada' && (
                    <span style={{ fontSize: 9, color: C.textSub }}>{mesa.comandaNumero}</span>
                  )}
                  {mesa.minutosOcupada !== null && mesa.minutosOcupada !== undefined && (
                    <span style={{ fontSize: 9, color: Number(mesa.minutosOcupada) > 60 ? '#ef4444' : C.textSub }}>
                      {Math.round(Number(mesa.minutosOcupada))}m
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div style={{ padding: '6px 8px', borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[['disponible','⬜'],['ocupada','🟦'],['reservada','🟣']].map(([est, em]) => (
            <span key={est} style={{ fontSize: 9, color: C.textSub }}>{em} {est}</span>
          ))}
        </div>
      </div>

      {/* ── Panel derecho: Comanda + Menú ───────────────────────────────── */}
      {!mesaSel || mesaSel.estado === 'disponible' || mesaSel.estado === 'reservada' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.textSub }}>
          <div style={{ fontSize: 40 }}>🍽️</div>
          <div style={{ fontSize: 14, color: C.textSub }}>
            {mesaSel ? 'Abriendo comanda...' : 'Selecciona una mesa'}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header comanda */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: C.topbar }}>
            <button onClick={() => setMesaSel(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSub, fontSize: 18, lineHeight: 1 }}>←</button>
            <Tag color="blue">Mesa {mesaSel.numero}</Tag>
            {comanda && <Tag>{(comanda as any).numero}</Tag>}
            {comanda && <Tag color={(comanda as any).estado === 'cobrada' ? 'green' : 'default'}>{(comanda as any).estado?.replace(/_/g,' ')}</Tag>}
            <div style={{ flex: 1 }} />
            {comanda && (comanda as any).estado !== 'cobrada' && (
              <Button size="small" icon={<DollarOutlined />} type="primary" style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => { setModalCobro(true); formCobro.setFieldsValue({ metodoPago: 'efectivo', propina: 0 }); }}>
                Cobrar
              </Button>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Columna items comanda */}
            <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {loadingComanda ? <Spin size="small" style={{ display: 'block', margin: 16 }} /> :
                  items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: C.textSub, fontSize: 12 }}>Sin ítems aún</div>
                  ) : items.map((item: any) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 12 }}>
                      <span style={{ width: 18, textAlign: 'center', fontWeight: 700, color: C.text, flexShrink: 0 }}>{item.cantidad}</span>
                      <span style={{ flex: 1, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemNombre}</span>
                      <span style={{ color: C.blue, flexShrink: 0 }}>RD${Number(item.total ?? 0).toFixed(0)}</span>
                      {item.estadoCocina !== 'entregado' && (
                        <Popconfirm title="¿Cancelar ítem?" onConfirm={() => cancelarItemMut.mutate({ itemId: item.id })} okButtonProps={{ danger: true }} okText="Sí" cancelText="No">
                          <Button size="small" danger icon={<DeleteOutlined />} style={{ padding: '0 4px', height: 22, fontSize: 11 }} />
                        </Popconfirm>
                      )}
                    </div>
                  ))}
              </div>
              {/* Totales + Enviar a cocina */}
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 8px', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSub, marginBottom: 2 }}>
                  <span>Subtotal</span><span>RD${subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSub, marginBottom: 6 }}>
                  <span>ITBIS 18%</span><span>RD${itbis.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                  <span>Total</span><span style={{ color: '#10b981' }}>RD${(subtotal + itbis).toFixed(2)}</span>
                </div>
                {(comanda as any)?.estado !== 'cobrada' && (
                  <Button block icon={<SendOutlined />} size="small"
                    loading={enviarCocinaMut.isPending}
                    disabled={pendientes === 0}
                    onClick={() => enviarCocinaMut.mutate()}>
                    🍳 Enviar a Cocina {pendientes > 0 && `(${pendientes})`}
                  </Button>
                )}
              </div>
            </div>

            {/* Columna menú restaurante */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Categorías */}
              <div style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
                {(categorias as any[]).map((cat: any) => (
                  <button key={cat.id} onClick={() => setCatActiva(cat.id)} style={{
                    flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: catActiva === cat.id ? C.blue : (isDark ? 'rgba(255,255,255,.08)' : '#f1f5f9'),
                    color: catActiva === cat.id ? '#fff' : C.textSub, fontSize: 11, fontWeight: catActiva === cat.id ? 700 : 400,
                  }}>
                    {cat.icono ? `${cat.icono} ` : ''}{cat.nombre}
                  </button>
                ))}
              </div>
              {/* Items menú */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: 6, alignContent: 'start' }}>
                {(menu as any[]).map((item: any) => (
                  <div key={item.id} onClick={() => {
                    if (!item.disponible || (comanda as any)?.estado === 'cobrada') return;
                    agregarItemMut.mutate({ itemMenu: item });
                  }} style={{
                    borderRadius: 8, border: `1px solid ${C.border}`,
                    background: isDark ? 'rgba(255,255,255,.04)' : '#fff',
                    padding: '6px 5px', cursor: item.disponible && (comanda as any)?.estado !== 'cobrada' ? 'pointer' : 'not-allowed',
                    opacity: item.disponible ? 1 : 0.45, textAlign: 'center',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (item.disponible) (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,.1)' : '#f0f9ff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,.04)' : '#fff'; }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2, lineHeight: 1.2 }}>{item.nombre}</div>
                    <div style={{ fontSize: 11, color: C.blue }}>RD${Number(item.precio).toFixed(0)}</div>
                    {!item.disponible && <div style={{ fontSize: 9, color: '#ef4444' }}>AGOTADO</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Abrir comanda */}
      <Modal open={modalAbrir} title={`Abrir comanda — Mesa ${mesaSel?.numero}`}
        onCancel={() => { setModalAbrir(false); setMesaSel(null); }}
        onOk={() => formAbrir.validateFields().then(vals => abrirComandaMut.mutate(vals))}
        confirmLoading={abrirComandaMut.isPending} okText="Abrir" width={340}>
        <Form form={formAbrir} layout="vertical" size="small" initialValues={{ numPersonas: 2 }}>
          <Form.Item name="mesaId" hidden><Input /></Form.Item>
          <Form.Item name="numPersonas" label="Número de personas" rules={[{ required: true }]}>
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="meseroNombre" label="Mesero">
            <Input placeholder="Nombre del mesero" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Cobrar comanda */}
      <Modal open={modalCobro} title="Cobrar comanda"
        onCancel={() => setModalCobro(false)}
        onOk={() => formCobro.validateFields().then(vals => cobrarMut.mutate(vals))}
        confirmLoading={cobrarMut.isPending} okText="Confirmar cobro" width={340}>
        <Form form={formCobro} layout="vertical" size="small" initialValues={{ metodoPago: 'efectivo', propina: 0 }}>
          <div style={{ background: '#f6ffed', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span>RD${subtotal.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ITBIS:</span><span>RD${itbis.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4 }}><span>Total:</span><span>RD${(subtotal + itbis).toFixed(2)}</span></div>
          </div>
          <Form.Item name="metodoPago" label="Método de pago" rules={[{ required: true }]}>
            <Select>
              <Option value="efectivo">Efectivo</Option>
              <Option value="tarjeta">Tarjeta</Option>
              <Option value="transferencia">Transferencia</Option>
            </Select>
          </Form.Item>
          <Form.Item name="propina" label="Propina (RD$)">
            <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
