// src/services/performanceMonitor.ts
// ✅ UPGRADE 8: Performance monitoring service

import { logger } from './logger';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  type: 'api' | 'operation' | 'render';
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100; // Keep last 100 metrics

  /**
   * Start measuring an operation and return a function to end it
   * Usage:
   * const end = performanceMonitor.startMeasure('fetchOrders', 'api');
   * const data = await fetchOrders();
   * end();
   */
  startMeasure = (name: string, type: 'api' | 'operation' | 'render' = 'operation') => {
    const startMark = `${name}-start-${Date.now()}`;
    const endMark = `${name}-end-${Date.now()}`;

    performance.mark(startMark);

    return () => {
      performance.mark(endMark);
      
      try {
        const measure = performance.measure(name, startMark, endMark);
        const metric: PerformanceMetric = {
          name,
          duration: measure.duration,
          timestamp: Date.now(),
          type,
        };

        this.recordMetric(metric);
        
        // Log slow operations (>1000ms)
        if (measure.duration > 1000) {
          logger.warn(
            `[Performance] Slow ${type}: ${name} took ${measure.duration.toFixed(2)}ms`
          );
        } else {
          logger.debug(
            `[Performance] ${type}: ${name} took ${measure.duration.toFixed(2)}ms`
          );
        }

        // Cleanup marks
        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
        performance.clearMeasures(name);

        return metric;
      } catch (error) {
        logger.error('[Performance] Failed to measure', error);
        return null;
      }
    };
  };

  /**
   * Record a metric manually
   */
  private recordMetric = (metric: PerformanceMetric) => {
    this.metrics.push(metric);
    
    // Keep only last N metrics to avoid memory bloat
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  };

  /**
   * Get average duration for a specific operation type
   */
  getAverageDuration = (name?: string, type?: string): number => {
    let filtered = this.metrics;

    if (name) {
      filtered = filtered.filter(m => m.name === name);
    }
    if (type) {
      filtered = filtered.filter(m => m.type === type);
    }

    if (filtered.length === 0) return 0;
    
    const sum = filtered.reduce((acc, m) => acc + m.duration, 0);
    return sum / filtered.length;
  };

  /**
   * Get all metrics (for debugging)
   */
  getAllMetrics = (): PerformanceMetric[] => {
    return [...this.metrics];
  };

  /**
   * Get metrics summary
   */
  getSummary = () => {
    const apiMetrics = this.metrics.filter(m => m.type === 'api');
    const operationMetrics = this.metrics.filter(m => m.type === 'operation');
    const renderMetrics = this.metrics.filter(m => m.type === 'render');

    return {
      totalMetrics: this.metrics.length,
      api: {
        count: apiMetrics.length,
        avgDuration: this.getAverageDuration(undefined, 'api'),
        slowest: apiMetrics.length > 0 
          ? Math.max(...apiMetrics.map(m => m.duration))
          : 0,
      },
      operations: {
        count: operationMetrics.length,
        avgDuration: this.getAverageDuration(undefined, 'operation'),
        slowest: operationMetrics.length > 0
          ? Math.max(...operationMetrics.map(m => m.duration))
          : 0,
      },
      renders: {
        count: renderMetrics.length,
        avgDuration: this.getAverageDuration(undefined, 'render'),
        slowest: renderMetrics.length > 0
          ? Math.max(...renderMetrics.map(m => m.duration))
          : 0,
      },
    };
  };

  /**
   * Reset all metrics
   */
  reset = () => {
    this.metrics = [];
    logger.info('[Performance] Metrics cleared');
  };
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
