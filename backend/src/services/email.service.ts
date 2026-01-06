import { config } from '../config';
import { logger } from '../utils/logger';
import axios from 'axios';

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
   * Send email via API (e.g., SendGrid, Mailgun, AWS SES)
   */
  private async sendEmail(options: SendEmailOptions): Promise<void> {
    // In development, just log
    if (config.env === 'development' || !this.apiKey) {
      logger.info('Email would be sent (dev mode)', {
        to: options.to,
        subject: options.subject,
      });
      console.log('\n📧 EMAIL (DEV MODE):');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
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
          subject: options.subject,
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
        }
      );

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
      });
    } catch (error) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error,
      });
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${data.token}`;
    const name = data.firstName
      ? `${data.firstName} ${data.lastName || ''}`.trim()
      : 'User';
    const expiryMinutes = Math.round(
      (data.expiresAt.getTime() - Date.now()) / 60000
    );

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
    <p style="word-break: break-all; color: #666;">${resetUrl}</p>
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

    await this.sendEmail({
      to: data.to,
      subject: 'Reset Your Password - servAI',
      html,
      text,
    });
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(data: PasswordChangedEmailData): Promise<void> {
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
      <p><strong>Your password was changed on ${timestamp}</strong></p>
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

    await this.sendEmail({
      to: data.to,
      subject: 'Password Changed - servAI',
      html,
      text,
    });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(data: EmailVerificationData): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${data.token}`;
    const name = data.firstName
      ? `${data.firstName} ${data.lastName || ''}`.trim()
      : 'User';
    const expiryHours = Math.round(
      (data.expiresAt.getTime() - Date.now()) / 3600000
    );

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
    <p style="word-break: break-all; color: #666;">${verifyUrl}</p>
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

    await this.sendEmail({
      to: data.to,
      subject: 'Verify Your Email - servAI',
      html,
      text,
    });
  }
}

// Export singleton
export const emailService = new EmailService();
