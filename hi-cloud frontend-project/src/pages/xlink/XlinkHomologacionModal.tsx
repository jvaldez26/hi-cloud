import { useState } from 'react';
import { Modal, Table, Select, Input, InputNumber, Radio, Typography, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { xlinkApi, FaltanteMapeo } from '../../api/xlink.api';
import { productosApi } from '../../api/productos.api';
import { useQuery } from '@tanstack/react-query';

const { Text } = Typography;

interface Props {
  open: boolean;
  contraparteXlinkId: string;
  faltantes: FaltanteMapeo[];
  onClose: () => void;
  /** Se llama después de guardar los mapeos, para que el caller reintente el recibir(). */
  onGuardado: () => void;
}

interface FilaResolucion {
  modo: 'existente' | 'crear';
  productoId?: number;
  nombre: string;
  unidadMedida: string;
  porcentajeIva: number;
  precio: number;
}

/**
 * 409 de HiCloud Xlink (Fase 4): una fila por faltante, cada una resuelta
 * eligiendo un producto existente o creando uno al vuelo. Al guardar, los
 * mapeos quedan por contraparte para siempre — el caller reintenta
 * recibir() después, y esta vez resuelve solo.
 */
export default function XlinkHomologacionModal({ open, contraparteXlinkId, faltantes, onClose, onGuardado }: Props) {
  const qc = useQueryClient();
  const [resoluciones, setResoluciones] = useState<Record<string, FilaResolucion>>({});

  const { data: productos } = useQuery({
    queryKey: ['productos-select-xlink'],
    queryFn: () => productosApi.list(1, 500),
    enabled: open,
  });
  const opcionesProducto = (Array.isArray(productos) ? productos : productos?.data ?? []).map((p: any) => ({
    value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre,
  }));

  const actualizar = (f: FaltanteMapeo, cambio: Partial<FilaResolucion>) => {
    setResoluciones(prev => {
      const base: FilaResolucion = prev[f.valorExterno] ?? {
        modo: 'existente', nombre: f.descripcion, unidadMedida: f.unidad, porcentajeIva: f.porcentajeIva, precio: f.precioReferencia,
      };
      return { ...prev, [f.valorExterno]: { ...base, ...cambio } };
    });
  };

  const guardarMut = useMutation({
    mutationFn: async () => {
      const mapeos = faltantes.map(f => {
        const r = resoluciones[f.valorExterno];
        if (!r) throw new Error(`Falta resolver "${f.descripcion}"`);
        if (r.modo === 'existente') {
          if (!r.productoId) throw new Error(`Elige un producto para "${f.descripcion}"`);
          return { tipo: 'producto' as const, valorExterno: f.valorExterno, valorInternoId: r.productoId };
        }
        if (!r.nombre?.trim()) throw new Error(`Escribe un nombre para el producto nuevo de "${f.descripcion}"`);
        if (!r.precio || r.precio <= 0) throw new Error(`Escribe un precio para "${f.descripcion}"`);
        return {
          tipo: 'producto' as const, valorExterno: f.valorExterno,
          crearProducto: { nombre: r.nombre.trim(), unidadMedida: r.unidadMedida, porcentajeIva: r.porcentajeIva, precio: r.precio },
        };
      });
      return xlinkApi.guardarMapeos(contraparteXlinkId, mapeos);
    },
    onSuccess: () => {
      message.success('Homologación guardada — reintentando recibir...');
      qc.invalidateQueries({ queryKey: ['productos'] });
      setResoluciones({});
      onGuardado();
    },
    onError: (e: any) => message.error(e?.message ?? e?.response?.data?.message ?? 'No se pudo guardar la homologación'),
  });

  return (
    <Modal
      title="Homologar productos"
      open={open}
      onCancel={onClose}
      onOk={() => guardarMut.mutate()}
      okText="Guardar y reintentar"
      confirmLoading={guardarMut.isPending}
      width={720}
    >
      <Text type="secondary">
        Estas líneas no tienen un producto tuyo asociado. Elige uno existente o crea uno nuevo — quedará
        guardado para la próxima vez que recibas algo de esta misma empresa.
      </Text>
      <Table
        style={{ marginTop: 16 }}
        rowKey="valorExterno"
        dataSource={faltantes}
        pagination={false}
        size="small"
        columns={[
          { title: 'Línea del documento', dataIndex: 'descripcion' },
          { title: 'Código externo', dataIndex: 'valorExterno', render: (v: string) => v.startsWith('__sin_sku__:') ? <Text type="secondary">(sin código)</Text> : <code>{v}</code> },
          {
            title: 'Resolución',
            render: (_: unknown, f: FaltanteMapeo) => {
              const r = resoluciones[f.valorExterno] ?? {
                modo: 'existente' as const, nombre: f.descripcion, unidadMedida: f.unidad, porcentajeIva: f.porcentajeIva, precio: f.precioReferencia,
              };
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Radio.Group
                    size="small"
                    value={r.modo}
                    onChange={e => actualizar(f, { modo: e.target.value })}
                  >
                    <Radio.Button value="existente">Usar existente</Radio.Button>
                    <Radio.Button value="crear">Crear nuevo</Radio.Button>
                  </Radio.Group>
                  {r.modo === 'existente' ? (
                    <Select
                      style={{ width: 280 }}
                      placeholder="Elige un producto"
                      showSearch
                      optionFilterProp="label"
                      options={opcionesProducto}
                      value={r.productoId}
                      onChange={v => actualizar(f, { productoId: v })}
                    />
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Input
                        placeholder="Nombre del producto"
                        style={{ width: 160 }}
                        defaultValue={f.descripcion}
                        onChange={e => actualizar(f, { nombre: e.target.value })}
                      />
                      <Input
                        placeholder="Unidad"
                        style={{ width: 70 }}
                        defaultValue={f.unidad}
                        onChange={e => actualizar(f, { unidadMedida: e.target.value })}
                      />
                      <InputNumber
                        placeholder="% ITBIS"
                        style={{ width: 80 }}
                        defaultValue={f.porcentajeIva}
                        min={0} max={100}
                        onChange={v => actualizar(f, { porcentajeIva: v ?? f.porcentajeIva })}
                      />
                      <InputNumber
                        placeholder="Precio"
                        style={{ width: 100 }}
                        defaultValue={f.precioReferencia}
                        min={0.01}
                        onChange={v => actualizar(f, { precio: v ?? f.precioReferencia })}
                      />
                    </div>
                  )}
                </div>
              );
            },
          },
        ]}
      />
    </Modal>
  );
}
