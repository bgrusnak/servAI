import { ref, onMounted, onUnmounted } from 'vue';
import { notificationsAPI } from '../api';

export function useNotifications() {
  const notifications = ref([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  let pollingInterval = null;

  const fetchNotifications = async () => {
    try {
      const response = await notificationsAPI.getAll({ limit: 20 });
      notifications.value = response.data.data || [];
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await notificationsAPI.getUnreadCount();
      unreadCount.value = response.data.count || 0;
    } catch (error) {
      console.error('Failed to fetch unread count', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      const notification = notifications.value.find(n => n.id === id);
      if (notification) { notification.read = true; unreadCount.value = Math.max(0, unreadCount.value - 1); }
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllAsRead();
      notifications.value.forEach(n => n.read = true);
      unreadCount.value = 0;
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  };

  const startPolling = () => {
    fetchUnreadCount();
    pollingInterval = setInterval(fetchUnreadCount, 30000); // Poll every 30 seconds
  };

  const stopPolling = () => {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  };

  onMounted(() => { fetchNotifications(); startPolling(); });
  onUnmounted(() => { stopPolling(); });

  return { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead };
}
