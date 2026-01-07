import { defineStore } from 'pinia';
import { authAPI } from '../api';
import { LocalStorage } from 'quasar';
import { sanitizeEmail } from '../utils/sanitize';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: LocalStorage.getItem('authToken') || null,
    refreshToken: LocalStorage.getItem('refreshToken') || null,
    isAuthenticated: !!LocalStorage.getItem('authToken'),
    loading: false,
    error: null,
    rememberMe: LocalStorage.getItem('rememberMe') === 'true'
  }),

  getters: {
    currentUser: (state) => state.user,
    userRoles: (state) => state.user?.roles || [],
    primaryRole: (state) => {
      const roles = state.user?.roles || [];
      const priority = ['superadmin', 'uk_director', 'complex_admin', 'accountant', 'employee', 'security_guard', 'resident'];
      for (const role of priority) {
        const found = roles.find(r => r.role === role);
        if (found) return found.role;
      }
      return null;
    },
    userName: (state) => {
      if (!state.user) return '';
      return state.user.name || `${state.user.firstName || ''} ${state.user.lastName || ''}`.trim();
    },
    userEmail: (state) => state.user?.email,
    isAdmin: (state) => {
      const roles = state.user?.roles || [];
      return roles.some(r => ['superadmin', 'uk_director', 'complex_admin'].includes(r.role));
    },
    isSuperAdmin: (state) => {
      const roles = state.user?.roles || [];
      return roles.some(r => r.role === 'superadmin');
    },
    hasRole: (state) => (role) => {
      const roles = state.user?.roles || [];
      return roles.some(r => r.role === role);
    }
  },

  actions: {
    async login(credentials) {
      this.loading = true;
      this.error = null;
      
      try {
        const sanitizedEmail = sanitizeEmail(credentials.email);
        const response = await authAPI.login({
          email: sanitizedEmail,
          password: credentials.password
        });
        
        this.token = response.data.accessToken;
        this.refreshToken = response.data.refreshToken;
        this.user = response.data.user;
        this.isAuthenticated = true;
        
        LocalStorage.set('authToken', this.token);
        LocalStorage.set('refreshToken', this.refreshToken);
        
        if (credentials.rememberMe) {
          LocalStorage.set('rememberMe', 'true');
          this.rememberMe = true;
        } else {
          LocalStorage.remove('rememberMe');
          this.rememberMe = false;
        }
        
        return response.data;
      } catch (error) {
        this.error = error.message || 'auth.loginError';
        throw error;
      } finally {
        this.loading = false;
        // Security: Clear password from memory
        if (credentials.password) {
          credentials.password = null;
        }
      }
    },

    async register(userData) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await authAPI.register({
          ...userData,
          email: sanitizeEmail(userData.email)
        });
        
        this.token = response.data.accessToken;
        this.refreshToken = response.data.refreshToken;
        this.user = response.data.user;
        this.isAuthenticated = true;
        
        LocalStorage.set('authToken', this.token);
        LocalStorage.set('refreshToken', this.refreshToken);
        
        return response.data;
      } catch (error) {
        this.error = error.message || 'auth.registerError';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      try {
        if (this.refreshToken) {
          await authAPI.logout({ refreshToken: this.refreshToken });
        }
      } catch (error) {
        console.error('Logout API error:', error);
      } finally {
        this.clearAuth();
      }
    },

    clearAuth() {
      this.user = null;
      this.token = null;
      this.refreshToken = null;
      this.isAuthenticated = false;
      this.error = null;
      
      LocalStorage.remove('authToken');
      LocalStorage.remove('refreshToken');
      if (!this.rememberMe) {
        LocalStorage.remove('rememberMe');
      }
    },

    async fetchUser() {
      if (!this.token) {
        throw new Error('No token available');
      }
      
      try {
        const response = await authAPI.me();
        this.user = response.data.user;
        this.isAuthenticated = true;
        return response.data.user;
      } catch (error) {
        console.error('Failed to fetch user:', error);
        this.clearAuth();
        throw error;
      }
    },

    async refreshAccessToken() {
      if (!this.refreshToken) {
        throw new Error('No refresh token');
      }
      
      try {
        const response = await authAPI.refresh({ refreshToken: this.refreshToken });
        
        this.token = response.data.accessToken;
        LocalStorage.set('authToken', this.token);
        
        if (response.data.refreshToken) {
          this.refreshToken = response.data.refreshToken;
          LocalStorage.set('refreshToken', this.refreshToken);
        }
        
        return response.data;
      } catch (error) {
        console.error('Token refresh failed:', error);
        this.clearAuth();
        throw error;
      }
    },

    async requestPasswordReset(email) {
      try {
        await authAPI.requestPasswordReset({ email: sanitizeEmail(email) });
      } catch (error) {
        throw error;
      }
    },

    async resetPassword(token, newPassword) {
      try {
        await authAPI.resetPassword({ token, password: newPassword });
      } catch (error) {
        throw error;
      }
    },

    setUser(user) {
      this.user = user;
    },

    clearError() {
      this.error = null;
    }
  }
});
