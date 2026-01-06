import { ref } from 'vue';
import { useQuasar } from 'quasar';

export function useDialog() {
  const $q = useQuasar();
  const dialogVisible = ref(false);

  const confirm = (options = {}) => {
    return new Promise((resolve) => {
      $q.dialog({
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        cancel: options.cancel !== false,
        persistent: options.persistent || false,
        ok: {
          label: options.okLabel || 'OK',
          color: options.okColor || 'primary',
          flat: true
        },
        cancel: {
          label: options.cancelLabel || 'Cancel',
          color: 'grey',
          flat: true
        }
      }).onOk(() => resolve(true))
        .onCancel(() => resolve(false));
    });
  };

  const alert = (options = {}) => {
    return new Promise((resolve) => {
      $q.dialog({
        title: options.title || 'Alert',
        message: options.message || '',
        ok: {
          label: options.okLabel || 'OK',
          color: options.okColor || 'primary',
          flat: true
        }
      }).onOk(() => resolve(true));
    });
  };

  const prompt = (options = {}) => {
    return new Promise((resolve) => {
      $q.dialog({
        title: options.title || 'Input',
        message: options.message || 'Please enter:',
        prompt: {
          model: options.model || '',
          type: options.type || 'text',
          isValid: options.isValid || (() => true)
        },
        cancel: true,
        persistent: options.persistent || false
      }).onOk((data) => resolve(data))
        .onCancel(() => resolve(null));
    });
  };

  const showDialog = () => { dialogVisible.value = true; };
  const hideDialog = () => { dialogVisible.value = false; };

  return { dialogVisible, confirm, alert, prompt, showDialog, hideDialog };
}
