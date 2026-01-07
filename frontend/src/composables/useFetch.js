import { ref, unref } from 'vue';
import { useQuasar } from 'quasar';

export function useFetch() {
  const $q = useQuasar();
  const loading = ref(false);
  const error = ref(null);
  const data = ref(null);

  const execute = async (apiCall, options = {}) => {
    const {
      onSuccess,
      onError,
      showSuccessNotification = false,
      showErrorNotification = true,
      successMessage = 'Operation successful',
      loadingMessage = null
    } = options;

    loading.value = true;
    error.value = null;
    data.value = null;

    let loadingNotification = null;
    if (loadingMessage) {
      loadingNotification = $q.notify({
        type: 'ongoing',
        message: loadingMessage,
        timeout: 0
      });
    }

    try {
      const result = await apiCall();
      data.value = result.data;

      if (showSuccessNotification) {
        $q.notify({
          message: successMessage,
          color: 'positive',
          icon: 'check'
        });
      }

      if (onSuccess) {
        onSuccess(result.data);
      }

      return result.data;
    } catch (err) {
      error.value = err;

      if (showErrorNotification) {
        $q.notify({
          message: err.message || 'An error occurred',
          color: 'negative',
          icon: 'error'
        });
      }

      if (onError) {
        onError(err);
      }

      throw err;
    } finally {
      loading.value = false;
      if (loadingNotification) {
        loadingNotification();
      }
    }
  };

  return {
    loading,
    error,
    data,
    execute
  };
}
