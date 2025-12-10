import React, { useState, useMemo } from 'react';
import { Activity, RotateCcw, TrendingUp, Clock, Zap } from 'lucide-react';
import Button from '../components/ui/Button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';

interface PerformanceMetric {
  name: string;
  metric_name: string;
  metric_type: 'api' | 'operation' | 'render';
  duration_ms: number;
  duration: number;
  timestamp: number;
  type: 'api' | 'operation' | 'render';
}

interface Summary {
  totalMetrics: number;
  api: { count: number; avgDuration: number; slowest: number };
  operations: { count: number; avgDuration: number; slowest: number };
  renders: { count: number; avgDuration: number; slowest: number };
}

const PerformanceMetricsPage: React.FC = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [filterType, setFilterType] = useState<'all' | 'api' | 'operation' | 'render'>('all');
  const [sortBy, setSortBy] = useState<'duration' | 'recent'>('recent');

  const { data: metrics = [], isLoading, refetch } = useQuery({
    queryKey: ['performance-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500); // Limit to last 500 metrics to keep it snappy
      if (error) throw error;
      return data;
    },
    enabled: role === 'ADMIN',
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const clearMetricsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('performance_metrics').delete().gt('id', 0);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-metrics'] });
      success('All performance metrics have been cleared.');
    },
    onError: (err: any) => {
      error('Failed to clear metrics', err.message);
    },
  });

  const handleClearMetrics = () => {
    if (window.confirm('Are you sure you want to delete all performance metrics from the database? This cannot be undone.')) {
      clearMetricsMutation.mutate();
    }
  };

  const summary = useMemo<Summary | null>(() => {
    if (!metrics || metrics.length === 0) return null;

    const calculateStats = (type: string) => {
      const filtered = metrics.filter(m => m.metric_type === type);
      const count = filtered.length;
      const totalDuration = filtered.reduce((sum, m) => sum + m.duration_ms, 0);
      const avgDuration = count > 0 ? totalDuration / count : 0;
      const slowest = filtered.reduce((max, m) => Math.max(max, m.duration_ms), 0);
      return { count, avgDuration, slowest };
    };

    return {
      totalMetrics: metrics.length,
      api: calculateStats('api'),
      operations: calculateStats('operation'),
      renders: calculateStats('render'),
    };
  }, [metrics]);

  const filteredMetrics = (metrics || [])
    .filter(m => filterType === 'all' || m.type === filterType)
    .sort((a, b) => {
      if (sortBy === 'duration') {
        return b.duration - a.duration;
      }
      return b.timestamp - a.timestamp;
    });

  const getMetricColor = (duration: number) => {
    if (duration > 1000) return 'text-red-400'; // Slower than 1s
    if (duration > 500) return 'text-yellow-400'; // Slower than 500ms
    return 'text-green-400';
  };

  const getMetricBgColor = (duration: number) => {
    if (duration > 1000) return 'bg-red-500/10 border border-red-500/30'; // Slower than 1s
    if (duration > 500) return 'bg-yellow-500/10 border border-yellow-500/30';
    return 'bg-green-500/10 border border-green-500/30';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'api':
        return <Zap className="w-4 h-4" />;
      case 'operation':
        return <Clock className="w-4 h-4" />;
      case 'render':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Performance Metrics</h1>
          <p className="text-slate-400 mt-1">Real-time monitoring of application performance</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="secondary" size="sm" disabled={isLoading}>
            <Activity className="w-4 h-4 mr-2" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={handleClearMetrics} variant="destructive" size="sm" disabled={clearMetricsMutation.isPending}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Metrics */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Metrics</p>
                <p className="text-2xl font-bold text-white mt-1">{summary.totalMetrics}</p>
              </div>
              <Activity className="w-8 h-8 text-brand-orange/50" />
            </div>
          </div>

          {/* API Metrics */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">API Calls</p>
                <p className="text-2xl font-bold text-white mt-1">{summary.api.count}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Avg: {summary.api.avgDuration.toFixed(2)}ms
                </p>
              </div>
              <Zap className="w-8 h-8 text-blue-400/50" />
            </div>
          </div>

          {/* Operations */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Operations</p>
                <p className="text-2xl font-bold text-white mt-1">{summary.operations.count}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Avg: {summary.operations.avgDuration.toFixed(2)}ms
                </p>
              </div>
              <Clock className="w-8 h-8 text-emerald-400/50" />
            </div>
          </div>

          {/* Renders */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Renders</p>
                <p className="text-2xl font-bold text-white mt-1">{summary.renders.count}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Avg: {summary.renders.avgDuration.toFixed(2)}ms
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-400/50" />
            </div>
          </div>
        </div>
      )}

      {/* Metrics Table */}
      <div className="bg-white/5 border border-white/10 rounded-lg">
        {/* Controls */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-2">
            {['all', 'api', 'operation', 'render'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as any)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  filterType === type
                    ? 'bg-brand-orange text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                sortBy === 'recent'
                  ? 'bg-brand-orange text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('duration')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                sortBy === 'duration'
                  ? 'bg-brand-orange text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              Slowest
            </button>
          </div>
        </div>

        {/* Metrics List */}
        <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
          {filteredMetrics.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No metrics recorded yet</p>
            </div>
          ) : (
            filteredMetrics.map((metric, idx) => (
              <div
                key={`${metric.metric_name}-${metric.created_at}-${idx}`}
                className={`p-3 rounded-lg flex items-center justify-between ${getMetricBgColor(metric.duration_ms)}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-slate-300">{getTypeIcon(metric.metric_type)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{metric.metric_name}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(metric.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className={`text-right ${getMetricColor(metric.duration_ms)}`}>
                  <p className="text-sm font-semibold">{metric.duration_ms.toFixed(2)}ms</p>
                  <p className="text-xs text-slate-400">{metric.metric_type}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Performance Tips */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-300 mb-2">Performance Tips</h3>
        <ul className="text-xs text-blue-200/80 space-y-1">
          <li>• 🟢 Green: &lt; 500ms - Excellent performance</li>
          <li>• 🟡 Yellow: 500-1000ms - Good, but monitor</li>
          <li>• 🔴 Red: &gt; 1000ms - Needs optimization</li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceMetricsPage;
