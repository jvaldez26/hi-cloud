import React from 'react';
import { Button, Result } from 'antd';

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{ padding: 40 }}>
          <Result
            status="500"
            title="Algo salió mal"
            subTitle={this.state.error?.message ?? 'Error inesperado. Recarga la página.'}
            extra={
              <Button type="primary" onClick={() => this.setState({ hasError: false })}>
                Intentar de nuevo
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
