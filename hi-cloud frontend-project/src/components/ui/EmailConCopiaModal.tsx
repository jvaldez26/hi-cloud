import { Form, Input, Button, Modal } from 'antd';
import { MailOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { configuracionApi } from '../../api/configuracion.api';
import { useQuery } from '@tanstack/react-query';

export interface EmailEnvioParams {
  email: string;
  cc?:   string;
  cco?:  string;
}

interface EmailConCopiaModalProps {
  open:          boolean;
  title:         React.ReactNode;
  documentoInfo?: React.ReactNode;
  onCancel:      () => void;
  onEnviar:      (params: EmailEnvioParams) => void;
  loading?:      boolean;
  okText?:       string;
}

export function EmailConCopiaModal({
  open, title, documentoInfo, onCancel, onEnviar, loading, okText = 'Enviar',
}: EmailConCopiaModalProps) {
  const [form] = Form.useForm();

  const userEmail    = useAuthStore(s => s.user)?.email ?? '';
  const { data: empresaConf } = useQuery({
    queryKey: ['empresa'],
    queryFn:  configuracionApi.getEmpresa,
    staleTime: 60_000,
  });
  const empresaEmail = (empresaConf as any)?.email ?? '';

  const agregarACC = (correo: string) => {
    const actual = (form.getFieldValue('cc') as string) ?? '';
    const lista  = actual.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean);
    if (!lista.includes(correo.trim())) {
      form.setFieldsValue({ cc: [...lista, correo.trim()].join(', ') });
    }
  };

  const validarListaEmails = (_: unknown, value: string) => {
    if (!value) return Promise.resolve();
    const RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidos = value.split(/[,;]/).map((e: string) => e.trim()).filter(e => e && !RE.test(e));
    return invalidos.length
      ? Promise.reject(`Email(s) inválido(s): ${invalidos.join(', ')}`)
      : Promise.resolve();
  };

  const handleCancel = () => { form.resetFields(); onCancel(); };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      footer={null}
      destroyOnClose
      width={480}
      afterClose={() => form.resetFields()}
    >
      {documentoInfo && (
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
          {documentoInfo}
        </p>
      )}

      <Form form={form} layout="vertical"
        onFinish={v => onEnviar({ email: v.email, cc: v.cc || undefined, cco: v.cco || undefined })}>

        <Form.Item name="email" label="Correo del destinatario"
          rules={[
            { required: true, message: 'El correo es obligatorio' },
            { type: 'email',  message: 'Ingresa un email válido' },
          ]}>
          <Input prefix={<MailOutlined />} placeholder="destinatario@empresa.com" size="large" />
        </Form.Item>

        {(userEmail || empresaEmail) && (
          <div style={{ marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {userEmail && (
              <Button size="small" icon={<UserOutlined />} onClick={() => agregarACC(userEmail)}>
                Copiarme a mí
              </Button>
            )}
            {empresaEmail && (
              <Button size="small" icon={<BankOutlined />} onClick={() => agregarACC(empresaEmail)}>
                Copiar empresa
              </Button>
            )}
          </div>
        )}

        <Form.Item name="cc" label="CC (copia visible)"
          rules={[{ validator: validarListaEmails }]}>
          <Input prefix={<MailOutlined />} placeholder="correo1@ejemplo.com, correo2@ejemplo.com" />
        </Form.Item>

        <Form.Item name="cco" label="CCO (copia oculta)"
          rules={[{ validator: validarListaEmails }]}>
          <Input prefix={<MailOutlined />} placeholder="correo@ejemplo.com" />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={loading} block icon={<MailOutlined />}>
          {okText}
        </Button>
      </Form>
    </Modal>
  );
}
