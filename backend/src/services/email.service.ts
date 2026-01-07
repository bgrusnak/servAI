import { config } from '../config';
import { logger, securityLogger } from '../utils/logger';
import { redisClient } from '../utils/redis';
import axios from 'axios';
import validator from 'validator';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface PasswordResetEmailData {
  to: string;
  firstName?: string;
  lastName?: string;
  token: string;
  expiresAt: Date;
}

interface PasswordChangedEmailData {
  to: string;
  timestamp: Date;
}

interface EmailVerificationData {
  to: string;
  firstName?: string;
  lastName?: string;
  token: string;
  expiresAt: Date;
}

// CRITICAL: Rate limits
const RATE_LIMIT_PER_EMAIL = 5; // 5 emails per hour per email address
const RATE_LIMIT_PER_USER = 10; // 10 emails per hour per user
const RATE_LIMIT_GLOBAL = 1000; // 1000 emails per hour globally
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

export class EmailService {
  private baseUrl: string;
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private appUrl: string;

  constructor() {
    this.baseUrl = config.email.apiUrl || '';
    this.apiKey = config.email.apiKey || '';
    this.fromEmail = config.email.fromEmail || 'noreply@servai.app';
    this.fromName = config.email.fromName || 'servAI';
    this.appUrl = config.app.url || 'https://servai.app';
  }

  /**
   * CRITICAL: Validate email address (RFC 5322)
   */
  private validateEmail(email: string): void {
    if (!email || typeof email !== 'string') {
      throw new Error('Invalid email address');
    }

    // Length check
    if (email.length > 320) {
      throw new Error('Email address too long');
    }

    // RFC 5322 validation
    if (!validator.isEmail(email)) {
      throw new Error('Invalid email format');
    }

    // CRITICAL: Check for CRLF injection
    if (email.includes('\r') || email.includes('\n')) {
      throw new Error('Email address contains invalid characters');
    }

    // Check for multiple @ symbols (except in quoted strings)
    const atCount = (email.match(/@/g) || []).length;
    if (atCount !== 1) {
      throw new Error('Invalid email format');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /bcc:/i,
      /cc:/i,
      /to:/i,
      /content-type:/i,
      /mime-version:/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(email)) {
        throw new Error('Email address contains suspicious content');
      }
    }
  }

  /**
   * CRITICAL: Sanitize text for HTML (prevent XSS)
   */
  private escapeHtml(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"'\/]/g, (char) => map[char]);
  }

  /**
   * CRITICAL: Validate and sanitize subject
   */
  private sanitizeSubject(subject: string): string {
    if (!subject || typeof subject !== 'string') {
      throw new Error('Invalid subject');
    }

    if (subject.length > 200) {
      throw new Error('Subject too long (max 200 chars)');
    }

    // Remove CRLF
    let sanitized = subject.replace(/[\r\n]/g, '');

    // Remove null bytes
    sanitized = sanitized.replace(/\x00/g, '');

    return sanitized.trim();
  }

  /**
   * CRITICAL: Validate token format
   */
  private validateToken(token: string): void {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid token');
    }

    // UUID or hex format
    const validFormats = [
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
      /^[0-9a-f]{32,128}$/i, // Hex
    ];

    const isValid = validFormats.some((format) => format.test(token));
    if (!isValid) {
      throw new Error('Invalid token format');
    }

    // Check for XSS attempts
    if (/<|>|script|javascript|onerror/i.test(token)) {
      throw new Error('Token contains invalid characters');
    }
  }

  /**
   * CRITICAL: Validate name field
   */
  private validateName(name: string | undefined): string {
    if (!name) {
      return '';
    }

    if (typeof name !== 'string') {
      return '';
    }

    if (name.length > 100) {
      throw new Error('Name too long (max 100 chars)');
    }

    // Remove control characters
    let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '');

    // Remove potential XSS
    sanitized = this.escapeHtml(sanitized);

    return sanitized.trim();
  }

  /**
   * CRITICAL: Check rate limits
   */
  private async checkRateLimit(email: string, userId?: string): Promise<void> {
    // Global rate limit
    const globalKey = `email:ratelimit:global:${new Date().toISOString().slice(0, 13)}`; // Hourly
    const globalCount = parseInt((await redisClient.get(globalKey)) || '0');

    if (globalCount >= RATE_LIMIT_GLOBAL) {
      securityLogger.suspiciousActivity(
        'Email global rate limit exceeded',
        userId,
        'system',
        { globalCount }
      );
      throw new Error('Email service temporarily unavailable');
    }

    // Per-email rate limit
    const emailKey = `email:ratelimit:${email}`;
    const emailCount = parseInt((await redisClient.get(emailKey)) || '0');

    if (emailCount >= RATE_LIMIT_PER_EMAIL) {
      securityLogger.suspiciousActivity(
        'Email rate limit exceeded for address',
        userId,
        email,
        { emailCount }
      );
      throw new Error('Too many emails sent to this address. Please try again later.');
    }

    // Per-user rate limit
    if (userId) {
      const userKey = `email:ratelimit:user:${userId}`;
      const userCount = parseInt((await redisClient.get(userKey)) || '0');

      if (userCount >= RATE_LIMIT_PER_USER) {
        securityLogger.suspiciousActivity(
          'Email rate limit exceeded for user',
          userId,
          'system',
          { userCount }
        );
        throw new Error('Too many emails sent. Please try again later.');
      }
    }
  }

  /**
   * CRITICAL: Increment rate limit counters
   */
  private async incrementRateLimit(email: string, userId?: string): Promise<void> {
    // Global counter
    const globalKey = `email:ratelimit:global:${new Date().toISOString().slice(0, 13)}`;
    await redisClient.incr(globalKey);
    await redisClient.expire(globalKey, RATE_LIMIT_WINDOW);

    // Per-email counter
    const emailKey = `email:ratelimit:${email}`;
    await redisClient.incr(emailKey);
    await redisClient.expire(emailKey, RATE_LIMIT_WINDOW);

    // Per-user counter
    if (userId) {
      const userKey = `email:ratelimit:user:${userId}`;
      await redisClient.incr(userKey);
      await redisClient.expire(userKey, RATE_LIMIT_WINDOW);
    }
  }

  /**
   * Send email via API (e.g., SendGrid, Mailgun, AWS SES)
   */
  private async sendEmail(options: SendEmailOptions, userId?: string): Promise<void> {
    // CRITICAL: Validate inputs
    this.validateEmail(options.to);
    const sanitizedSubject = this.sanitizeSubject(options.subject);

    // CRITICAL: Check rate limits
    await this.checkRateLimit(options.to, userId);

    // In development, just log
    if (config.env === 'development' || !this.apiKey) {
      logger.info('Email would be sent (dev mode)', {
        to: options.to,
        subject: sanitizedSubject,
      });
      console.log('\n📧 EMAIL (DEV MODE):');
      console.log('To:', options.to);
      console.log('Subject:', sanitizedSubject);
      console.log('Body:', options.text || options.html.substring(0, 200));
      console.log('\n');
      return;
    }

    try {
      // Example: SendGrid API
      await axios.post(
        `${this.baseUrl}/mail/send`,
        {
          personalizations: [
            {
              to: [{ email: options.to }],
            },
          ],
          from: {
            email: this.fromEmail,
            name: this.fromName,
          },
          subject: sanitizedSubject,
          content: [
            {
              type: 'text/html',
              value: options.html,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      // Increment rate limit counters
      await this.incrementRateLimit(options.to, userId);

      // Log email sent
      securityLogger.dataAccess(
        userId || 'system',
        `email:${options.to}`,
        'send',
        { subject: sanitizedSubject }
      );

      logger.info('Email sent successfully', {
        to: options.to,
        subject: sanitizedSubject,
      });
    } catch (error: any) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: sanitizedSubject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData, userId?: string): Promise<void> {
    // CRITICAL: Validate inputs
    this.validateEmail(data.to);
    this.validateToken(data.token);

    const firstName = this.validateName(data.firstName);
    const lastName = this.validateName(data.lastName);
    const name = firstName ? `${firstName} ${lastName}`.trim() : 'User';

    // Validate expiry
    if (!(data.expiresAt instanceof Date) || isNaN(data.expiresAt.getTime())) {
      throw new Error('Invalid expiry date');
    }

    const expiryMinutes = Math.round((data.expiresAt.getTime() - Date.now()) / 60000);

    if (expiryMinutes <= 0) {
      throw new Error('Token already expired');
    }

    // Build URL with validated token
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(data.token)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Reset Request</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password for your servAI account.</p>
    <p><a href="${resetUrl}" class="button">Reset Password</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">${this.escapeHtml(resetUrl)}</p>
    <p><strong>This link will expire in ${expiryMinutes} minutes.</strong></p>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
    <div class="footer">
      <p>servAI - Smart Condo Management Platform</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Password Reset Request

Hi ${name},

We received a request to reset your password for your servAI account.

Reset your password by visiting this link:
${resetUrl}

This link will expire in ${expiryMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email.

servAI - Smart Condo Management Platform
    `;

    await this.sendEmail(
      {
        to: data.to,
        subject: 'Reset Your Password - servAI',
        html,
        text,
      },
      userId
    );
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(data: PasswordChangedEmailData, userId?: string): Promise<void> {
    this.validateEmail(data.to);

    if (!(data.timestamp instanceof Date) || isNaN(data.timestamp.getTime())) {
      throw new Error('Invalid timestamp');
    }

    const timestamp = data.timestamp.toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'full',
      timeStyle: 'long',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 12px; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Changed Successfully</h2>
    <div class="alert">
      <p><strong>Your password was changed on ${this.escapeHtml(timestamp)}</strong></p>
    </div>
    <p>If you did not make this change, please contact support immediately.</p>
    <p>For your security, all active sessions have been logged out.</p>
    <div class="footer">
      <p>servAI - Smart Condo Management Platform</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Password Changed Successfully

Your password was changed on ${timestamp}

If you did not make this change, please contact support immediately.

For your security, all active sessions have been logged out.

servAI - Smart Condo Management Platform
    `;

    await this.sendEmail(
      {
        to: data.to,
        subject: 'Password Changed - servAI',
        html,
        text,
      },
      userId
    );
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: EmailVerificationData, userId?: string): Promise<void> {
    this.validateEmail(data.to);
    this.validateToken(data.token);

    const firstName = this.validateName(data.firstName);
    const lastName = this.validateName(data.lastName);
    const name = firstName ? `${firstName} ${lastName}`.trim() : 'User';

    if (!(data.expiresAt instanceof Date) || isNaN(data.expiresAt.getTime())) {
      throw new Error('Invalid expiry date');
    }

    const expiryHours = Math.round((data.expiresAt.getTime() - Date.now()) / 3600000);

    if (expiryHours <= 0) {
      throw new Error('Token already expired');
    }

    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(data.token)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Email</h2>
    <p>Hi ${name},</p>
    <p>Welcome to servAI! Please verify your email address to complete your registration.</p>
    <p><a href="${verifyUrl}" class="button">Verify Email</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">${this.escapeHtml(verifyUrl)}</p>
    <p><strong>This link will expire in ${expiryHours} hours.</strong></p>
    <p>If you didn't create an account with servAI, you can safely ignore this email.</p>
    <div class="footer">
      <p>servAI - Smart Condo Management Platform</p>
      <p>This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Verify Your Email

Hi ${name},

Welcome to servAI! Please verify your email address to complete your registration.

Verify your email by visiting this link:
${verifyUrl}

This link will expire in ${expiryHours} hours.

If you didn't create an account with servAI, you can safely ignore this email.

servAI - Smart Condo Management Platform
    `;

    await this.sendEmail(
      {
        to: data.to,
        subject: 'Verify Your Email - servAI',
        html,
        text,
      },
      userId
    );
  }
}

// Export singleton
export const emailService = new EmailService();