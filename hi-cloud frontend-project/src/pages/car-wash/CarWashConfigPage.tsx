import { useEffect } from 'react';
import { Typography, Form, InputNumber, Switch, Select, Button, Card, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carWashApi } from '../../api/car-wash.api';

const { Title, Paragraph } = Typography;

export default function CarWashConfigPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data: config, isLoading } = useQuery({
    queryKey: ['cw-config'],
    queryFn: () => carWashApi.getConfig(),
  });

  useEffect(() => {
    if (config) form.setFieldsValue(config);
  }, [config, form]);

  const guardar = useMutation({
    mutationFn: (body: any) => carWashApi.actualizarConfig(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cw-config'] }); message.success('Configuración guardada'); },
  });

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <Title level={3}>Configuración de Car Wash</Title>
      <Paragraph type="secondary">Ajustes de esta sucursal.</Paragraph>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" onFinish={valores => guardar.mutate(valores)}>
          <Form.Item name="bahiasActivas" label="Bahías activas" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="prefijoTurno" label="Prefijo del número de turno" rules={[{ required: true }]}>
            <Select
              options={['L', 'CW', 'T'].map(v => ({ value: v, label: v }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="usaSecado" label="Incluye etapa de secado/detallado" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="cobroEn" label="Cobrar al" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'recepcion', label: 'Recibir el vehículo' },
                { value: 'entrega', label: 'Entregar el vehículo' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="horasCaducidadEnlace"
            label="Horas antes de que caduque el enlace público (tras entregar)"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={guardar.isPending}>Guardar</Button>
        </Form>
      </Card>
    </div>
  );
}
