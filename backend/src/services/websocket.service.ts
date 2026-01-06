import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { pool } from '../db';

export class WebSocketService {
  private io: SocketServer | null = null;
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: config.cors.allowedOrigins,
        credentials: true
      },
      path: '/ws'
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
        
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', { error });
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
        userId 
      });

      // Join user's room
      socket.join(`user:${userId}`);

      // Subscribe to condo updates
      socket.on('subscribe:condo', async (condoId: string) => {
        try {
          // Verify user has access to condo
          const access = await this.verifyCondoAccess(userId, condoId);
          if (access) {
            socket.join(`condo:${condoId}`);
            logger.info('User subscribed to condo', { userId, condoId });
          }
        } catch (error) {
          logger.error('Failed to subscribe to condo', { error, userId, condoId });
        }
      });

      // Subscribe to ticket updates
      socket.on('subscribe:ticket', async (ticketId: string) => {
        try {
          const access = await this.verifyTicketAccess(userId, ticketId);
          if (access) {
            socket.join(`ticket:${ticketId}`);
            logger.info('User subscribed to ticket', { userId, ticketId });
          }
        } catch (error) {
          logger.error('Failed to subscribe to ticket', { error, userId, ticketId });
        }
      });

      socket.on('disconnect', () => {
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
          userId 
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
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit event to condo
   */
  emitToCondo(condoId: string, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(`condo:${condoId}`).emit(event, data);
  }

  /**
   * Emit event to ticket subscribers
   */
  emitToTicket(ticketId: string, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(`ticket:${ticketId}`).emit(event, data);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;
    this.io.emit(event, data);
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
    } catch (error) {
      logger.error('Failed to verify condo access', { error, userId, condoId });
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
    } catch (error) {
      logger.error('Failed to verify ticket access', { error, userId, ticketId });
      return false;
    }
  }
}

export const websocketService = new WebSocketService();
