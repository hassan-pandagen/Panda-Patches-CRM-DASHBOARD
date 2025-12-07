import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import * as Sentry from "@sentry/react";
import { logger } from '../services/logger';

interface ChunkErrorBoundaryState {
  hasChunkError: boolean;
  error: Error | null;
  retryCount: number;
}

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
    if (error.message?.includes('dynamically imported module') || 
        error.message?.includes('Failed to load chunk')) {
      return { hasChunkError: true, error };
    }
    // Let other errors bubble up
    throw error;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.state.hasChunkError) {
      logger.error('Chunk loading error:', error, errorInfo);
      // Send to Sentry
      Sentry.captureException(error, {
        contexts: {
          chunkError: {
            message: error.message,
            componentStack: errorInfo.componentStack,
            retryCount: this.state.retryCount,
          }
        }
      });
    }
  }

  handleRetry = () => {
    this.setState(prev => ({ 
      hasChunkError: false, 
      error: null,
      retryCount: prev.retryCount + 1
    }));
    // Hard reload to clear all caches
    window.location.href = '/';
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
              <h2 className="text-2xl font-bold text-white">Loading Error</h2>
              <p className="text-slate-400 mt-2 text-sm">
                Failed to load a required page module. This might be due to:
              </p>
              <ul className="text-slate-400 mt-3 text-xs text-left list-disc list-inside space-y-1">
                <li>Network connectivity issues</li>
                <li>Browser cache problems</li>
                <li>Server-side file issues</li>
              </ul>
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
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ChunkErrorBoundary };
