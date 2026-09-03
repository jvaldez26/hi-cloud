import { useState, useEffect, useCallback } from 'react';
import {
  Select, Modal, Form, Input, Button, Row, Col, Divider, Alert, Spin, message, theme,
} from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientesApi, type ClientesConMismoRnc } from '../../api/clientes.api';
import { useRncLookup } from '../../hooks/useRncLookup';
import RncBadge from '../ui/RncBadge';
import api from '../../api/client';
import type { Cliente } from '../../types';

/**
 * Selector de cliente que además permite darlo de alta sin salir de la pantalla.
 *
 * Sale del formulario de facturas, que ya lo resolvía; se extrae para que
 * cotización —y mañana el POS, que hoy no tiene alta ninguna— usen el mismo y no
 * acabemos con tres modales distintos para lo mismo.
 *
 * ── RNC repetido ───────────────────────────────────────────────────────────
 * Compartir RNC es legítimo: las escuelas de un mismo distrito educativo
 * facturan todas bajo el del distrito. Por eso el backend NO bloquea el RNC
 * repetido (solo mismo RNC Y mismo nombre entre activos).
 *
 * Pero el alta rápida de facturas no lo comprobaba: tecleabas un RNC que ya
 * tenían tres escuelas y creaba la cuarta sin decir nada y sin razón social. Eso
 * es justo lo que rompe el e-CF, porque ante la DGII un RNC identifica UN
 * contribuyente y todos los que lo comparten tienen que declarar la MISMA razón
 * social — ya pasó que tres clientes del RNC 132269551 declararan tres distintas
 * porque el campo se dejó vacío y cayó al nombre interno.
 *
 * Así que aquí, en cuanto el RNC tecleado ya lo usa alguien:
 *   1. se enseñan los que existen, con su dirección, para poder elegirlos —
 *      lo más probable es que el cliente ya esté y no haya que crear nada;
 *   2. si de verdad es otro, la razón social pasa a ser obligatoria y se
 *      precarga con la del grupo cuando todos declaran la misma.
 */

export interface SelectClienteConAltaProps {
  /** id del cliente seleccionado — lo inyecta Form.Item */
  value?: number;
  onChange?: (id: number) => void;
  /** Se dispara con el cliente completo: al elegirlo y al crearlo */
  onClienteSeleccionado?: (cli: Cliente | null) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function SelectClienteConAlta({
  value,
  onChange,
  onClienteSeleccionado,
  placeholder = 'Buscar por nombre o RNC...',
  disabled,
  style,
}: SelectClienteConAltaProps) {
  const { token } = theme.useToken();
  const qc = useQueryClient();

  const [abierto, setAbierto]   = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [form] = Form.useForm();
  const rnc = useRncLookup();

  // Misma queryKey que usan las pantallas que lo montan: comparten caché
  const { data: clientes } = useQuery({
    queryKey: ['clientes-sel'],
    queryFn:  () => clientesApi.list(1, 100),
  });

  const esPatronRnc = /^\d{9}$|^\d{11}$/.test(busqueda);
  const yaExisteEseRnc = esPatronRnc
    ? clientes?.data.find((c: Cliente) => c.rfc === busqueda)
    : null;

  // Auto-consulta al padrón cuando se teclea un RNC que no tenemos
  const { data: dgii, isFetching: buscandoDgii } = useQuery<any>({
    queryKey: ['dgii-rnc-cliente', busqueda],
    queryFn:  () => api.get(`/rnc/consultar?rnc=${encodeURIComponent(busqueda)}`)
      .then(r => r.data?.data ?? r.data),
    enabled:   esPatronRnc && !yaExisteEseRnc,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ── Quién más usa este RNC ────────────────────────────────────────────────
  const [grupoRnc, setGrupoRnc] = useState<ClientesConMismoRnc | null>(null);
  const [forzarNuevo, setForzarNuevo] = useState(false);

  const consultarGrupo = useCallback(async (valor: string) => {
    const limpio = (valor ?? '').replace(/\D/g, '');
    if (limpio.length !== 9 && limpio.length !== 11) { setGrupoRnc(null); return; }
    try {
      const res = await clientesApi.buscarPorRnc(limpio);
      setGrupoRnc(res.total > 0 ? res : null);
      // Con el RNC compartido la razón social deja de ser opcional. Se precarga
      // con la del grupo cuando es una sola, para que sea un enter y no una
      // decisión.
      if (res.total > 0 && !(form.getFieldValue('razonSocial') ?? '').trim()) {
        const definidas = new Set(
          res.clientes.map(c => (c.razonSocial ?? '').trim()).filter(Boolean),
        );
        if (definidas.size === 1) form.setFieldsValue({ razonSocial: [...definidas][0] });
      }
    } catch { setGrupoRnc(null); }
  }, [form]);

  const rncCompartido = !!grupoRnc && grupoRnc.total > 0;

  // Autocompletar el nombre desde el padrón
  useEffect(() => {
    if (rnc.datos?.encontrado && rnc.datos.nombre) {
      if (!(form.getFieldValue('nombre') ?? '').trim()) {
        form.setFieldsValue({ nombre: rnc.datos.nombre });
      }
    }
  }, [rnc.datos, form]);

  const seleccionar = (cli: Cliente) => {
    onChange?.(cli.id);
    onClienteSeleccionado?.(cli);
  };

  const cerrarModal = () => {
    setAbierto(false);
    setGrupoRnc(null);
    setForzarNuevo(false);
    form.resetFields();
    rnc.limpiar();
  };

  const crearMut = useMutation({
    mutationFn: (body: any) => clientesApi.create(body),
    onSuccess: (cli: any) => {
      qc.invalidateQueries({ queryKey: ['clientes-sel'] });
      seleccionar(cli);
      message.success(`Cliente "${cli.nombre}" creado y seleccionado`);
      cerrarModal();
    },
    onError: (e: any) => message.error(
      e?.friendlyMessage ?? e?.response?.data?.message ?? 'Error al crear cliente',
    ),
  });

  const abrirModal = (precarga: { rfc?: string; nombre?: string }) => {
    form.setFieldsValue(precarga);
    setAbierto(true);
    if (precarga.rfc) void consultarGrupo(precarga.rfc);
  };

  /** Usar uno de los que ya existen con ese RNC */
  const usarExistente = (id: number) => {
    const cli = clientes?.data.find((c: Cliente) => c.id === id);
    if (cli) { seleccionar(cli); cerrarModal(); return; }
    // No estaba en la página cargada: se pide y se selecciona igual
    clientesApi.getOne(id)
      .then(c => { seleccionar(c as Cliente); cerrarModal(); })
      .catch(() => message.error('No se pudo cargar ese cliente'));
  };

  return (
    <>
      <Select
        showSearch
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        popupMatchSelectWidth={false}
        dropdownStyle={{ minWidth: 360 }}
        style={style}
        filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
        options={clientes?.data.map((c: Cliente) => ({
          value: c.id,
          // Con RNC compartido el nombre y el RNC no bastan para distinguirlos:
          // se agrega la dirección
          label: [
            c.rfc ? `${c.rfc} — ${c.nombre}` : c.nombre,
            c.rncCompartido ? (c.direccion || c.ciudad || 'sin dirección') : '',
          ].filter(Boolean).join(' · '),
        }))}
        onChange={id => {
          onChange?.(id);
          onClienteSeleccionado?.(clientes?.data.find((c: Cliente) => c.id === id) ?? null);
        }}
        onSearch={setBusqueda}
        dropdownRender={menu => (
          <>
            {menu}
            <Divider style={{ margin: '4px 0' }} />
            {esPatronRnc && !yaExisteEseRnc ? (
              buscandoDgii ? (
                <div style={{ padding: '6px 12px', fontSize: 12, color: token.colorTextSecondary }}>
                  <Spin size="small" style={{ marginRight: 6 }} />Consultando DGII…
                </div>
              ) : dgii?.encontrado ? (
                <Button type="link" icon={<PlusOutlined />}
                  style={{ width: '100%', textAlign: 'left', paddingLeft: 12 }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => abrirModal({ rfc: busqueda, nombre: dgii.nombre })}>
                  {dgii.nombre} ({busqueda}) — Crear como cliente
                </Button>
              ) : dgii ? (
                <div style={{ padding: '4px 12px', fontSize: 11, color: token.colorTextSecondary }}>
                  RNC {busqueda} no encontrado en DGII
                </div>
              ) : null
            ) : busqueda.length >= 2 && !esPatronRnc ? (
              <Button type="link" icon={<PlusOutlined />}
                style={{ width: '100%', textAlign: 'left', paddingLeft: 12 }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => abrirModal({ nombre: busqueda })}>
                Crear &ldquo;{busqueda}&rdquo; como nuevo cliente
              </Button>
            ) : null}
          </>
        )}
      />

      <Modal
        title="Crear cliente rápido"
        open={abierto}
        onCancel={cerrarModal}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={vals => crearMut.mutate({
            rfc:           vals.rfc || undefined,
            nombre:        vals.nombre,
            razonSocial:   vals.razonSocial || undefined,
            telefono:      vals.telefono || undefined,
            email:         vals.email    || undefined,
            regimenFiscal: vals.regimenFiscal || undefined,
          })}
        >
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="rfc" label="RNC / Cédula"
                rules={[{
                  validator: (_, v) => {
                    if (!v) return Promise.resolve();
                    return /^\d{9}$|^\d{11}$/.test(v)
                      ? Promise.resolve()
                      : Promise.reject(new Error('9 dígitos (RNC) u 11 (Cédula)'));
                  },
                }]}>
                <Input
                  placeholder="9 u 11 dígitos"
                  maxLength={11}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    form.setFieldsValue({ rfc: v });
                    rnc.consultarDebounced(v);
                    setForzarNuevo(false);
                    void consultarGrupo(v);
                  }}
                />
              </Form.Item>
              {/* rncNuevo: nadie más lo usa todavía, así que este cliente fija la
                  razón social que heredarán los siguientes */}
              <RncBadge datos={rnc.datos} loading={rnc.loading} rncNuevo={!rncCompartido} />
            </Col>
            <Col span={14}>
              <Form.Item name="nombre" label="Nombre / Razón Social"
                rules={[{ required: true, message: 'El nombre es obligatorio' }]}>
                <Input autoFocus />
              </Form.Item>
            </Col>
          </Row>

          {/* ── Ese RNC ya lo usa alguien ──────────────────────────────────── */}
          {rncCompartido && !forzarNuevo && (
            <Alert
              type="warning"
              showIcon
              icon={<TeamOutlined />}
              style={{ marginBottom: 12 }}
              message={grupoRnc!.total === 1
                ? 'Ya hay un cliente con ese RNC'
                : `Ya hay ${grupoRnc!.total} clientes con ese RNC`}
              description={
                <div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Compartir RNC es normal —varias sucursales de un mismo
                    contribuyente—, pero comprueba que no sea uno de estos:
                  </div>
                  {grupoRnc!.clientes.map(cli => (
                    <div key={cli.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, padding: '4px 0', borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{cli.nombre}</div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                          {[cli.direccion, cli.ciudad, cli.telefono].filter(Boolean).join(' · ')
                            || 'sin dirección registrada'}
                        </div>
                      </div>
                      <Button size="small" type="primary" ghost
                        onClick={() => usarExistente(cli.id)}>
                        Usar este
                      </Button>
                    </div>
                  ))}
                  <Button type="link" size="small" style={{ paddingLeft: 0, marginTop: 4 }}
                    onClick={() => setForzarNuevo(true)}>
                    No, es un cliente distinto — crear uno nuevo
                  </Button>
                </div>
              }
            />
          )}

          {/* Con el RNC compartido la razón social deja de ser opcional: si se
              queda vacía, el backend cae al nombre interno y cada cliente
              declararía una razón social distinta con el mismo RNC. */}
          {rncCompartido && (
            <Form.Item
              name="razonSocial"
              label="Razón Social (la que se declara a DGII)"
              required
              extra="Todos los clientes que comparten un RNC deben declarar la misma."
              rules={[{
                validator: (_, v) => (v ?? '').trim()
                  ? Promise.resolve()
                  : Promise.reject(new Error('Obligatoria cuando el RNC ya lo usa otro cliente')),
              }]}>
              <Input placeholder="Razón social del contribuyente" />
            </Form.Item>
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input placeholder="(809) 000-0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email"
                rules={[{ type: 'email', message: 'Email inválido' }]}>
                <Input placeholder="correo@ejemplo.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="regimenFiscal" label="Régimen Fiscal">
            <Select allowClear>
              <Select.Option value="ORDINARIO">Ordinario</Select.Option>
              <Select.Option value="PST">PST — Pequeño contribuyente</Select.Option>
              <Select.Option value="RST">RST — Simplificado</Select.Option>
              <Select.Option value="EXENTO">Exento</Select.Option>
            </Select>
          </Form.Item>

          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message="Creación rápida — completa el resto de los datos en el módulo Clientes después." />

          <Row gutter={8} justify="end">
            <Col><Button onClick={cerrarModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit"
                loading={crearMut.isPending}
                icon={<PlusOutlined />}
                // Mientras no se diga "es otro cliente", el camino natural es
                // elegir uno de los que ya están
                disabled={rncCompartido && !forzarNuevo}>
                Crear y seleccionar
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
