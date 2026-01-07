import { defineStore } from 'pinia';
import { authAPI, setAuthStore } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    token: localStorage.getItem('token') || null,
    isAuthenticated: !!localStorage.getItem('token'),
    loading: false,
    error: null
  }),

  getters: {
    currentUser: (state) => state.user,
    userRole: (state) => state.user?.role,
    userName: (state) => state.user?.name,
    userEmail: (state) => state.user?.email,
    isAdmin: (state) => ['super_admin', 'uk_director'].includes(state.user?.role)
  },

  actions: {
    async login(credentials) {
      this.loading = true;
      this.error = null;
      try {
        const response = await authAPI.login(credentials);
        this.token = response.data.token;
        this.user = response.data.user;
        this.isAuthenticated = true;
        localStorage.setItem('token', this.token);
        setAuthStore(this);
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
        await authAPI.logout();
      } catch (error) {
        // Ignore logout API errors
      } finally {
        this.user = null;
        this.token = null;
        this.isAuthenticated = false;
        localStorage.removeItem('token');
      }
    },

    async fetchUser() {
      if (!this.token) return;
      try {
        const response = await authAPI.me();
        this.user = response.data;
        this.isAuthenticated = true;
        setAuthStore(this);
      } catch (error) {
        this.logout();
        throw error;
      }
    },

    async refreshToken() {
      try {
        const response = await authAPI.refresh();
        this.token = response.data.token;
        localStorage.setItem('token', this.token);
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
