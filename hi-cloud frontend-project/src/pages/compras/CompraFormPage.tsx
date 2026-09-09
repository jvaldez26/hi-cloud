import { Row, Button, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import CompraFormInner from './CompraFormInner';

const { Title } = Typography;

export default function CompraFormPage() {
  const navigate = useNavigate();
  // Una sola pantalla para alta y edición, como CotizacionFormPage: la ruta
  // `/compras/:id/editar` trae el id y `/compras/nueva` no.
  const { id } = useParams<{ id?: string }>();
  const esEdicion = !!id;

  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compras')}>Volver</Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>
          {esEdicion ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
        </Title>
      </Row>
      <CompraFormInner
        compraId={esEdicion ? Number(id) : undefined}
        onSuccess={() => {
          message.success(esEdicion ? 'Compra actualizada' : 'Compra creada');
          navigate('/compras');
        }}
        onCancel={() => navigate('/compras')}
      />
    </div>
  );
}
