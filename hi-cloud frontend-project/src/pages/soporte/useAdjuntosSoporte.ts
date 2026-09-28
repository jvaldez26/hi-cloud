import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { validarNuevosAdjuntos } from './validarAdjuntosSoporte';
import { redimensionarSiEsGrande } from './redimensionarImagen';

export interface PreviewAdjunto {
  file: File;
  url:  string;
}

/**
 * Estado de los adjuntos NUEVOS (todavía sin subir) del formulario de
 * Soporte. Centralizado en un hook — no en el picker visual — porque el
 * pegado con Ctrl+V debe funcionar desde cualquier parte del formulario
 * (el mensaje, el asunto…), no solo con foco en la zona de arrastrar.
 * SoportePage.tsx conecta `onPaste` del formulario completo a
 * `agregarArchivos`; el picker solo es la parte visual (drop zone + miniaturas).
 */
export function useAdjuntosSoporte() {
  const [archivos, setArchivos]     = useState<File[]>([]);
  const [procesando, setProcesando] = useState(false);

  const agregarArchivos = useCallback(async (nuevos: File[]) => {
    if (nuevos.length === 0) return;

    const { aceptados, rechazados } = validarNuevosAdjuntos(archivos, nuevos);
    for (const r of rechazados) message.warning(`"${r.archivo.name || 'archivo'}" — ${r.motivo}`);
    if (aceptados.length === 0) return;

    setProcesando(true);
    try {
      const procesados = await Promise.all(aceptados.map(redimensionarSiEsGrande));
      setArchivos(prev => [...prev, ...procesados]);
    } finally {
      setProcesando(false);
    }
  }, [archivos]);

  const quitarArchivo = useCallback((idx: number) => {
    setArchivos(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const limpiar = useCallback(() => setArchivos([]), []);

  const previews = useMemo<PreviewAdjunto[]>(
    () => archivos.map(file => ({ file, url: URL.createObjectURL(file) })),
    [archivos],
  );
  useEffect(() => () => { previews.forEach(p => URL.revokeObjectURL(p.url)); }, [previews]);

  return { archivos, previews, agregarArchivos, quitarArchivo, limpiar, procesando };
}
