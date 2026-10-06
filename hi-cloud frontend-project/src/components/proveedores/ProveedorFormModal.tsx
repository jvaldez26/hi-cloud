import { useEffect, useState } from 'react';
import { useRncLookup } from '../../hooks/useRncLookup';
import RncBadge from '../ui/RncBadge';
import {
  Modal, Form, Row, Col, Input, Select, InputNumber, Checkbox,
  Button, Alert, Space, message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { proveedoresApi, type ProveedorPayload } from '../../api/proveedores.api';
import { xlinkApi } from '../../api/xlink.api';
import type { Proveedor } from '../../types';

const { Option } = Select;

const CATEGORIAS = ['Materia prima', 'Servicios', 'Tecnología', 'Logística', 'Limpieza', 'Papelería', 'Alimentos', 'Otro'];

/**
 * Formulario único de proveedor — usado tal cual por la página "Proveedores"
 * (crear/editar) Y por "Crear" en el Directorio de HiCloud Xlink (prellenado,
 * RNC bloqueado, vincula al guardar). No hay dos formularios: uno solo con
 * dos modos de entrada.
 */
export interface ProveedorFormModalProps {
  open: boolean;
  /** null/undefined = crear. Un Proveedor = editar (modo normal, nunca junto con xlinkId). */
  editing?: Proveedor | null;
  onClose: () => void;
  onSaved?: (proveedor: Proveedor) => void;
  /** Prellenado — típicamente { nombre, rnc } desde el Directorio de Xlink. */
  initialValues?: Partial<ProveedorPayload>;
  /** El RNC viene de la empresa contraparte de Xlink — no se puede tocar. */
  rncLocked?: boolean;
  /**
   * Si se da, "Crear" no llama a POST /proveedores directamente: vincula (o
   * crea y vincula) este proveedor a esa empresa de HiCloud Xlink en una sola
   * operación atómica del lado del servidor — ver XlinkService.vincular.
   */
  xlinkId?: string;
}

export default function ProveedorFormModal({
  open, editing = null, onClose, onSaved, initialValues, rncLocked, xlinkId,
}: ProveedorFormModalProps) {
  const [form] = Form.useForm<ProveedorPayload>();
  const rnc = useRncLookup();
  const qc = useQueryClient();
  // Ya existe un proveedor sin vincular con este RNC — se ofrece vincularlo
  // en vez de crear otro (pedido explícito: "en vez de duplicarlo").
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState<{ id: number; nombre: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPidiendoConfirmacion(null);
    if (editing) {
      form.resetFields();
      form.setFieldsValue(editing);
    } else {
      form.resetFields();
      if (initialValues) form.setFieldsValue(initialValues);
      if (initialValues?.rnc) rnc.consultar(initialValues.rnc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Autocompletar nombre desde DGII cuando se encuentra el RNC
  useEffect(() => {
    if (rnc.datos?.encontrado && rnc.datos?.nombre) {
      if (!form.getFieldValue('nombre')) form.setFieldsValue({ nombre: rnc.datos.nombre });
    }
  }, [rnc.datos, form]);

  const createMut = useMutation({
    mutationFn: proveedoresApi.create,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      message.success('Proveedor creado');
      onSaved?.(p); onClose();
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? e?.response?.data?.message ?? 'Error al crear'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProveedorPayload> }) => proveedoresApi.update(id, body),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      message.success('Proveedor actualizado');
      onSaved?.(p); onClose();
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const vincularMut = useMutation({
    // El RNC lo decide el backend (contraparte.xlinkId), nunca lo que mande el
    // formulario — se excluye aquí para no chocar con forbidNonWhitelisted,
    // que valida VincularXlinkDatosDto (sin campo `rnc`) de forma recursiva.
    // `esInformal` tampoco aplica: el RNC de Xlink siempre es uno real.
    mutationFn: ({ rnc: _rnc, esInformal: _esInformal, ...datos }: ProveedorPayload & { esInformal?: boolean }) =>
      xlinkApi.vincular(xlinkId!, 'proveedor', datos),
    onSuccess: (result) => {
      if (!('accion' in result)) return; // nunca pasa (siempre mandamos datos), guarda de tipos
      if (result.accion === 'requiere_confirmacion') { setPidiendoConfirmacion(result.existente); return; }
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['xlink-directorio'] });
      message.success(result.accion === 'ya_vinculado' ? `Ya estaba vinculado: ${result.registro.nombre}` : 'Proveedor creado y vinculado a Xlink');
      onSaved?.(result.registro); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear'),
  });
  const confirmarVincularExistente = useMutation({
    mutationFn: () => xlinkApi.vincular(xlinkId!, 'proveedor'),
    onSuccess: (registro: any) => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      qc.invalidateQueries({ queryKey: ['xlink-directorio'] });
      message.success(`Vinculado: ${registro.nombre}`);
      setPidiendoConfirmacion(null);
      onSaved?.(registro); onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo vincular'),
  });

  const handleSubmit = (v: ProveedorPayload) => {
    if (xlinkId) { vincularMut.mutate(v); return; }
    editing ? updateMut.mutate({ id: editing.id, body: v }) : createMut.mutate(v);
  };
  const handleClose = () => { setPidiendoConfirmacion(null); onClose(); };
  const saving = createMut.isPending || updateMut.isPending || vincularMut.isPending;

  return (
    <Modal
      title={editing ? 'Editar proveedor' : xlinkId ? 'Crear proveedor y vincular a Xlink' : 'Nuevo proveedor'}
      open={open} onCancel={handleClose} footer={null} width={640} destroyOnClose
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
          <Col xs={24} sm={16}>
            <Form.Item name="nombre" label="Nombre / Razón Social" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.esInformal !== cur.esInformal}>
              {({ getFieldValue }) => {
                const informal = getFieldValue('esInformal');
                return (
                  <>
                    <Form.Item name="rnc" label="RNC"
                      rules={rncLocked || informal ? [] : [{ required: true }, { pattern: /^\d{9}$|^\d{11}$/, message: '9 u 11 dígitos' }]}>
                      <Input
                        placeholder="130000001" maxLength={11} disabled={informal || rncLocked}
                        onChange={e => rnc.consultarDebounced(e.target.value.replace(/\D/g, ''))}
                      />
                    </Form.Item>
                    {!informal && <RncBadge datos={rnc.datos} loading={rnc.loading} />}
                  </>
                );
              }}
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="esInformal" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox disabled={rncLocked}>Proveedor informal (sin RNC) — genera E41 en órdenes de compra</Checkbox>
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="sincronizarArticulosXlink" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox>Sincronizar artículos con HiCloud Xlink — intenta emparejar productos por su código automáticamente al recibir</Checkbox>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="telefono" label="Teléfono">
              <Input placeholder="(809) 000-0000" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item name="direccion" label="Dirección">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="contacto" label="Persona de Contacto">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="categoria" label="Categoría">
              <Select allowClear>
                {CATEGORIAS.map(c => <Option key={c} value={c}>{c}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="diasPago" label="Días de pago">
              <InputNumber style={{ width: '100%' }} min={0} max={365} addonAfter="días" placeholder="30" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="banco" label="Banco">
              <Select allowClear>
                {['Banreservas', 'BHD León', 'Popular', 'ScotiaBank', 'APAP', 'BancoSanta Cruz', 'Asociación Cibao', 'Otro']
                  .map(b => <Option key={b} value={b}>{b}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="cuentaBancaria" label="Número de cuenta">
              <Input placeholder="000-0000000-0" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notas" label="Notas">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row justify="end" gutter={8}>
          <Col><Button onClick={handleClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={saving}>
              {editing ? 'Actualizar' : xlinkId ? 'Crear y vincular' : 'Crear proveedor'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
