import { Row, Button, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import CompraFormInner from './CompraFormInner';

const { Title } = Typography;

export default function CompraFormPage() {
  const navigate = useNavigate();
  return (
    <div>
      <Row align="middle" style={{ marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/compras')}>Volver</Button>
        <Title level={4} style={{ margin: '0 0 0 8px' }}>Nueva Orden de Compra</Title>
      </Row>
      <CompraFormInner
        onSuccess={() => { message.success('Compra creada'); navigate('/compras'); }}
        onCancel={() => navigate('/compras')}
      />
    </div>
  );
}
