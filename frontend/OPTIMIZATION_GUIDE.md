# 🚀 Frontend Optimization Guide

## Overview

This guide covers the performance optimizations implemented in the ServAI frontend and how to use them effectively.

## ✅ Implemented Optimizations

### 1. AbortController for Request Cancellation

**Problem:** Memory leaks when components unmount with active API requests.

**Solution:** Automatic request cancellation using `useAbortController` composable.

```javascript
import { useAbortController } from '@/composables/useAbortController';
import apiClient from '@/api/client';

export default {
  setup() {
    const { signal, createSignal, abort } = useAbortController();
    
    // Single request - automatically cancelled on unmount
    const fetchData = async () => {
      const response = await apiClient.get('/data', { signal });
      return response.data;
    };
    
    // Multiple requests with individual cancellation
    const fetchMultiple = async () => {
      const signal1 = createSignal();
      const signal2 = createSignal();
      
      const [data1, data2] = await Promise.all([
        apiClient.get('/data1', { signal: signal1 }),
        apiClient.get('/data2', { signal: signal2 })
      ]);
    };
    
    // Manual abort (e.g., on user action)
    const cancelRequests = () => {
      abort('User cancelled');
    };
    
    return { fetchData, fetchMultiple, cancelRequests };
  }
};
```

### 2. Debounce for Search and Input

**Problem:** Too many API calls on every keystroke.

**Solution:** Debounced search using `useDebouncedSearch` or `useDebounceFn`.

```vue
<template>
  <q-input
    v-model="searchQuery"
    @update:model-value="handleSearch"
    :loading="loading"
  />
  
  <div v-if="results">
    <div v-for="item in results" :key="item.id">
      {{ item.name }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useDebouncedSearch } from '@/composables/useDebounce';
import apiClient from '@/api/client';

const searchQuery = ref('');

const { search, loading, results, error } = useDebouncedSearch(
  async (query) => {
    const response = await apiClient.get('/search', {
      params: { q: query }
    });
    return response.data;
  },
  300 // 300ms debounce
);

const handleSearch = (query) => {
  search(query);
};
</script>
```

**Alternative: useDebounceFn for custom logic**

```javascript
import { useDebounceFn } from '@/composables/useDebounce';

const { debouncedFn } = useDebounceFn(async (query) => {
  // Custom search logic
  console.log('Searching for:', query);
}, 300);

// Call on input
debouncedFn('search term');
```

### 3. Parallel File Uploads

**Problem:** Sequential file uploads are slow.

**Solution:** Parallel uploads with concurrency limit using `useFileUpload`.

```vue
<template>
  <q-file
    v-model="files"
    multiple
    @update:model-value="handleUpload"
  />
  
  <q-linear-progress
    v-if="uploading"
    :value="uploadProgress / 100"
  />
</template>

<script setup>
import { ref } from 'vue';
import { useFileUpload } from '@/composables/useFileUpload';

const files = ref(null);

const {
  uploading,
  uploadProgress,
  uploadedFiles,
  uploadMultiple,
  error
} = useFileUpload();

const handleUpload = async () => {
  try {
    // Upload with max 3 parallel requests
    const results = await uploadMultiple(files.value, 'documents', 3);
    console.log('Uploaded:', results);
  } catch (err) {
    console.error('Upload failed:', err);
  }
};
</script>
```

### 4. Virtual Scrolling for Large Lists

**Problem:** Performance issues with 1000+ items in lists.

**Solution:** Use Quasar's Virtual Scroll component.

```vue
<template>
  <q-virtual-scroll
    :items="items"
    :virtual-scroll-slice-size="50"
    style="max-height: 600px"
  >
    <template v-slot="{ item, index }">
      <q-item :key="index" clickable>
        <q-item-section>
          <q-item-label>{{ item.name }}</q-item-label>
          <q-item-label caption>{{ item.description }}</q-item-label>
        </q-item-section>
      </q-item>
    </template>
  </q-virtual-scroll>
</template>

<script setup>
import { ref } from 'vue';

const items = ref([
  // Array with thousands of items
]);
</script>
```

### 5. Network Status Handling

**Problem:** App doesn't handle offline state.

**Solution:** Check network status before API calls.

```javascript
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useQuasar } from 'quasar';

const { isOnline } = useNetworkStatus();
const $q = useQuasar();

const fetchData = async () => {
  if (!isOnline.value) {
    $q.notify({
      message: 'No internet connection',
      color: 'warning'
    });
    return;
  }
  
  // Proceed with API call
};
```

## 📊 Performance Best Practices

### 1. Use Constants Instead of Magic Strings

```javascript
import { USER_ROLES } from '@/utils/constants';

// ❌ Bad
if (user.role === 'superadmin') { ... }

// ✅ Good
if (user.role === USER_ROLES.SUPER_ADMIN) { ... }
```

### 2. Lazy Load Routes

```javascript
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/pages/DashboardPage.vue')
  }
];
```

### 3. Use v-once for Static Content

```vue
<div v-once>
  <h1>{{ staticTitle }}</h1>
  <p>{{ staticDescription }}</p>
</div>
```

### 4. Avoid Unnecessary Reactivity

```javascript
import { ref, shallowRef } from 'vue';

// ❌ Bad - deeply reactive when not needed
const largeObject = ref(heavyData);

// ✅ Good - shallow reactivity for large data
const largeObject = shallowRef(heavyData);
```

### 5. Use Computed for Derived State

```javascript
import { ref, computed } from 'vue';

const items = ref([]);

// ❌ Bad - recalculates on every render
const filteredItems = items.value.filter(i => i.active);

// ✅ Good - cached until dependencies change
const filteredItems = computed(() => 
  items.value.filter(i => i.active)
);
```

### 6. Debounce Expensive Operations

```javascript
import { useDebounceFn } from '@/composables/useDebounce';

const { debouncedFn } = useDebounceFn(() => {
  // Expensive calculation
  calculateComplexStats();
}, 500);

watch(someData, () => {
  debouncedFn();
});
```

### 7. Use KeepAlive for Cached Components

```vue
<router-view v-slot="{ Component }">
  <keep-alive :max="10">
    <component :is="Component" />
  </keep-alive>
</router-view>
```

## 🎯 Performance Checklist

- [ ] All API calls use AbortController
- [ ] Search inputs are debounced (300ms)
- [ ] Large lists use virtual scrolling
- [ ] File uploads are parallel (max 3 concurrent)
- [ ] Routes are lazy loaded
- [ ] Images are optimized and lazy loaded
- [ ] Network status is checked before API calls
- [ ] No magic strings - use constants
- [ ] Computed properties for derived state
- [ ] KeepAlive for frequently visited routes

## 📈 Measuring Performance

### Vue DevTools

1. Install Vue DevTools browser extension
2. Open DevTools → Vue tab
3. Check component render times
4. Inspect component tree depth

### Lighthouse

```bash
# Run production build
npm run build
npm run preview

# Open Chrome DevTools
# Run Lighthouse audit
```

### Bundle Analysis

```bash
# Analyze bundle size
npm run build -- --report
```

## 🔧 Configuration

All performance-related constants are in `/src/config/env.js`:

```javascript
export const config = {
  ui: {
    searchDebounce: 300,
    virtualScrollSliceSize: 50,
  },
  upload: {
    maxFileSize: 10 * 1024 * 1024,
    chunkSize: 5 * 1024 * 1024
  },
  api: {
    timeout: 30000,
    maxRetries: 3,
    maxQueueSize: 50
  }
};
```

## 🚦 Performance Targets

- **First Contentful Paint (FCP):** < 1.8s
- **Time to Interactive (TTI):** < 3.8s
- **Largest Contentful Paint (LCP):** < 2.5s
- **Cumulative Layout Shift (CLS):** < 0.1
- **First Input Delay (FID):** < 100ms

## 📚 Additional Resources

- [Vue.js Performance Guide](https://vuejs.org/guide/best-practices/performance.html)
- [Web Vitals](https://web.dev/vitals/)
- [Quasar Performance](https://quasar.dev/quasar-plugins/loading)
