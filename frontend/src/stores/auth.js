import { defineStore } from 'pinia';
import { authAPI } from '../api';
import { sanitizeEmail } from '../utils/sanitize';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    loading: false,
    error: null,
    rememberMe: localStorage.getItem('rememberMe') === 'true'
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
          password: credentials.password,
          rememberMe: credentials.rememberMe || false
        });
        
        // Токены теперь в httpOnly cookies - защищены от XSS
        // Не сохраняем в localStorage!
        this.user = response.data.user;
        this.isAuthenticated = true;
        
        if (credentials.rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          this.rememberMe = true;
        } else {
          localStorage.removeItem('rememberMe');
          this.rememberMe = false;
        }
        
        return response.data;
      } catch (error) {
        this.error = error.message || 'auth.loginError';
        throw error;
      } finally {
        this.loading = false;
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
        
        // Токены в httpOnly cookies
        this.user = response.data.user;
        this.isAuthenticated = true;
        
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
        await authAPI.logout();
      } catch (error) {
        console.error('Logout API error:', error);
      } finally {
        this.clearAuth();
      }
    },

    clearAuth() {
      this.user = null;
      this.isAuthenticated = false;
      this.error = null;
      
      // Токены теперь в httpOnly cookies - удаляются backend'om
      // Оставляем rememberMe если нужно
      if (!this.rememberMe) {
        localStorage.removeItem('rememberMe');
      }
    },

    async fetchUser() {
      // Токен в httpOnly cookie, отправляется автоматически
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
      // Refresh токен тоже в httpOnly cookie
      try {
        const response = await authAPI.refresh();
        // Новые токены автоматически устанавливаются backend'om
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
      this.isAuthenticated = !!user;
    },

    clearError() {
      this.error = null;
    },

    // Проверка авторизации при загрузке приложения
    async initAuth() {
      try {
        // Пробуем получить текущего пользователя
        // Если есть валидный cookie с токеном - получим данные
        await this.fetchUser();
      } catch (error) {
        // Нет валидного токена - это нормально
        this.clearAuth();
      }
    }
  }
});
