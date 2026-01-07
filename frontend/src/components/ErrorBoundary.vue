<template>
  <div v-if="error" class="error-boundary q-pa-lg flex flex-center column">
    <q-icon name="error_outline" size="80px" color="negative" class="q-mb-md" />
    
    <h2 class="text-h4 q-mb-sm">{{ $t('errors.somethingWentWrong') }}</h2>
    
    <p class="text-subtitle1 text-grey-7 q-mb-lg text-center" style="max-width: 500px">
      {{ $t('errors.errorBoundaryMessage') }}
    </p>
    
    <div class="q-gutter-md">
      <q-btn
        :label="$t('common.retry')"
        color="primary"
        unelevated
        @click="reset"
        icon="refresh"
      />
      
      <q-btn
        :label="$t('common.goHome')"
        color="grey"
        outline
        @click="goHome"
        icon="home"
      />
    </div>
    
    <q-expansion-item
      v-if="import.meta.env.DEV"
      class="q-mt-lg"
      icon="bug_report"
      :label="$t('errors.technicalDetails')"
      style="max-width: 600px; width: 100%"
    >
      <q-card>
        <q-card-section class="bg-grey-2">
          <pre class="text-caption">{{ errorDetails }}</pre>
        </q-card-section>
      </q-card>
    </q-expansion-item>
  </div>
  
  <slot v-else />
</template>

<script setup>
import { ref, computed, onErrorCaptured } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const error = ref(null);
const errorInfo = ref(null);

const errorDetails = computed(() => {
  if (!error.value) return '';
  
  return `Error: ${error.value.message}\n\n` +
         `Stack: ${error.value.stack || 'No stack trace'}\n\n` +
         `Component Info: ${errorInfo.value || 'N/A'}`;
});

onErrorCaptured((err, instance, info) => {
  error.value = err;
  errorInfo.value = info;
  
  // Log error to console in development
  if (import.meta.env.DEV) {
    console.error('[ErrorBoundary] Caught error:', err);
    console.error('[ErrorBoundary] Component info:', info);
    console.error('[ErrorBoundary] Component instance:', instance);
  }
  
  // Send to error tracking service in production
  if (import.meta.env.PROD && window.Sentry) {
    window.Sentry.captureException(err, {
      extra: {
        componentInfo: info,
        componentName: instance?.$options?.name || 'Unknown'
      }
    });
  }
  
  // Prevent error from propagating further
  return false;
});

const reset = () => {
  error.value = null;
  errorInfo.value = null;
};

const goHome = () => {
  error.value = null;
  errorInfo.value = null;
  router.push('/');
};
</script>

<style lang="scss" scoped>
.error-boundary {
  min-height: 400px;
  
  pre {
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.4;
    margin: 0;
  }
}
</style>
