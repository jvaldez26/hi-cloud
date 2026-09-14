import { Result } from 'antd';
import { ToolOutlined } from '@ant-design/icons';

interface Props { titulo: string }

/**
 * Usado en las 8 rutas del módulo Educativo que no tienen backend detrás
 * (boletines, disciplina, biblioteca, transporte, comedor, enfermería,
 * comunicados, reportes — ver src/educativo/README.md). Antes mostraba un
 * <Empty> genérico con "— próximamente" en gris chico: se veía igual que
 * una lista vacía, no como una pantalla deliberadamente deshabilitada.
 * Ahora lo dice explícito, para que nadie confunda "sin datos" con
 * "sin construir".
 */
export default function EducativoPlaceholder({ titulo }: Props) {
  return (
    <div style={{ padding: '40px 24px' }}>
      <Result
        icon={<ToolOutlined />}
        status="info"
        title="Módulo no disponible"
        subTitle={`"${titulo}" todavía no tiene funcionalidad implementada en Educativo.`}
      />
    </div>
  );
}
