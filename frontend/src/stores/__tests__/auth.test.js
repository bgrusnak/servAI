import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../auth';

// Mock API client
vi.mock('../../api/client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

// Mock router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

// Mock LocalStorage
const mockLocalStorage = {
  storage: {},
  getItem(key) {
    return this.storage[key] || null;
  },
  setItem(key, value) {
    this.storage[key] = value;
  },
  removeItem(key) {
    delete this.storage[key];
  },
  clear() {
    this.storage = {};
  }
};

vi.mock('quasar', () => ({
  LocalStorage: mockLocalStorage
}));

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockLocalStorage.clear();
  });

  describe('login', () => {
    it('should set token and user on successful login', async () => {
      const store = useAuthStore();
      const apiClient = await import('../../api/client');
      
      apiClient.default.post.mockResolvedValue({
        data: {
          token: 'test-token',
          refreshToken: 'refresh-token',
          user: { id: 1, email: 'test@test.com' }
        }
      });

      await store.login({
        email: 'test@test.com',
        password: 'password123'
      });

      expect(store.isAuthenticated).toBe(true);
      expect(store.user).toEqual({ id: 1, email: 'test@test.com' });
    });

    it('should throw error on failed login', async () => {
      const store = useAuthStore();
      const apiClient = await import('../../api/client');
      
      apiClient.default.post.mockRejectedValue(
        new Error('Invalid credentials')
      );

      await expect(
        store.login({ email: 'test@test.com', password: 'wrong' })
      ).rejects.toThrow();

      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear token and user', async () => {
      const store = useAuthStore();
      
      // Set initial state
      store.user = { id: 1, email: 'test@test.com' };
      mockLocalStorage.setItem('authToken', 'token');

      await store.logout();

      expect(store.user).toBe(null);
      expect(store.isAuthenticated).toBe(false);
      expect(mockLocalStorage.getItem('authToken')).toBe(null);
    });
  });

  describe('hasRole', () => {
    it('should check user roles correctly', () => {
      const store = useAuthStore();
      store.user = {
        roles: ['admin', 'user']
      };

      expect(store.hasRole('admin')).toBe(true);
      expect(store.hasRole('user')).toBe(true);
      expect(store.hasRole('superadmin')).toBe(false);
    });

    it('should return false for no user', () => {
      const store = useAuthStore();
      store.user = null;

      expect(store.hasRole('admin')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should check permissions correctly', () => {
      const store = useAuthStore();
      store.user = {
        permissions: ['read', 'write']
      };

      expect(store.hasPermission('read')).toBe(true);
      expect(store.hasPermission('delete')).toBe(false);
    });
  });
});
