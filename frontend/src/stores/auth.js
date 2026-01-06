import { defineStore } from 'pinia';
import { LocalStorage } from 'quasar';
import { authAPI } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: LocalStorage.getItem('user') || null,
    token: LocalStorage.getItem('authToken') || null,
    isAuthenticated: !!LocalStorage.getItem('authToken')
  }),

  getters: {
    currentUser: (state) => state.user,
    userRole: (state) => state.user?.role,
    isLoggedIn: (state) => state.isAuthenticated,
    
    // Role checks
    isSuperAdmin: (state) => state.user?.role === 'super_admin',
    isSuperAccountant: (state) => state.user?.role === 'super_accountant',
    isUKDirector: (state) => state.user?.role === 'uk_director',
    isUKAccountant: (state) => state.user?.role === 'uk_accountant',
    isComplexAdmin: (state) => state.user?.role === 'complex_admin',
    isWorker: (state) => state.user?.role === 'worker'
  },

  actions: {
    /**
     * Login user
     */
    async login(email, password) {
      try {
        const response = await authAPI.login(email, password);
        const { token, user } = response.data;
        
        this.token = token;
        this.user = user;
        this.isAuthenticated = true;
        
        LocalStorage.set('authToken', token);
        LocalStorage.set('user', user);
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Logout user
     */
    async logout() {
      try {
        await authAPI.logout();
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        this.token = null;
        this.user = null;
        this.isAuthenticated = false;
        
        LocalStorage.remove('authToken');
        LocalStorage.remove('user');
      }
    },

    /**
     * Fetch current user profile
     */
    async fetchProfile() {
      try {
        const response = await authAPI.getProfile();
        this.user = response.data;
        LocalStorage.set('user', response.data);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    /**
     * Check if user has permission
     */
    hasPermission(permission) {
      if (!this.user) return false;
      return this.user.permissions?.includes(permission) || false;
    },

    /**
     * Check if user has any of the roles
     */
    hasRole(roles) {
      if (!this.user) return false;
      if (Array.isArray(roles)) {
        return roles.includes(this.user.role);
      }
      return this.user.role === roles;
    }
  }
});
