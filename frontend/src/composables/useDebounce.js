import { ref, watch, onUnmounted } from 'vue';
import { config } from '../config/env';

/**
 * Debounce composable for delayed execution
 * Perfect for search inputs, autosave, and frequent API calls
 * 
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds (default: 300ms)
 * @returns {object} - debounced function and utilities
 * 
 * @example
 * const { debouncedFn, cancel, flush } = useDebounceFn(async (query) => {
 *   await searchAPI(query);
 * }, 300);
 * 
 * debouncedFn('search term');
 */
export function useDebounceFn(fn, delay = config.ui.searchDebounce) {
  let timeoutId = null;
  let pendingArgs = null;

  const debouncedFn = (...args) => {
    pendingArgs = args;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
      pendingArgs = null;
    }, delay);
  };

  /**
   * Cancel pending execution
   */
  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      pendingArgs = null;
    }
  };

  /**
   * Execute immediately with last pending args
   */
  const flush = () => {
    if (timeoutId && pendingArgs) {
      clearTimeout(timeoutId);
      fn(...pendingArgs);
      timeoutId = null;
      pendingArgs = null;
    }
  };

  /**
   * Check if there's a pending execution
   */
  const isPending = () => timeoutId !== null;

  onUnmounted(() => {
    cancel();
  });

  return {
    debouncedFn,
    cancel,
    flush,
    isPending
  };
}

/**
 * Debounced ref - automatically debounces value changes
 * Perfect for v-model on search inputs
 * 
 * @param {any} initialValue - Initial value
 * @param {number} delay - Delay in milliseconds
 * @returns {object} - reactive refs
 * 
 * @example
 * const { value, debouncedValue } = useDebouncedRef('', 300);
 * 
 * // In template: v-model="value"
 * // Watch debouncedValue for API calls
 * watch(debouncedValue, (newVal) => {
 *   searchAPI(newVal);
 * });
 */
export function useDebouncedRef(initialValue, delay = config.ui.searchDebounce) {
  const value = ref(initialValue);
  const debouncedValue = ref(initialValue);
  let timeoutId = null;

  watch(value, (newValue) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      debouncedValue.value = newValue;
      timeoutId = null;
    }, delay);
  });

  onUnmounted(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  return {
    value,
    debouncedValue
  };
}

/**
 * Throttle composable - limits execution frequency
 * Unlike debounce, throttle executes at regular intervals
 * Perfect for scroll handlers, resize events
 * 
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between executions (ms)
 * @returns {object} - throttled function
 * 
 * @example
 * const { throttledFn } = useThrottleFn(() => {
 *   console.log('Scroll event');
 * }, 100);
 * 
 * window.addEventListener('scroll', throttledFn);
 */
export function useThrottleFn(fn, limit = 100) {
  let inThrottle = false;
  let lastArgs = null;
  let timeoutId = null;

  const throttledFn = (...args) => {
    lastArgs = args;

    if (!inThrottle) {
      fn(...args);
      inThrottle = true;

      timeoutId = setTimeout(() => {
        inThrottle = false;
        
        // Execute with last args if called during throttle
        if (lastArgs !== args) {
          fn(...lastArgs);
        }
      }, limit);
    }
  };

  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inThrottle = false;
    lastArgs = null;
  };

  onUnmounted(() => {
    cancel();
  });

  return {
    throttledFn,
    cancel
  };
}

/**
 * Debounced search composable with loading state
 * Perfect for search inputs with API calls
 * 
 * @param {Function} searchFn - Async search function
 * @param {number} delay - Debounce delay
 * @returns {object}
 * 
 * @example
 * const { search, loading, results, error } = useDebouncedSearch(
 *   async (query) => {
 *     const response = await api.search(query);
 *     return response.data;
 *   },
 *   300
 * );
 * 
 * search('query');
 */
export function useDebouncedSearch(searchFn, delay = config.ui.searchDebounce) {
  const loading = ref(false);
  const results = ref(null);
  const error = ref(null);
  const query = ref('');

  const { debouncedFn, cancel } = useDebounceFn(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim() === '') {
      results.value = null;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      results.value = await searchFn(searchQuery);
    } catch (err) {
      error.value = err.message || 'Search failed';
      results.value = null;
    } finally {
      loading.value = false;
    }
  }, delay);

  const search = (searchQuery) => {
    query.value = searchQuery;
    debouncedFn(searchQuery);
  };

  const clear = () => {
    query.value = '';
    results.value = null;
    error.value = null;
    cancel();
  };

  return {
    search,
    clear,
    loading,
    results,
    error,
    query
  };
}
