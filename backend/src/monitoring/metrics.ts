import { Request, Response } from 'express';
import { logger } from '../utils/logger';

interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

interface Counter {
  name: string;
  help: string;
  values: Map<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  values: Map<string, number>;
}

interface Histogram {
  name: string;
  help: string;
  buckets: number[];
  values: Map<string, number[]>;
  counts: Map<string, number>;
  sums: Map<string, number>;
}

/**
 * Lightweight Prometheus-compatible metrics collector
 * In production, use prom-client library
 */
class MetricsCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private startTime: number = Date.now();

  constructor() {
    this.initDefaultMetrics();
  }

  /**
   * Initialize default metrics
   */
  private initDefaultMetrics(): void {
    // HTTP metrics
    this.registerCounter(
      'http_requests_total',
      'Total number of HTTP requests'
    );
    this.registerCounter(
      'http_requests_errors_total',
      'Total number of HTTP errors'
    );

    this.registerHistogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );

    // Database metrics
    this.registerCounter(
      'database_queries_total',
      'Total number of database queries'
    );
    this.registerCounter(
      'database_errors_total',
      'Total number of database errors'
    );
    this.registerHistogram(
      'database_query_duration_seconds',
      'Database query duration in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
    );

    // Business metrics
    this.registerCounter('invites_created_total', 'Total invites created');
    this.registerCounter('invites_accepted_total', 'Total invites accepted');
    this.registerCounter('residents_created_total', 'Total residents created');
    this.registerCounter(
      'auth_login_attempts_total',
      'Total login attempts'
    );
    this.registerCounter(
      'auth_login_failures_total',
      'Total login failures'
    );
    this.registerCounter(
      'password_reset_requests_total',
      'Total password reset requests'
    );
    this.registerCounter(
      'email_verification_sent_total',
      'Total email verifications sent'
    );

    // Rate limiting
    this.registerCounter(
      'rate_limit_exceeded_total',
      'Total rate limit violations'
    );

    // System metrics
    this.registerGauge('process_heap_bytes', 'Process heap size in bytes');
    this.registerGauge('process_rss_bytes', 'Process RSS in bytes');
  }

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, {
        name,
        help,
        values: new Map(),
      });
    }
  }

  /**
   * Register a gauge metric
   */
  registerGauge(name: string, help: string): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, {
        name,
        help,
        values: new Map(),
      });
    }
  }

  /**
   * Register a histogram metric
   */
  registerHistogram(name: string, help: string, buckets: number[]): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        help,
        buckets: buckets.sort((a, b) => a - b),
        values: new Map(),
        counts: new Map(),
        sums: new Map(),
      });
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const counter = this.counters.get(name);
    if (!counter) {
      logger.warn(`Counter ${name} not found`);
      return;
    }

    const key = this.serializeLabels(labels);
    const current = counter.values.get(key) || 0;
    counter.values.set(key, current + 1);
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      logger.warn(`Gauge ${name} not found`);
      return;
    }

    const key = this.serializeLabels(labels);
    gauge.values.set(key, value);
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      logger.warn(`Histogram ${name} not found`);
      return;
    }

    const key = this.serializeLabels(labels);

    // Update sum
    const currentSum = histogram.sums.get(key) || 0;
    histogram.sums.set(key, currentSum + value);

    // Update count
    const currentCount = histogram.counts.get(key) || 0;
    histogram.counts.set(key, currentCount + 1);

    // Update buckets
    if (!histogram.values.has(key)) {
      histogram.values.set(key, new Array(histogram.buckets.length).fill(0));
    }
    const bucketCounts = histogram.values.get(key)!;

    for (let i = 0; i < histogram.buckets.length; i++) {
      if (value <= histogram.buckets[i]) {
        bucketCounts[i]++;
      }
    }
  }

  /**
   * Serialize labels to string key
   */
  private serializeLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return '';

    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  /**
   * Parse label string back to object
   */
  private parseLabels(labelStr: string): Record<string, string> {
    if (!labelStr) return {};

    const labels: Record<string, string> = {};
    const pairs = labelStr.split(',');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      labels[key] = value.replace(/"/g, '');
    }

    return labels;
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.setGauge('process_heap_bytes', memUsage.heapUsed);
    this.setGauge('process_rss_bytes', memUsage.rss);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    let output = '';

    // Update system metrics before export
    this.updateSystemMetrics();

    // Export counters
    for (const [name, counter] of this.counters) {
      output += `# HELP ${name} ${counter.help}\n`;
      output += `# TYPE ${name} counter\n`;

      for (const [labelStr, value] of counter.values) {
        const labelPart = labelStr ? `{${labelStr}}` : '';
        output += `${name}${labelPart} ${value}\n`;
      }
    }

    // Export gauges
    for (const [name, gauge] of this.gauges) {
      output += `# HELP ${name} ${gauge.help}\n`;
      output += `# TYPE ${name} gauge\n`;

      for (const [labelStr, value] of gauge.values) {
        const labelPart = labelStr ? `{${labelStr}}` : '';
        output += `${name}${labelPart} ${value}\n`;
      }
    }

    // Export histograms
    for (const [name, histogram] of this.histograms) {
      output += `# HELP ${name} ${histogram.help}\n`;
      output += `# TYPE ${name} histogram\n`;

      for (const [labelStr] of histogram.counts) {
        const labels = this.parseLabels(labelStr);
        const bucketCounts = histogram.values.get(labelStr) || [];
        const sum = histogram.sums.get(labelStr) || 0;
        const count = histogram.counts.get(labelStr) || 0;

        // Bucket counts
        for (let i = 0; i < histogram.buckets.length; i++) {
          const bucketLabel = { ...labels, le: histogram.buckets[i].toString() };
          const bucketLabelStr = this.serializeLabels(bucketLabel);
          output += `${name}_bucket{${bucketLabelStr}} ${bucketCounts[i]}\n`;
        }

        // +Inf bucket
        const infLabel = { ...labels, le: '+Inf' };
        const infLabelStr = this.serializeLabels(infLabel);
        output += `${name}_bucket{${infLabelStr}} ${count}\n`;

        // Sum
        const labelPart = labelStr ? `{${labelStr}}` : '';
        output += `${name}_sum${labelPart} ${sum}\n`;
        output += `${name}_count${labelPart} ${count}\n`;
      }
    }

    // Process uptime
    const uptime = (Date.now() - this.startTime) / 1000;
    output += `# HELP process_uptime_seconds Process uptime in seconds\n`;
    output += `# TYPE process_uptime_seconds gauge\n`;
    output += `process_uptime_seconds ${uptime}\n`;

    return output;
  }

  /**
   * Get metrics endpoint handler
   */
  getMetricsHandler(): (req: Request, res: Response) => void {
    return (req: Request, res: Response) => {
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(this.exportPrometheus());
    };
  }
}

// Export singleton
export const metrics = new MetricsCollector();
