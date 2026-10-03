import { Tooltip, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { xlinkApi, XlinkTipoDocumento, EstadoXlinkItem } from '../../api/xlink.api';

/**
 * Item "Enviar por HiCloud Xlink" para el menú ⋮ de un listado — mismo
 * motivo/tooltip que EnviarPorXlinkButton (viene de /xlink/estado, nunca
 * una condición propia). Antd no siempre dispara el Tooltip con el item
 * `disabled` de un Dropdown (depende del tema/versión) — por eso, además
 * del tooltip, un click mientras no es elegible muestra el motivo como
 * aviso en vez de no hacer nada: nunca se queda sin explicación.
 */
export function xlinkMenuItem(
  tipoDocumento: XlinkTipoDocumento,
  documentoId: number,
  estado: EstadoXlinkItem | undefined,
  onEnviando: (p: Promise<void>) => void,
): NonNullable<MenuProps['items']>[number] {
  const elegible = !!estado && estado.elegible && !estado.yaEnviado;
  const motivo = !estado
    ? 'Cargando...'
    : estado.yaEnviado
      ? `Ya enviado${estado.estadoReceptor ? ` (${estado.estadoReceptor})` : ''}`
      : (estado.motivo ?? 'No elegible');

  return {
    key: 'xlink-enviar',
    icon: <SendOutlined />,
    disabled: !elegible,
    label: elegible ? 'Enviar por HiCloud Xlink' : (
      <Tooltip title={motivo}><span>Enviar por HiCloud Xlink</span></Tooltip>
    ),
    onClick: () => {
      if (!elegible) { message.warning(motivo); return; }
      onEnviando(
        xlinkApi.publicar(tipoDocumento, [documentoId]).then((resultados) => {
          const r = resultados[0];
          if (r?.ok) message.success('Enviado por HiCloud Xlink');
          else message.error(r?.error ?? 'No se pudo enviar');
        }),
      );
    },
  };
}
