import { defineStore } from 'pinia';
import { authAPI } from '../api';
import { LocalStorage } from 'quasar';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: LocalStorage.getItem('authToken') || null,
    isAuthenticated: !!LocalStorage.getItem('authToken'),
    loading: false,
    error: null
  }),

  getters: {
    currentUser: (state) => state.user,
    userRoles: (state) => state.user?.roles || [],
    userRole: (state) => state.user?.roles?.[0]?.role || null,
    userName: (state) => state.user?.name || `${state.user?.firstName} ${state.user?.lastName}`,
    userEmail: (state) => state.user?.email,
    isAdmin: (state) => {
      const roles = state.user?.roles || [];
      return roles.some(r => ['superadmin', 'uk_director', 'complex_admin'].includes(r.role));
    }
  },

  actions: {
    async login(credentials) {
      this.loading = true;
      this.error = null;
      try {
        const response = await authAPI.login(credentials);
        this.token = response.data.accessToken;
        this.user = response.data.user;
        this.isAuthenticated = true;
        LocalStorage.set('authToken', this.token);
        return response.data;
      } catch (error) {
        this.error = error.message || 'Login failed';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      try {
        const refreshToken = LocalStorage.getItem('refreshToken');
        if (refreshToken) {
          await authAPI.logout({ refreshToken });
        }
      } catch (error) {
        // Ignore logout API errors
      } finally {
        this.user = null;
        this.token = null;
        this.isAuthenticated = false;
        LocalStorage.remove('authToken');
        LocalStorage.remove('refreshToken');
      }
    },

    async fetchUser() {
      if (!this.token) return;
      try {
        const response = await authAPI.me();
        this.user = response.data.user;
        this.isAuthenticated = true;
      } catch (error) {
        this.logout();
        throw error;
      }
    },

    async refreshToken() {
      try {
        const refreshToken = LocalStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }
        
        const response = await authAPI.refresh({ refreshToken });
        this.token = response.data.accessToken;
        LocalStorage.set('authToken', this.token);
        
        if (response.data.refreshToken) {
          LocalStorage.set('refreshToken', response.data.refreshToken);
        }
      } catch (error) {
        this.logout();
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
