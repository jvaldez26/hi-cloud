import { useState } from 'react';
import { Modal, Table, Select, Radio, Typography, message, Button, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { xlinkApi, FaltanteMapeo } from '../../api/xlink.api';
import { productosApi } from '../../api/productos.api';
import { ProductoFormModal } from '../../components/productos/ProductoFormModal';
import { useQuery } from '@tanstack/react-query';
import type { Producto } from '../../types';

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
  productoLabel?: string;
}

/**
 * 409 de HiCloud Xlink (Fase 4): una fila por faltante, cada una resuelta
 * eligiendo un producto existente o creando uno nuevo. "Crear nuevo" abre el
 * mismo formulario único de producto (ProductoFormModal, modo rápido) que
 * usan Inventario/POS/Compras — nunca un mini-formulario propio con unidad
 * en texto libre o ITBIS sin validar duplicados. El producto queda creado
 * de inmediato (esCreacionRapida=true, "Pendiente de completar" en
 * Inventario) y la fila pasa a "usar existente" con ese id — al guardar,
 * los mapeos quedan por contraparte para siempre.
 */
export default function XlinkHomologacionModal({ open, contraparteXlinkId, faltantes, onClose, onGuardado }: Props) {
  const qc = useQueryClient();
  const [resoluciones, setResoluciones] = useState<Record<string, FilaResolucion>>({});
  const [crearPara, setCrearPara] = useState<FaltanteMapeo | null>(null);

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
      const base: FilaResolucion = prev[f.valorExterno] ?? { modo: 'existente' };
      return { ...prev, [f.valorExterno]: { ...base, ...cambio } };
    });
  };

  const onProductoCreado = (prod: Producto) => {
    if (!crearPara) return;
    actualizar(crearPara, {
      modo: 'existente', productoId: prod.id,
      productoLabel: prod.codigo ? `${prod.codigo} — ${prod.nombre}` : prod.nombre,
    });
    qc.invalidateQueries({ queryKey: ['productos-select-xlink'] });
    setCrearPara(null);
  };

  const guardarMut = useMutation({
    mutationFn: async () => {
      const mapeos = faltantes.map(f => {
        const r = resoluciones[f.valorExterno];
        if (!r?.productoId) throw new Error(`Elige o crea un producto para "${f.descripcion}"`);
        return { tipo: 'producto' as const, valorExterno: f.valorExterno, valorInternoId: r.productoId };
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
              const r = resoluciones[f.valorExterno] ?? { modo: 'existente' as const };
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Radio.Group
                    size="small"
                    value={r.modo}
                    onChange={e => actualizar(f, { modo: e.target.value, productoId: undefined, productoLabel: undefined })}
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
                      onChange={(v, opt: any) => actualizar(f, { productoId: v, productoLabel: opt?.label })}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => setCrearPara(f)}>
                        Crear nuevo producto
                      </Button>
                      {r.productoId && <Tag color="green">{r.productoLabel}</Tag>}
                    </div>
                  )}
                </div>
              );
            },
          },
        ]}
      />

      <ProductoFormModal
        open={!!crearPara}
        onClose={() => setCrearPara(null)}
        modoInicial="rapido"
        marcarCreacionRapida
        nombreInicial={crearPara?.descripcion}
        valoresInicialesExtra={crearPara ? {
          unidadMedida: crearPara.unidad,
          porcentajeIva: crearPara.porcentajeIva,
          precio: crearPara.precioReferencia,
        } : undefined}
        width={520}
        onSuccess={onProductoCreado}
      />
    </Modal>
  );
}
