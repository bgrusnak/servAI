import { defineStore } from 'pinia';
import { LocalStorage } from 'quasar';

export const useAppStore = defineStore('app', {
  state: () => ({
    loading: false,
    locale: LocalStorage.getItem('locale') || 'ru',
    darkMode: LocalStorage.getItem('darkMode') || false,
    leftDrawerOpen: true,
    notifications: []
  }),

  getters: {
    isLoading: (state) => state.loading,
    currentLocale: (state) => state.locale,
    isDarkMode: (state) => state.darkMode,
    isDrawerOpen: (state) => state.leftDrawerOpen,
    unreadNotifications: (state) => state.notifications.filter(n => !n.read).length
  },

  actions: {
    /**
     * Set loading state
     */
    setLoading(value) {
      this.loading = value;
    },

    /**
     * Change locale
     */
    setLocale(locale) {
      this.locale = locale;
      LocalStorage.set('locale', locale);
    },

    /**
     * Toggle dark mode
     */
    toggleDarkMode() {
      this.darkMode = !this.darkMode;
      LocalStorage.set('darkMode', this.darkMode);
    },

    /**
     * Toggle drawer
     */
    toggleDrawer() {
      this.leftDrawerOpen = !this.leftDrawerOpen;
    },

    /**
     * Add notification
     */
    addNotification(notification) {
      this.notifications.push({
        id: Date.now(),
        read: false,
        timestamp: new Date(),
        ...notification
      });
    },

    /**
     * Mark notification as read
     */
    markAsRead(id) {
      const notification = this.notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
      }
    },

    /**
     * Clear all notifications
     */
    clearNotifications() {
      this.notifications = [];
    }
  }
});
