import { Empty } from 'antd';

interface Props { titulo: string }

export default function EducativoPlaceholder({ titulo }: Props) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Empty description={`${titulo} — próximamente`} />
    </div>
  );
}
