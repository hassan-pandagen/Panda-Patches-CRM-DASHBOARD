import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { captureException } from '../services/sentryLoader';
import { logger } from '../services/logger';

interface ChunkErrorBoundaryState {
  hasChunkError: boolean;
  error: Error | null;
  retryCount: number;
}

// Global flag to prevent multiple reloads
let isReloading = false;

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChunkErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { 
      hasChunkError: false, 
      error: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ChunkErrorBoundaryState> {
    // Check if it's a chunk loading error
    if (
      error.message?.includes('dynamically imported module') || 
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Failed to load chunk') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Importing a module script failed')
    ) {
      return { hasChunkError: true, error };
    }
    // Let other errors bubble up to the parent error boundary
    return {};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.state.hasChunkError) {
      logger.error('Chunk loading error:', error, errorInfo);
      
      // Send to Sentry with more context (async)
      captureException(error, {
        errorType: 'chunk_loading_error',
        componentStack: errorInfo.componentStack,
        retryCount: this.state.retryCount,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });

      // Auto-reload after first error (with delay to show message)
      if (this.state.retryCount === 0 && !isReloading) {
        isReloading = true;
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    }
  }

  handleRetry = () => {
    this.setState(prev => ({ 
      hasChunkError: false, 
      error: null,
      retryCount: prev.retryCount + 1
    }));
    
    // Clear service worker cache if available
    if ('serviceWorker' in navigator && 'caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    
    // Hard reload with cache clear
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasChunkError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasChunkError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
          
          {/* Background Ambience (Blobs) */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-orange/10 rounded-full blur-3xl animate-blob" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

          <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="p-4 bg-orange-500/10 rounded-full mb-4">
                <AlertTriangle className="w-12 h-12 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">
                {this.state.retryCount === 0 ? 'Updating Application...' : 'Loading Error'}
              </h2>
              <p className="text-slate-400 mt-2 text-sm">
                {this.state.retryCount === 0 
                  ? 'Please wait while we refresh the page...'
                  : 'Failed to load a required page module. This might be due to:'
                }
              </p>
              {this.state.retryCount > 0 && (
                <ul className="text-slate-400 mt-3 text-xs text-left list-disc list-inside space-y-1">
                  <li>A recent update to the application</li>
                  <li>Network connectivity issues</li>
                  <li>Browser cache problems</li>
                </ul>
              )}
            </div>
            
            {/* Error Details Box */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 mb-8 text-left overflow-hidden">
              <p className="text-orange-300 font-mono text-xs break-words">
                {this.state.error?.message || 'Unknown Error'}
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Retry count: {this.state.retryCount}
              </p>
            </div>

            {this.state.retryCount > 0 && (
              <div className="flex gap-4">
                <button 
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-3 px-4 rounded-xl transition-all border border-slate-600 hover:border-slate-500 font-medium"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </button>
                <button 
                  onClick={this.handleRetry}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand-orange hover:bg-orange-600 text-white py-3 px-4 rounded-xl transition-all shadow-lg shadow-brand-orange/20 font-bold"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Load
                </button>
              </div>
            )}

            {this.state.retryCount === 0 && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange"></div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook component to add global listeners
const ChunkErrorHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Handle errors from dynamic imports that happen outside React
    const handleError = (event: ErrorEvent) => {
      const error = event.error || event.message;
      const errorMessage = typeof error === 'string' ? error : error?.message || '';
      
      if (
        errorMessage.includes('dynamically imported module') ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Failed to load chunk') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('Importing a module script failed')
      ) {
        event.preventDefault();
        logger.error('Global chunk loading error:', errorMessage);
        
        captureException(error, {
          errorType: 'chunk_loading_error_global'
        }).catch(() => {
          // Sentry not ready, that's ok
        });

        if (!isReloading) {
          isReloading = true;
          console.log('Detected chunk loading error, reloading page...');
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      }
    };

    // Handle unhandled promise rejections from dynamic imports
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const errorMessage = error?.message || String(error);
      
      if (
        errorMessage.includes('dynamically imported module') ||
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Failed to load chunk') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('Importing a module script failed')
      ) {
        event.preventDefault();
        logger.error('Unhandled chunk loading rejection:', errorMessage);
        
        captureException(error, {
          errorType: 'chunk_loading_rejection'
        }).catch(() => {
          // Sentry not ready, that's ok
        });

        if (!isReloading) {
          isReloading = true;
          console.log('Detected chunk loading error, reloading page...');
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
};

// Combined export
const ChunkErrorBoundaryWithHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ChunkErrorHandler>
      <ChunkErrorBoundary>
        {children}
      </ChunkErrorBoundary>
    </ChunkErrorHandler>
  );
};

export { ChunkErrorBoundaryWithHandler as ChunkErrorBoundary };