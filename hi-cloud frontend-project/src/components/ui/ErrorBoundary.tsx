import React from 'react';
import { Button, Result, Space } from 'antd';
import * as Sentry from '@sentry/react';
import { moduloActual } from '../../observability/sentryScope';
import { isNavigatingAway } from '../../utils/sessionEvents';

interface State { hasError: boolean; error?: Error; isChunkError: boolean }

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Durante logout suave el interceptor aborta chunks lazy en vuelo.
    // Ese teardown produce errores de React que no son bugs — silenciar.
    if (isNavigatingAway) return;
    console.error('[ErrorBoundary]', error, info);
    // Los chunk-load errors son ruido de deploy (hashes viejos), no bugs → no a Sentry.
    if (!isChunkLoadError(error)) {
      // El scope global (setUser/setTags en sentryScope) ya aporta empresaId/
      // sucursalId/usuario; aquí añadimos origen=render y el módulo (POS, etc.).
      Sentry.captureException(error, {
        tags: { origin: 'render', modulo: moduloActual() },
        contexts: { react: { componentStack: info.componentStack } },
      });
    }
  }

  private handleRetry = () => {
    if (this.state.isChunkError) {
      // Chunk hashes cambiaron en el último deploy — hard reload para obtener el nuevo HTML
      window.location.reload();
    } else {
      this.setState({ hasError: false, isChunkError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      // Si estamos en medio de un logout suave, renderizar null en lugar de la
      // pantalla de crash — el usuario ya está siendo redirigido a /login y
      // no debe ver un error que no tiene nada que hacer al respecto.
      if (isNavigatingAway) return null;
      if (this.props.fallback) return this.props.fallback;

      const subTitle = this.state.isChunkError
        ? 'La aplicación fue actualizada. Recarga la página para continuar.'
        : (this.state.error?.message ?? 'Error inesperado. Recarga la página.');

      return (
        <div style={{ padding: 40 }}>
          <Result
            status="500"
            title="Algo salió mal"
            subTitle={subTitle}
            extra={
              <Space>
                <Button onClick={this.handleRetry}>
                  {this.state.isChunkError ? 'Recargar página' : 'Intentar de nuevo'}
                </Button>
                <Button
                  danger
                  onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
                >
                  Cerrar sesión
                </Button>
              </Space>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
