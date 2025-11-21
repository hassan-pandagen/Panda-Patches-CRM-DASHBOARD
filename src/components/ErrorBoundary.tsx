import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      errorInfo: errorInfo
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optional: Navigate to home if using a router outside this boundary
    window.location.href = '/'; 
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
          
          {/* Background Ambience (Blobs) */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-orange/10 rounded-full blur-3xl animate-blob" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

          <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-4 bg-red-500/10 rounded-full mb-4">
                <AlertTriangle className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
              <p className="text-slate-400 mt-2 text-sm">
                We encountered an unexpected error. Our team has been notified.
              </p>
            </div>
            
            {/* Error Details Box */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 mb-8 text-left overflow-hidden">
              <p className="text-red-300 font-mono text-xs mb-2 break-words">
                {this.state.error?.message || 'Unknown Error'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="text-[10px] text-slate-500 cursor-pointer">
                  <summary className="hover:text-slate-300 transition-colors">View Stack Trace</summary>
                  <pre className="mt-2 whitespace-pre-wrap overflow-auto max-h-32 custom-scrollbar">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 px-4 rounded-xl transition-all border border-slate-600 hover:border-slate-500 font-medium"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
              <button 
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-3 px-4 rounded-xl transition-all shadow-lg shadow-brand-orange/20 font-bold"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };