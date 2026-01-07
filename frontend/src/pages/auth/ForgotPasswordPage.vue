<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card style="width: 420px; max-width: 90vw;" class="q-pa-md">
          <q-card-section class="text-center">
            <q-icon name="lock_reset" size="64px" color="primary" />
            <div class="text-h5 text-weight-bold q-mt-md">{{ $t('auth.forgotPassword') }}</div>
            <div class="text-subtitle2 text-grey-7 q-mt-sm">
              {{ $t('auth.forgotPasswordHint') }}
            </div>
          </q-card-section>

          <q-card-section v-if="!emailSent">
            <q-form @submit.prevent="handleSubmit" class="q-gutter-md" ref="formRef">
              <q-input
                v-model="email"
                :label="$t('auth.email')"
                type="email"
                outlined
                autocomplete="email"
                :rules="emailRules"
                @blur="email = email.trim().toLowerCase()"
              >
                <template v-slot:prepend><q-icon name="email" /></template>
              </q-input>

              <q-btn
                type="submit"
                :label="$t('auth.sendResetLink')"
                color="primary"
                class="full-width"
                size="lg"
                :loading="loading"
                :disable="loading || isRateLimited"
                no-caps
                unelevated
              />

              <div v-if="isRateLimited" class="text-negative text-caption text-center q-mt-sm">
                {{ $t('auth.tooManyAttempts') }}
                <br>
                {{ $t('auth.tryAgainIn', { minutes: Math.ceil(remainingTime / 60000) }) }}
              </div>
            </q-form>
          </q-card-section>

          <q-card-section v-else class="text-center">
            <q-icon name="mark_email_read" size="64px" color="positive" />
            <div class="text-body1 q-mt-md">
              {{ $t('auth.resetLinkSent') }}
            </div>
            <div class="text-caption text-grey-7 q-mt-sm">
              {{ $t('auth.checkYourEmail') }}
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section class="text-center">
            <q-btn 
              flat 
              :label="$t('auth.backToLogin')" 
              color="primary"
              @click="$router.push('/login')"
              icon="arrow_back"
            />
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { validateEmail } from '../../utils/validators';

const $q = useQuasar();
const { t } = useI18n();
const authStore = useAuthStore();

const loading = ref(false);
const emailSent = ref(false);
const email = ref('');
const formRef = ref(null);

// CRITICAL: Rate limiting configuration
const RATE_LIMIT_KEY = 'password_reset_rate_limit';
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const rateLimitData = ref({
  attempts: 0,
  lastAttempt: 0,
  blockedUntil: 0
});

const currentTime = ref(Date.now());
let timeUpdateInterval = null;

// Load rate limit data from localStorage
onMounted(() => {
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (stored) {
      rateLimitData.value = JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load rate limit data:', error);
  }

  // Update current time every second for countdown
  timeUpdateInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
  }
});

const isRateLimited = computed(() => {
  return currentTime.value < rateLimitData.value.blockedUntil;
});

const remainingTime = computed(() => {
  if (!isRateLimited.value) return 0;
  return Math.max(0, rateLimitData.value.blockedUntil - currentTime.value);
});

const emailRules = [
  val => !!val || t('validation.required'),
  val => validateEmail(val) || t('validation.email')
];

const saveRateLimitData = () => {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(rateLimitData.value));
  } catch (error) {
    console.warn('Failed to save rate limit data:', error);
  }
};

const handleSubmit = async () => {
  const valid = await formRef.value.validate();
  if (!valid) return;

  const now = Date.now();

  // CRITICAL: Check rate limit
  if (isRateLimited.value) {
    $q.notify({
      message: t('auth.tooManyAttempts'),
      caption: t('auth.tryAgainIn', { 
        minutes: Math.ceil(remainingTime.value / 60000) 
      }),
      color: 'negative',
      icon: 'block',
      position: 'top'
    });
    return;
  }

  // Reset counter if time window has passed
  if (now - rateLimitData.value.lastAttempt > WINDOW_MS) {
    rateLimitData.value.attempts = 0;
  }

  // Increment attempt counter
  rateLimitData.value.attempts++;
  rateLimitData.value.lastAttempt = now;

  // Block if max attempts reached
  if (rateLimitData.value.attempts >= MAX_ATTEMPTS) {
    rateLimitData.value.blockedUntil = now + WINDOW_MS;
    saveRateLimitData();

    $q.notify({
      message: t('auth.tooManyAttempts'),
      caption: t('auth.tryAgainIn', { minutes: 15 }),
      color: 'negative',
      icon: 'block',
      position: 'top',
      timeout: 5000
    });
    return;
  }

  saveRateLimitData();
  loading.value = true;
  
  try {
    await authStore.requestPasswordReset(email.value);
    emailSent.value = true;
    
    // Reset rate limit on successful submission
    rateLimitData.value = {
      attempts: 0,
      lastAttempt: 0,
      blockedUntil: 0
    };
    saveRateLimitData();
    
    $q.notify({
      message: t('auth.resetLinkSent'),
      color: 'positive',
      icon: 'check',
      position: 'top'
    });
  } catch (error) {
    $q.notify({
      message: error.message || t('errors.generic'),
      color: 'negative',
      icon: 'error',
      position: 'top'
    });
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.bg-gradient {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
