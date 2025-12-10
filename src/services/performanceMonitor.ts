// src/services/performanceMonitor.ts

import { supabase } from './supabaseClient';
import { logger } from './logger';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  type: 'api' | 'operation' | 'render';
  userId?: string;
  userEmail?: string;
}

class PerformanceMonitor {
  private pendingMetrics: Map<string, number> = new Map();
  private metrics: PerformanceMetric[] = [];
  private isEnabled: boolean = false;

  constructor() {
    // In a real app, you might have a global state or local storage
    // to enable/disable this for certain users or sessions.
    this.isEnabled = import.meta.env.DEV; // Only run in development mode by default
  }

  public start(name: string): void {
    if (!this.isEnabled) return;
    this.pendingMetrics.set(name, performance.now());
  }

  public startMeasure(name: string, type: 'api' | 'operation' | 'render' = 'operation'): () => void {
    this.start(name);
    return () => this.end(name, type);
  }

  public end(name: string, type: 'api' | 'operation' | 'render'): void {
    if (!this.isEnabled || !this.pendingMetrics.has(name)) return;

    const startTime = this.pendingMetrics.get(name)!;
    const endTime = performance.now();
    const duration = endTime - startTime;

    this.pendingMetrics.delete(name);

    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      type,
    };

    // Also keep a local copy for the local view if needed
    this.metrics.push(metric);
    if (this.metrics.length > 200) {
      this.metrics.shift(); // Keep the local array from growing too large
    }

    // Fire-and-forget the insert to the database
    this.logToDatabase(metric);
  }

  private async logToDatabase(metric: Omit<PerformanceMetric, 'userId' | 'userEmail'>) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Don't log if there's no user context
      return;
    }

    const { error } = await supabase.from('performance_metrics').insert({
      user_id: user.id,
      user_email: user.email,
      metric_name: metric.name,
      metric_type: metric.type,
      duration_ms: metric.duration,
    });

    if (error) {
      logger.error('Failed to log performance metric to DB', {
        metricName: metric.name,
        error,
      });
    }
  }

  public reset(): void {
    this.metrics = [];
    this.pendingMetrics.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();