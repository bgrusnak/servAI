import request from 'supertest';
import { Express } from 'express';

/**
 * Test Helpers for Authentication and Common Operations
 */

/**
 * Login a user and return access token
 */
export async function loginAndGetToken(
  app: Express,
  email: string,
  password: string
): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  const cookies = response.headers['set-cookie'];
  const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));
  
  if (!accessTokenCookie) {
    throw new Error('No access token in login response');
  }

  const tokenMatch = accessTokenCookie.match(/accessToken=([^;]+)/);
  if (!tokenMatch) {
    throw new Error('Could not extract token from cookie');
  }

  return tokenMatch[1];
}

/**
 * Register a new user and return access token
 */
export async function registerAndGetToken(
  app: Express,
  userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }
): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send(userData)
    .expect(201);

  const cookies = response.headers['set-cookie'];
  const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));
  
  if (!accessTokenCookie) {
    throw new Error('No access token in registration response');
  }

  const tokenMatch = accessTokenCookie.match(/accessToken=([^;]+)/);
  if (!tokenMatch) {
    throw new Error('Could not extract token from cookie');
  }

  return tokenMatch[1];
}

/**
 * Extract error message from response
 */
export function getErrorMessage(response: any): string {
  if (response.body.error) {
    return typeof response.body.error === 'string'
      ? response.body.error
      : JSON.stringify(response.body.error);
  }
  if (response.body.message) {
    return response.body.message;
  }
  return '';
}

/**
 * Check if response contains validation errors
 */
export function hasValidationErrors(response: any): boolean {
  return (
    response.body.errors &&
    Array.isArray(response.body.errors) &&
    response.body.errors.length > 0
  );
}

/**
 * Get validation error for specific field
 */
export function getValidationError(response: any, field: string): string | null {
  if (!hasValidationErrors(response)) {
    return null;
  }

  const error = response.body.errors.find(
    (err: any) => err.field === field || err.path === field
  );

  return error ? error.message : null;
}
