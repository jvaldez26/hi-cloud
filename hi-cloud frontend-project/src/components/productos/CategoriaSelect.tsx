import { useState } from 'react';
import { Select, Modal, Form, Input, Button, Divider, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriasProductoApi } from '../../api/categoriasProducto.api';
import { useAuthStore } from '../../store/auth.store';
import { mensajeDeError } from '../../utils/mensajeDeError';

/**
 * Selector de categoría de producto — catálogo real (ver categorias-producto.
 * service.ts en el backend), no el texto libre de antes. Usado por el
 * formulario único de producto (Inventario, POS, Compras, Xlink — ver
 * ProductoFormModal.tsx), y en cualquier otro filtro/regla que antes
 * comparaba texto ("Lácteos" vs "lacteos " vs "LACTEOS").
 *
 * "+ Nueva categoría" solo aparece para ADMIN/CONTADOR — el resto SOLO
 * elige entre las que ya existen (mismo criterio de rol que el resto de
 * acciones sensibles de inventario: costo-manual, quitar-stock-mínimo).
 */
export interface CategoriaSelectProps {
  value?: number | null;
  onChange?: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  /** Incluye categorías inactivas en la lista (para filtros administrativos). */
  incluirInactivas?: boolean;
}

export default function CategoriaSelect({
  value, onChange, placeholder = 'Categoría...', disabled, allowClear = true, style, incluirInactivas,
}: CategoriaSelectProps) {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const puedeCrear = user?.role === 'admin' || user?.role === 'contador';

  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [form] = Form.useForm();

  const { data: categorias } = useQuery({
    queryKey: ['categorias-producto', incluirInactivas ?? false],
    queryFn:  () => categoriasProductoApi.listar(incluirInactivas),
    staleTime: 60_000,
  });

  const crearMut = useMutation({
    mutationFn: categoriasProductoApi.crear,
    onSuccess: (cat) => {
      if (!cat) return;
      qc.invalidateQueries({ queryKey: ['categorias-producto'] });
      onChange?.(cat.id);
      message.success(`Categoría "${cat.nombre}" creada`);
      setAbierto(false);
      form.resetFields();
    },
    onError: (e: any) => message.error(mensajeDeError(e, { fallback: 'No se pudo crear la categoría' })),
  });

  return (
    <>
      <Select
        showSearch
        allowClear={allowClear}
        value={value ?? undefined}
        disabled={disabled}
        placeholder={placeholder}
        style={style}
        popupMatchSelectWidth={false}
        dropdownStyle={{ minWidth: 260 }}
        filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        options={(categorias ?? []).map(c => ({ value: c.id, label: c.ruta }))}
        onChange={(id) => onChange?.(id ?? null)}
        onSearch={setBusqueda}
        onClear={() => onChange?.(null)}
        dropdownRender={menu => (
          <>
            {menu}
            {puedeCrear && (
              <>
                <Divider style={{ margin: '4px 0' }} />
                <Button type="link" icon={<PlusOutlined />}
                  style={{ width: '100%', textAlign: 'left', paddingLeft: 12 }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    form.setFieldsValue({ nombre: busqueda.trim() });
                    setAbierto(true);
                  }}>
                  {busqueda.trim() ? `Crear "${busqueda.trim()}" como nueva categoría` : 'Nueva categoría'}
                </Button>
              </>
            )}
          </>
        )}
      />

      <Modal
        title="Nueva categoría"
        open={abierto}
        onCancel={() => { setAbierto(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={crearMut.isPending}
        okText="Crear"
        destroyOnClose
      >
        <Form form={form} layout="vertical"
          onFinish={vals => crearMut.mutate({
            nombre: vals.nombre, descripcion: vals.descripcion || undefined,
            categoriaPadreId: vals.categoriaPadreId || undefined,
          })}
        >
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: 'Obligatorio' }]}>
            <Input autoFocus maxLength={100} placeholder="Ej. Lácteos" />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción (opcional)">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item name="categoriaPadreId" label="Categoría padre (opcional — crea una subcategoría)">
            <Select allowClear placeholder="Ninguna — categoría de nivel superior"
              options={(categorias ?? []).filter(c => !c.categoriaPadreId).map(c => ({ value: c.id, label: c.nombre }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
