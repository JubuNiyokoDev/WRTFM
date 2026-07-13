import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
          <div className="text-center p-8 border border-destructive/50 rounded-lg bg-destructive/10 max-w-lg">
            <h1 className="text-2xl font-bold text-destructive mb-4">Something went wrong</h1>
            <p className="mb-4">An unexpected error occurred. Please try refreshing the page.</p>
            <details className="text-left bg-muted/50 p-4 rounded-md text-xs overflow-auto">
              <summary className="cursor-pointer mb-2 font-medium">Error Details</summary>
              <pre className="whitespace-pre-wrap break-all">
                {this.state.error?.toString()}
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
