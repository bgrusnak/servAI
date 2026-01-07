import { onUnmounted, ref } from 'vue';

/**
 * Composable for handling request cancellation with AbortController
 * Automatically aborts all pending requests when component is unmounted
 * 
 * @returns {object} - abort controller utilities
 * 
 * @example
 * const { signal, abort, createSignal } = useAbortController();
 * 
 * // Single request
 * await apiClient.get('/data', { signal });
 * 
 * // Multiple requests with separate controllers
 * const signal1 = createSignal();
 * const signal2 = createSignal();
 * await Promise.all([
 *   apiClient.get('/data1', { signal: signal1 }),
 *   apiClient.get('/data2', { signal: signal2 })
 * ]);
 */
export function useAbortController() {
  const controllers = ref([]);
  const mainController = ref(new AbortController());

  /**
   * Create a new abort signal for a specific request
   * @returns {AbortSignal}
   */
  const createSignal = () => {
    const controller = new AbortController();
    controllers.value.push(controller);
    return controller.signal;
  };

  /**
   * Get the main abort signal (for single requests)
   */
  const signal = mainController.value.signal;

  /**
   * Abort all pending requests
   * @param {string} reason - Reason for aborting
   */
  const abort = (reason = 'Request cancelled') => {
    mainController.value.abort(reason);
    controllers.value.forEach(controller => controller.abort(reason));
    controllers.value = [];
  };

  /**
   * Abort specific signal
   * @param {AbortSignal} signal - Signal to abort
   * @param {string} reason - Reason for aborting
   */
  const abortSignal = (signal, reason = 'Request cancelled') => {
    const controller = controllers.value.find(c => c.signal === signal);
    if (controller) {
      controller.abort(reason);
      controllers.value = controllers.value.filter(c => c !== controller);
    }
  };

  /**
   * Check if any request is aborted
   * @returns {boolean}
   */
  const isAborted = () => {
    return mainController.value.signal.aborted || 
           controllers.value.some(c => c.signal.aborted);
  };

  /**
   * Reset abort controller (create new one)
   */
  const reset = () => {
    mainController.value = new AbortController();
    controllers.value = [];
  };

  // Automatically abort all requests when component unmounts
  onUnmounted(() => {
    abort('Component unmounted');
  });

  return {
    signal,
    createSignal,
    abort,
    abortSignal,
    isAborted,
    reset
  };
}

/**
 * Composable for single request with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {object}
 */
export function useAbortWithTimeout(timeout = 30000) {
  const { signal, abort, reset } = useAbortController();
  let timeoutId = null;

  /**
   * Start timeout timer
   */
  const startTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      abort('Request timeout');
    }, timeout);
  };

  /**
   * Clear timeout timer
   */
  const clearTimer = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  onUnmounted(() => {
    clearTimer();
  });

  return {
    signal,
    abort,
    reset,
    startTimeout,
    clearTimer
  };
}
