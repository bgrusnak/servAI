import { ref, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';

export function useNetworkStatus() {
  const $q = useQuasar();
  const isOnline = ref(navigator.onLine);

  const handleOnline = () => {
    isOnline.value = true;
    $q.notify({
      message: 'Connection restored',
      color: 'positive',
      icon: 'wifi',
      timeout: 2000
    });
  };

  const handleOffline = () => {
    isOnline.value = false;
    $q.notify({
      message: 'No internet connection',
      color: 'negative',
      icon: 'wifi_off',
      timeout: 0,
      actions: [{ label: 'Dismiss', color: 'white' }]
    });
  };

  onMounted(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  });

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  return { isOnline };
}
