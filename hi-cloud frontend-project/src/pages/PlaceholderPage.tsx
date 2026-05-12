import { Card, Empty, Typography } from 'antd';
import { useLocation } from 'react-router-dom';

const { Title } = Typography;

const labels: Record<string, string> = {
  '/nomina':        'Nómina y RRHH',
  '/contabilidad':  'Contabilidad General',
  '/tesoreria':     'Tesorería y Flujo de Caja',
  '/activos-fijos': 'Activos Fijos',
  '/presupuestos':  'Presupuestos y Planificación',
  '/configuracion': 'Configuración del Sistema',
};

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const label = labels[pathname] ?? pathname;

  return (
    <Card>
      <Empty
        description={
          <>
            <Title level={4}>{label}</Title>
            <p>Este módulo está disponible en el backend. El frontend se construirá próximamente.</p>
            <p>Accede a <a href="http://localhost:3000/api" target="_blank" rel="noreferrer">Swagger UI</a> para explorar la API.</p>
          </>
        }
      />
    </Card>
  );
}
