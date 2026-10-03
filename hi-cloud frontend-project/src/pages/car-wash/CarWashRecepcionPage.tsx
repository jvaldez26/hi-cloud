import { useEffect, useRef, useState } from 'react';
import { Typography, Form, Input, Select, Checkbox, Upload, Button, Card, Row, Col, Alert, message, Tag } from 'antd';
import { UploadOutlined, SaveOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { carWashApi } from '../../api/car-wash.api';
import SelectClienteConAlta from '../../components/clientes/SelectClienteConAlta';
import { TIPOS_VEHICULO_CW, LABEL_TIPO_VEHICULO_CW, type TipoVehiculoCw } from './tipos';
import { imprimirTicketCarWash } from './imprimirTicketCarWash';
import { useDebounce } from '../../hooks/useDebounce';

const { Title, Paragraph } = Typography;

export default function CarWashRecepcionPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculoCw>('carro');
  const [servicioIds, setServicioIds] = useState<number[]>([]);
  const [fotos, setFotos] = useState<UploadFile[]>([]);
  const placaForm: string = Form.useWatch('placa', form) ?? '';
  const placaDebounced = useDebounce(placaForm.trim().toUpperCase(), 500);
  const placaAutocompletada = useRef<string | null>(null);

  const { data: historialPlaca } = useQuery({
    queryKey: ['cw-historial-placa', placaDebounced],
    queryFn: () => carWashApi.getHistorialPorPlaca(placaDebounced),
    enabled: placaDebounced.length >= 5,
  });

  useEffect(() => {
    if (!historialPlaca || placaAutocompletada.current === placaDebounced) return;
    placaAutocompletada.current = placaDebounced;
    const actuales = form.getFieldsValue(['marca', 'color']);
    const cambios: Record<string, any> = {};
    if (!actuales.marca && historialPlaca.ultimoTurno.marca) cambios.marca = historialPlaca.ultimoTurno.marca;
    if (!actuales.color && historialPlaca.ultimoTurno.color) cambios.color = historialPlaca.ultimoTurno.color;
    if (Object.keys(cambios).length) form.setFieldsValue(cambios);
    if (historialPlaca.ultimoTurno.tipoVehiculo) setTipoVehiculo(historialPlaca.ultimoTurno.tipoVehiculo);
    if (historialPlaca.clienteId) form.setFieldsValue({ clienteId: historialPlaca.clienteId });
    if (historialPlaca.telefono && !form.getFieldValue('telefono')) form.setFieldsValue({ telefono: historialPlaca.telefono });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historialPlaca, placaDebounced]);

  const { data: servicios } = useQuery({
    queryKey: ['cw-servicios'],
    queryFn: () => carWashApi.getServicios(),
  });

  const activos = (servicios ?? []).filter((s: any) => s.activo);

  function precioPara(servicio: any, tipo: TipoVehiculoCw) {
    return servicio.precios.find((p: any) => p.tipoVehiculo === tipo);
  }

  const totalEstimado = servicioIds.reduce((s, id) => {
    const servicio = activos.find((x: any) => x.id === id);
    const p = servicio ? precioPara(servicio, tipoVehiculo) : null;
    return s + Number(p?.precio ?? 0);
  }, 0);

  const crear = useMutation({
    mutationFn: (body: any) => carWashApi.crearTurno(body),
    onSuccess: async turno => {
      if (fotos.length > 0) {
        try {
          await carWashApi.subirFotos(turno.id, fotos.map(f => f.originFileObj as File));
        } catch {
          message.warning('El turno se creó, pero no se pudieron subir las fotos');
        }
      }
      message.success(`Turno ${turno.codigo} creado`);
      const serviciosElegidos = activos
        .filter((s: any) => servicioIds.includes(s.id))
        .map((s: any) => ({ nombre: s.nombre, precio: Number(precioPara(s, tipoVehiculo)?.precio ?? 0) }));
      await imprimirTicketCarWash({
        codigo: turno.codigo, placa: turno.placa, tipoVehiculo: turno.tipoVehiculo,
        marca: turno.marca, color: turno.color, servicios: serviciosElegidos, urlPublica: turno.urlPublica,
      });
      form.resetFields();
      setServicioIds([]);
      setFotos([]);
      navigate('/car-wash');
    },
  });

  function guardar() {
    form.validateFields().then(valores => {
      if (servicioIds.length === 0) { message.warning('Elige al menos un servicio'); return; }
      crear.mutate({ ...valores, tipoVehiculo, servicioIds });
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Title level={3}>Recepción de vehículo</Title>
      <Paragraph type="secondary">Registra el turno; al guardar se imprime el ticket con el QR de seguimiento.</Paragraph>

      <Card>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="placa" label="Placa" rules={[{ required: true }]}>
                <Input placeholder="ABC1234" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Tipo de vehículo" required>
                <Select
                  value={tipoVehiculo}
                  onChange={setTipoVehiculo}
                  options={TIPOS_VEHICULO_CW.map(t => ({ value: t, label: LABEL_TIPO_VEHICULO_CW[t] }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {historialPlaca && (
            <Alert
              type="info" showIcon style={{ marginBottom: 16 }}
              message={`Esta placa ya vino antes (${historialPlaca.visitas} visita${historialPlaca.visitas === 1 ? '' : 's'})`}
              description={
                <>
                  {historialPlaca.clienteNombre && <div>Cliente: {historialPlaca.clienteNombre}</div>}
                  {historialPlaca.ultimoTurno.servicios?.length > 0 && (
                    <div>Último servicio: {historialPlaca.ultimoTurno.servicios.join(', ')}</div>
                  )}
                </>
              }
            />
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="marca" label="Marca / modelo">
                <Input placeholder="Toyota Corolla" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="color" label="Color">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="clienteId" label="Cliente (opcional)">
                <SelectClienteConAlta placeholder="Buscar o crear cliente" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telefono" label="Teléfono (opcional)">
                <Input placeholder="809 000 0000" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Servicios" required>
            <Checkbox.Group
              value={servicioIds}
              onChange={v => setServicioIds(v as number[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {activos.map((s: any) => {
                const p = precioPara(s, tipoVehiculo);
                return (
                  <Checkbox key={s.id} value={s.id}>
                    {s.nombre} {p ? <Tag>RD${Number(p.precio).toFixed(2)} · {p.duracionMinutos} min</Tag> : <Tag color="red">Sin precio para este tipo</Tag>}
                  </Checkbox>
                );
              })}
            </Checkbox.Group>
          </Form.Item>

          <Form.Item name="notasDanos" label="Daños previos / notas">
            <Input.TextArea rows={2} placeholder="Rayón en la puerta izquierda, espejo roto…" />
          </Form.Item>

          <Form.Item label="Fotos de daños previos">
            <Upload
              listType="picture-card"
              fileList={fotos}
              beforeUpload={() => false}
              onChange={({ fileList }) => setFotos(fileList.slice(0, 6))}
              accept="image/png,image/jpeg,image/webp"
            >
              {fotos.length < 6 && <Button icon={<UploadOutlined />}>Subir</Button>}
            </Upload>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={4} style={{ margin: 0 }}>Total estimado: RD${totalEstimado.toFixed(2)}</Title>
            <Button type="primary" icon={<SaveOutlined />} onClick={guardar} loading={crear.isPending}>
              Recibir e imprimir ticket
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
