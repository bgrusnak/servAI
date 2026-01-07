import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger, securityLogger } from '../utils/logger';
import { pool } from '../db';
import validator from 'validator';

// CRITICAL: Rate limiting
const MAX_EVENTS_PER_MINUTE = 100;
const MAX_SOCKETS_PER_USER = 5;
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 60000; // 60 seconds

// CRITICAL: Event whitelist
const ALLOWED_EVENTS = new Set([
  'message',
  'notification',
  'ticket:update',
  'ticket:comment',
  'invoice:update',
  'meter:update',
  'chat:message',
  'typing',
  'online',
  'offline',
]);

interface SocketData {
  userId: string;
  userRole: string;
  eventCount: number;
  windowStart: number;
  lastHeartbeat: number;
}

export class WebSocketService {
  private io: SocketServer | null = null;
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * CRITICAL: Validate UUID format
   */
  private validateUUID(id: string): boolean {
    return validator.isUUID(id, 4);
  }

  /**
   * CRITICAL: Validate event name
   */
  private validateEventName(event: string): boolean {
    if (!event || typeof event !== 'string') {
      return false;
    }

    if (event.length > 100) {
      return false;
    }

    // Check against whitelist
    return ALLOWED_EVENTS.has(event);
  }

  /**
   * CRITICAL: Sanitize message data (prevent XSS)
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Check size (prevent DoS)
    const jsonString = JSON.stringify(data);
    if (jsonString.length > MAX_MESSAGE_SIZE) {
      throw new Error('Message too large');
    }

    // Recursively sanitize objects
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map((item) => this.sanitizeData(item));
      }

      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Sanitize key
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeData(value);
      }
      return sanitized;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    return data;
  }

  /**
   * CRITICAL: Sanitize string (prevent XSS)
   */
  private sanitizeString(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Remove script tags
    let sanitized = text.replace(/<script[^>]*>.*?<\/script>/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Limit length
    return sanitized.slice(0, 10000);
  }

  /**
   * CRITICAL: Check rate limit
   */
  private checkRateLimit(socket: Socket): boolean {
    const data = socket.data as SocketData;
    const now = Date.now();

    // Reset window if needed
    if (now - data.windowStart > 60000) {
      data.eventCount = 0;
      data.windowStart = now;
    }

    // Check limit
    if (data.eventCount >= MAX_EVENTS_PER_MINUTE) {
      return false;
    }

    data.eventCount++;
    return true;
  }

  /**
   * CRITICAL: Emit with validation
   */
  private safeEmit(target: any, event: string, data: any, userId?: string): void {
    try {
      // Validate event name
      if (!this.validateEventName(event)) {
        logger.warn('Invalid event name blocked', { event, userId });
        return;
      }

      // Sanitize data
      const sanitized = this.sanitizeData(data);

      // Emit
      target.emit(event, sanitized);
    } catch (error: any) {
      logger.error('Failed to emit event', {
        error: error.message,
        event,
        userId,
      });
    }
  }

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: config.cors.allowedOrigins,
        credentials: true,
      },
      path: '/ws',
      maxHttpBufferSize: MAX_MESSAGE_SIZE,
      pingTimeout: HEARTBEAT_TIMEOUT,
      pingInterval: HEARTBEAT_INTERVAL,
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwt.secret) as any;
        socket.data.userId = decoded.id;
        socket.data.userRole = decoded.role;
        socket.data.eventCount = 0;
        socket.data.windowStart = Date.now();
        socket.data.lastHeartbeat = Date.now();

        // CRITICAL: Check socket limit per user
        const userSocketCount = this.userSockets.get(decoded.id)?.length || 0;
        if (userSocketCount >= MAX_SOCKETS_PER_USER) {
          return next(new Error('Too many connections'));
        }

        next();
      } catch (error: any) {
        logger.error('WebSocket authentication failed', { error: error.message });
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId)!.push(socket.id);

      logger.info('WebSocket client connected', {
        socketId: socket.id,
        userId,
      });

      // Join user's room
      socket.join(`user:${userId}`);

      // Setup heartbeat monitoring
      const heartbeatInterval = setInterval(() => {
        const data = socket.data as SocketData;
        if (Date.now() - data.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          logger.warn('Socket heartbeat timeout', { socketId: socket.id, userId });
          socket.disconnect(true);
        }
      }, HEARTBEAT_INTERVAL);

      this.heartbeatIntervals.set(socket.id, heartbeatInterval);

      // Heartbeat event
      socket.on('heartbeat', () => {
        socket.data.lastHeartbeat = Date.now();
      });

      // Subscribe to condo updates
      socket.on('subscribe:condo', async (condoId: string) => {
        try {
          // CRITICAL: Validate UUID format
          if (!this.validateUUID(condoId)) {
            socket.emit('error', { message: 'Invalid condo ID format' });
            return;
          }

          // CRITICAL: Check rate limit
          if (!this.checkRateLimit(socket)) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
          }

          // Verify user has access to condo
          const access = await this.verifyCondoAccess(userId, condoId);
          if (access) {
            socket.join(`condo:${condoId}`);

            securityLogger.dataAccess(
              userId,
              `condo:${condoId}`,
              'ws_subscribe',
              {}
            );

            socket.emit('subscribed', { room: 'condo', id: condoId });
            logger.info('User subscribed to condo', { userId, condoId });
          } else {
            socket.emit('error', { message: 'Access denied to condo' });
          }
        } catch (error: any) {
          logger.error('Failed to subscribe to condo', {
            error: error.message,
            userId,
            condoId,
          });
          socket.emit('error', { message: 'Subscription failed' });
        }
      });

      // Subscribe to ticket updates
      socket.on('subscribe:ticket', async (ticketId: string) => {
        try {
          // CRITICAL: Validate UUID format
          if (!this.validateUUID(ticketId)) {
            socket.emit('error', { message: 'Invalid ticket ID format' });
            return;
          }

          // CRITICAL: Check rate limit
          if (!this.checkRateLimit(socket)) {
            socket.emit('error', { message: 'Rate limit exceeded' });
            return;
          }

          const access = await this.verifyTicketAccess(userId, ticketId);
          if (access) {
            socket.join(`ticket:${ticketId}`);

            securityLogger.dataAccess(
              userId,
              `ticket:${ticketId}`,
              'ws_subscribe',
              {}
            );

            socket.emit('subscribed', { room: 'ticket', id: ticketId });
            logger.info('User subscribed to ticket', { userId, ticketId });
          } else {
            socket.emit('error', { message: 'Access denied to ticket' });
          }
        } catch (error: any) {
          logger.error('Failed to subscribe to ticket', {
            error: error.message,
            userId,
            ticketId,
          });
          socket.emit('error', { message: 'Subscription failed' });
        }
      });

      socket.on('disconnect', () => {
        // Clear heartbeat interval
        const interval = this.heartbeatIntervals.get(socket.id);
        if (interval) {
          clearInterval(interval);
          this.heartbeatIntervals.delete(socket.id);
        }

        // Remove socket from user tracking
        const sockets = this.userSockets.get(userId);
        if (sockets) {
          const index = sockets.indexOf(socket.id);
          if (index > -1) {
            sockets.splice(index, 1);
          }
          if (sockets.length === 0) {
            this.userSockets.delete(userId);
          }
        }

        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          userId,
        });
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;
    this.safeEmit(this.io.to(`user:${userId}`), event, data, userId);
  }

  /**
   * Emit event to condo
   */
  emitToCondo(condoId: string, event: string, data: any): void {
    if (!this.io) return;
    this.safeEmit(this.io.to(`condo:${condoId}`), event, data);
  }

  /**
   * Emit event to ticket subscribers
   */
  emitToTicket(ticketId: string, event: string, data: any): void {
    if (!this.io) return;
    this.safeEmit(this.io.to(`ticket:${ticketId}`), event, data);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;
    this.safeEmit(this.io, event, data);
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  private async verifyCondoAccess(userId: string, condoId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT 1 FROM residents r
         JOIN units u ON r.unit_id = u.id
         WHERE r.user_id = $1 AND u.condo_id = $2 AND r.is_active = true
         LIMIT 1`,
        [userId, condoId]
      );
      return result.rows.length > 0;
    } catch (error: any) {
      logger.error('Failed to verify condo access', {
        error: error.message,
        userId,
        condoId,
      });
      return false;
    }
  }

  private async verifyTicketAccess(userId: string, ticketId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT 1 FROM tickets t
         WHERE t.id = $1 AND (t.created_by = $2 OR t.assigned_to = $2)
         LIMIT 1`,
        [ticketId, userId]
      );
      return result.rows.length > 0;
    } catch (error: any) {
      logger.error('Failed to verify ticket access', {
        error: error.message,
        userId,
        ticketId,
      });
      return false;
    }
  }
}

export const websocketService = new WebSocketService();