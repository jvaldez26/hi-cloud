import { useEffect, useState } from 'react';
import { useRncLookup } from '../../hooks/useRncLookup';
import RncBadge from '../ui/RncBadge';
import {
  Modal, Form, Row, Col, Input, Select, InputNumber,
  Button, Alert, Space, Typography, message, theme,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientesApi, type ClientePayload, type ClientesConMismoRnc } from '../../api/clientes.api';
import { xlinkApi } from '../../api/xlink.api';
import type { Cliente } from '../../types';

const { Option } = Select;
const { Text } = Typography;

const SECTORES = ['Comercio', 'Servicios', 'Manufactura', 'Construcción', 'Salud', 'Educación', 'Tecnología', 'Agropecuario', 'Otro'];

/**
 * Formulario único de cliente — usado tal cual por la página "Clientes"
 * (crear/editar) Y por "Crear" en el Directorio de HiCloud Xlink (prellenado,
 * RNC bloqueado, vincula al guardar). No hay dos formularios: uno solo con
 * dos modos de entrada.
 *
 * La alerta "ya existe este RNC, ¿es el mismo cliente?" (compartir RNC es
 * válido — escuelas de un distrito) solo corre en modo normal: en modo Xlink
 * el RNC viene fijo de la contraparte y "usar este" abriría un cliente
 * cualquiera SIN vincularlo a Xlink, que confundiría más de lo que ayuda. Ahí
 * la confirmación de "ya existe" la maneja el backend al guardar (ver
 * VincularXlinkResultado) y SÍ vincula de verdad.
 */
export interface ClienteFormModalProps {
  open: boolean;
  /** null/undefined = crear. Un Cliente = editar (modo normal, nunca junto con xlinkId). */
  editing?: Cliente | null;
  onClose: () => void;
  onSaved?: (cliente: Cliente) => void;
  /** RNC propio de la empresa — para no dejar cargar el RNC Receptor igual al emisor. */
  empresaRnc?: string;
  /** Prellenado — típicamente { nombre, rfc } desde el Directorio de Xlink. */
  initialValues?: Partial<ClientePayload>;
  /** El RNC viene de la empresa contraparte de Xlink — no se puede tocar. */
  rncLocked?: boolean;
  /**
   * Si se da, "Crear" no llama a POST /clientes directamente: vincula (o crea
   * y vincula) este cliente a esa empresa de HiCloud Xlink en una sola
   * operación atómica del lado del servidor — ver XlinkService.vincular.
   */
  xlinkId?: string;
}

export default function ClienteFormModal({
  open, editing = null, onClose, onSaved, empresaRnc, initialValues, rncLocked, xlinkId,
}: ClienteFormModalProps) {
  const { token } = theme.useToken();
  const [form] = Form.useForm<ClientePayload>();
  const rnc = useRncLookup();
  const rncReceptorLkp = useRncLookup();
  const qc = useQueryClient();

  const [rncExistentes, setRncExistentes] = useState<ClientesConMismoRnc | null>(null);
  // Ya existe un cliente sin vincular con este RNC — se ofrece vincularlo en
  // vez de crear otro (pedido explícito: "en vez de duplicarlo").
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState<{ id: number; nombre: string } | null>(null);
  // Copia local de `editing`: "Usar este" (ver más abajo) la cambia SOLO
  // dentro del modal — para transformarlo de "crear" a "editar" sin que el
  // llamador se entere a mitad de camino (onSaved solo se llama al guardar
  // de verdad, nunca al elegir un cliente existente de la alerta).
  const [editingActual, setEditingActual] = useState<Cliente | null>(editing);

  const consultarRncExistentes = async (valor: string) => {
    const limpio = (valor ?? '').replace(/\D/g, '');
    if (limpio.length !== 9 && limpio.length !== 11) { setRncExistentes(null); return; }
    try {
      const res = await clientesApi.buscarPorRnc(limpio, editingActual?.id);
      setRncExistentes(res.total > 0 ? res : null);
      if (res.total > 0 && !(form.getFieldValue('razonSocial') ?? '').trim()) {
        const delGrupo = new Set(res.clientes.map(c => (c.razonSocial ?? '').trim()).filter(Boolean));
        if (delGrupo.size === 1) form.setFieldsValue({ razonSocial: [...delGrupo][0] });
      }
    } catch { setRncExistentes(null); }
  };

  useEffect(() => {
    if (!open) return;
    setPidiendoConfirmacion(null);
    setRncExistentes(null);
    setEditingActual(editing);
    if (editing) {
      form.resetFields();
      form.setFieldsValue({ ...editing, diasCredito: (editing as any).diasCredito ?? 30 });
      // En modo normal (sin xlinkId) sigue avisando si el RNC con el que ya
      // venía el cliente lo comparten otros — igual que antes de extraer este componente.
      if (!xlinkId && editing.rfc) void consultarRncExistentes(editing.rfc);
    } else {
      form.resetFields();
      if (initialValues) form.setFieldsValue(initialValues);
      if (initialValues?.rfc) rnc.consultar(initialValues.rfc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Autocompletar desde DGII cuando se encuentra el RNC
  useEffect(() => {
    if (rnc.datos?.encontrado && rnc.datos?.nombre) {
      const parche: Partial<ClientePayload> = {};
      if (!form.getFieldValue('nombre'))      parche.nombre      = rnc.datos.nombre;
      if (!form.getFieldValue('razonSocial')) parche.razonSocial = rnc.datos.nombre;
      if (Object.keys(parche).length) form.setFieldsValue(parche);
    }
  }, [rnc.datos, form]);

  const razonSocialForm = Form.useWatch('razonSocial', form);
  const nombreForm      = Form.useWatch('nombre', form);
  const rncCompartidoActual = !!rncExistentes && rncExistentes.total > 0;
  const razonSocialDelGrupo = (() => {
    const definidas = new Set((rncExistentes?.clientes ?? []).map(c => (c.razonSocial ?? '').trim()).filter(Boolean));
    return definidas.size === 1 ? [...definidas][0] : null;
  })();
  const declararia = (razonSocialForm ?? '').trim() || (nombreForm ?? '').trim();
  const razonSocialDiverge = !!razonSocialDelGrupo && !!declararia && razonSocialDelGrupo !== declararia;

  const usarClienteExistente = async (id: number) => {
    const completo = await clientesApi.getOne(id).catch(() => null);
    if (!completo) { message.error('No se pudo abrir el cliente'); return; }
    setRncExistentes(null);
    setEditingActual(completo);
    form.setFieldsValue({ ...completo, diasCredito: (completo as any).diasCredito ?? 30 });
  };

  const createMut = useMutation({
    mutationFn: clientesApi.create,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      message.success('Cliente creado');
      onSaved?.(c); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ClientePayload> }) => clientesApi.update(id, body),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      message.success('Cliente actualizado');
      onSaved?.(c); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const vincularMut = useMutation({
    // El RNC lo decide el backend (contraparte.xlinkId), nunca lo que mande el
    // formulario — se excluye aquí para no chocar con forbidNonWhitelisted,
    // que valida VincularXlinkDatosDto (sin campo `rfc`) de forma recursiva.
    mutationFn: ({ rfc: _rfc, ...datos }: ClientePayload) => xlinkApi.vincular(xlinkId!, 'cliente', datos),
    onSuccess: (result) => {
      if (!('accion' in result)) return;
      if (result.accion === 'requiere_confirmacion') { setPidiendoConfirmacion(result.existente); return; }
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['xlink-directorio'] });
      message.success(result.accion === 'ya_vinculado' ? `Ya estaba vinculado: ${result.registro.nombre}` : 'Cliente creado y vinculado a Xlink');
      onSaved?.(result.registro); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear'),
  });
  const confirmarVincularExistente = useMutation({
    mutationFn: () => xlinkApi.vincular(xlinkId!, 'cliente'),
    onSuccess: (registro: any) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['xlink-directorio'] });
      message.success(`Vinculado: ${registro.nombre}`);
      setPidiendoConfirmacion(null);
      onSaved?.(registro); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo vincular'),
  });

  const handleSubmit = (values: ClientePayload) => {
    if (xlinkId) { vincularMut.mutate(values); return; }
    if (editingActual) updateMut.mutate({ id: editingActual.id, body: values });
    else               createMut.mutate(values);
  };
  const handleClose = () => { setPidiendoConfirmacion(null); onClose(); };
  const saving = createMut.isPending || updateMut.isPending || vincularMut.isPending;

  return (
    <Modal
      title={editingActual ? 'Editar cliente' : xlinkId ? 'Crear cliente y vincular a Xlink' : 'Nuevo cliente'}
      open={open} onCancel={handleClose} footer={null}
      width="min(680px, 95vw)" destroyOnClose
    >
      {pidiendoConfirmacion && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message={`Ya existe "${pidiendoConfirmacion.nombre}" con este RNC`}
          description={
            <Space direction="vertical" size={8}>
              <span>En vez de crear otro, puedes vincular el que ya existe a HiCloud Xlink.</span>
              <Space>
                <Button size="small" type="primary" loading={confirmarVincularExistente.isPending} onClick={() => confirmarVincularExistente.mutate()}>
                  Vincular
                </Button>
                <Button size="small" onClick={() => setPidiendoConfirmacion(null)}>Cancelar</Button>
              </Space>
            </Space>
          }
        />
      )}
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item noStyle shouldUpdate={(p, c) => p.identificadorExtranjero !== c.identificadorExtranjero}>
              {({ getFieldValue }) => {
                const tieneIdExt = !!getFieldValue('identificadorExtranjero');
                return (
                  <>
                    <Form.Item name="rfc" label="RNC / Cédula"
                      rules={rncLocked ? [] : [
                        { required: !tieneIdExt, message: 'El RNC o Cédula es requerido (o ingrese Identificador Extranjero)' },
                        {
                          validator: (_, v) => {
                            if (!v) return Promise.resolve();
                            return /^\d{9}$|^\d{11}$/.test(v)
                              ? Promise.resolve()
                              : Promise.reject('RNC debe tener 9 dígitos o Cédula debe tener 11 dígitos');
                          },
                        },
                      ]}>
                      <Input
                        placeholder={tieneIdExt ? '(opcional para clientes extranjeros)' : '9 dígitos (RNC) u 11 dígitos (Cédula)'}
                        maxLength={11} disabled={rncLocked}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          rnc.consultarDebounced(v);
                          void consultarRncExistentes(v);
                        }}
                      />
                    </Form.Item>
                    {!rncLocked && <RncBadge datos={rnc.datos} loading={rnc.loading} rncNuevo={!rncCompartidoActual} />}
                  </>
                );
              }}
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item
              name="nombre"
              label="Nombre del cliente"
              tooltip="Uso interno. Si varias sucursales comparten RNC (p. ej. escuelas de un mismo distrito educativo), este es el nombre que las distingue en el listado, el POS y su cuenta por cobrar."
              rules={[{ required: true }]}>
              <Input placeholder="Ej: Escuela Básica Los Alcarrizos #3" />
            </Form.Item>
          </Col>

          {!rncLocked && rncExistentes && rncExistentes.total > 0 && (
            <Col xs={24}>
              <div style={{
                border: `1px solid ${token.colorWarningBorder}`,
                background: token.colorWarningBg,
                borderRadius: 8, padding: '10px 12px', marginBottom: 16,
              }}>
                <Text strong style={{ fontSize: 13 }}>
                  Ya existe{rncExistentes.total === 1 ? '' : 'n'} {rncExistentes.total}{' '}
                  cliente{rncExistentes.total === 1 ? '' : 's'} con este RNC
                </Text>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2, marginBottom: 8 }}>
                  Compartir RNC es válido cuando son cuentas distintas del mismo
                  contribuyente. Si alguno de estos ya es el cliente que ibas a
                  registrar, ábrelo en vez de crear otro.
                </div>
                {rncExistentes.clientes.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '6px 0',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                        {[c.direccion, c.ciudad].filter(Boolean).join(', ') || 'Sin dirección registrada'}
                        {c.telefono ? ` · ${c.telefono}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        Declara ante DGII: {(c.razonSocial ?? '').trim() || c.nombre}
                      </div>
                    </div>
                    <Button size="small" onClick={() => void usarClienteExistente(c.id)}>
                      Usar este
                    </Button>
                  </div>
                ))}
                {razonSocialDiverge && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                    <Text strong style={{ fontSize: 12, color: token.colorErrorText }}>
                      Este cliente declararía una razón social distinta
                    </Text>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, margin: '2px 0 8px' }}>
                      Los demás clientes de este RNC declaran{' '}
                      <strong>"{razonSocialDelGrupo}"</strong> y este declararía{' '}
                      <strong>"{declararia}"</strong>. Ante DGII un RNC es un solo
                      contribuyente: todos deben declarar la misma razón social.
                    </div>
                    <Button size="small" type="primary" ghost onClick={() => form.setFieldsValue({ razonSocial: razonSocialDelGrupo! })}>
                      Usar "{razonSocialDelGrupo}" como razón social fiscal
                    </Button>
                  </div>
                )}
              </div>
            </Col>
          )}

          <Col xs={24} sm={12}>
            <Form.Item noStyle shouldUpdate={(p, c) => p.identificadorExtranjero !== c.identificadorExtranjero}>
              {({ getFieldValue }) => {
                const tieneIdExt = !!getFieldValue('identificadorExtranjero');
                return (
                  <>
                    <Form.Item
                      name="rncReceptor"
                      label="RNC Receptor (e-CF) — opcional"
                      tooltip="RNC del COMPRADOR que se declara en el e-CF. Casi siempre se deja VACÍO: si está vacío se usa el RNC/Cédula de arriba. Solo se llena cuando la factura va a nombre de un RNC distinto al de la ficha del cliente. Nunca es el RNC de su propia empresa — esa es quien emite, no quien compra."
                      extra={<span style={{ fontSize: 11 }}>Déjalo vacío salvo que factures a un RNC distinto al del cliente</span>}
                      rules={[{
                        validator: (_, v) => {
                          if (!v || tieneIdExt) return Promise.resolve();
                          if (!/^\d{9}$|^\d{11}$/.test(v)) return Promise.reject('9 u 11 dígitos');
                          const rncPropio = (empresaRnc ?? '').replace(/\D/g, '');
                          if (rncPropio && rncPropio === v.replace(/\D/g, '')) {
                            return Promise.reject('Ese es el RNC de tu propia empresa (quien emite). Aquí va el RNC del comprador, o déjalo vacío.');
                          }
                          return Promise.resolve();
                        },
                      }]}>
                      <Input
                        placeholder={tieneIdExt ? '(opcional para clientes extranjeros)' : 'Vacío = usa el RNC/Cédula del cliente'}
                        maxLength={11}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          form.setFieldsValue({ rncReceptor: v });
                          rncReceptorLkp.consultarDebounced(v);
                        }}
                      />
                    </Form.Item>
                    <RncBadge datos={rncReceptorLkp.datos} loading={rncReceptorLkp.loading} />
                  </>
                );
              }}
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="identificadorExtranjero" label="Identificador Extranjero (E46)" tooltip="ID fiscal del cliente en su país — obligatorio para emitir e-CF E46 (Exportaciones)">
              <Input placeholder="EIN, NIT, RFC, VAT…" maxLength={30} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="regimenFiscal" label="Régimen Fiscal">
              <Select allowClear>
                <Option value="ORDINARIO">Ordinario</Option>
                <Option value="PST">PST — Pequeño contribuyente</Option>
                <Option value="RST">RST — Simplificado</Option>
                <Option value="EXENTO">Exento</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="telefono" label="Teléfono">
              <Input placeholder="(809) 000-0000" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item name="direccion" label="Dirección">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="ciudad" label="Ciudad">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="estado" label="Provincia">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name="codigoPostal" label="Cód. Postal">
              <Input maxLength={10} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="razonSocial"
              label="Razón Social fiscal (DGII)"
              tooltip="La razón social registrada para este RNC. Es lo que se declara como RazonSocialComprador en el e-CF, así que debe ser idéntica en todos los clientes que compartan el RNC. Si se deja vacía se usa el nombre del cliente."
              required={rncCompartidoActual}
              extra={rncCompartidoActual ? (
                <span style={{ fontSize: 11 }}>Obligatoria: este RNC lo usan {rncExistentes!.total + 1} clientes y todos deben declarar la misma</span>
              ) : undefined}
              rules={[{
                validator: (_, v) => {
                  if (!rncCompartidoActual) return Promise.resolve();
                  return (v ?? '').trim()
                    ? Promise.resolve()
                    : Promise.reject('Indica la razón social registrada del RNC: si la dejas vacía, este cliente declararía su nombre interno ante DGII y no coincidiría con los demás del mismo RNC.');
                },
              }]}>
              <Input placeholder="Se autocompleta al consultar el RNC" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="sector" label="Sector Económico">
              <Select allowClear>
                {SECTORES.map(s => <Option key={s} value={s}>{s}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="diasCredito" label="Días de crédito">
              <InputNumber style={{ width: '100%' }} min={0} max={365} addonAfter="días" placeholder="30" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="limiteCredito" label="Límite de crédito (DOP)">
              <InputNumber style={{ width: '100%' }} min={0} step={5000}
                formatter={(v: any) => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                parser={(v: any) => v?.replace(/,/g, '') ?? ''}
                placeholder="0 = sin límite" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notas" label="Notas internas">
              <Input.TextArea rows={2} placeholder="Observaciones, condiciones especiales..." />
            </Form.Item>
          </Col>
        </Row>

        <Row justify="end" gutter={8}>
          <Col><Button onClick={handleClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={saving}>
              {editingActual ? 'Actualizar' : xlinkId ? 'Crear y vincular' : 'Crear cliente'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
