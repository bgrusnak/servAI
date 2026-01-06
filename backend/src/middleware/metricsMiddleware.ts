import { Request, Response, NextFunction } from 'express';
import { metrics } from '../monitoring/metrics';

/**
 * Middleware to collect HTTP metrics
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture response finish event
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds

    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode.toString(),
    };

    // Increment request counter
    metrics.incrementCounter('http_requests_total', labels);

    // Record duration
    metrics.observeHistogram('http_request_duration_seconds', duration, labels);

    // Track errors (4xx, 5xx)
    if (res.statusCode >= 400) {
      metrics.incrementCounter('http_requests_errors_total', {
        method: req.method,
        status: res.statusCode.toString(),
      });
    }
  });

  next();
}
