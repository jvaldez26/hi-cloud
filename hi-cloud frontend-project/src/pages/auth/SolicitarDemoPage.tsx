import { useNavigate } from 'react-router-dom';
import DemoModal from './DemoModal';

export default function SolicitarDemoPage() {
  const navigate = useNavigate();
  return <DemoModal open onClose={() => navigate('/', { replace: true })} />;
}
