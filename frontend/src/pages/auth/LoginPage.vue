<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card style="width: 420px; max-width: 90vw;" class="q-pa-md">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-primary q-mb-xs">{{ $t('app.name') }}</div>
            <div class="text-subtitle2 text-grey-7">{{ $t('app.tagline') }}</div>
          </q-card-section>

          <q-card-section>
            <q-form @submit.prevent="handleLogin" class="q-gutter-md" ref="formRef">
              <q-input
                v-model="form.email"
                :label="$t('auth.email')"
                type="email"
                outlined
                autocomplete="email"
                :rules="emailRules"
                lazy-rules
                @blur="form.email = form.email.trim().toLowerCase()"
              >
                <template v-slot:prepend><q-icon name="email" /></template>
              </q-input>

              <q-input
                v-model="form.password"
                :label="$t('auth.password')"
                :type="showPassword ? 'text' : 'password'"
                outlined
                autocomplete="current-password"
                :rules="passwordRules"
                lazy-rules
              >
                <template v-slot:prepend><q-icon name="lock" /></template>
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <div class="row items-center">
                <q-checkbox v-model="form.rememberMe" :label="$t('auth.rememberMe')" />
                <q-space />
                <q-btn 
                  flat 
                  dense 
                  no-caps 
                  :label="$t('auth.forgotPassword')" 
                  color="primary" 
                  size="sm"
                  @click="$router.push('/forgot-password')"
                />
              </div>

              <q-btn
                type="submit"
                :label="$t('auth.login')"
                color="primary"
                class="full-width"
                size="lg"
                :loading="loading"
                :disable="loading"
                no-caps
                unelevated
              />
            </q-form>
          </q-card-section>

          <q-separator />

          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">
              {{ $t('auth.noAccount') }}
              <q-btn 
                flat 
                dense 
                no-caps 
                :label="$t('auth.signUp')" 
                color="primary" 
                size="sm"
                @click="$router.push('/register')"
              />
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { validateEmail } from '../../utils/validators';

const router = useRouter();
const $q = useQuasar();
const { t } = useI18n();
const authStore = useAuthStore();

const loading = ref(false);
const showPassword = ref(false);
const formRef = ref(null);
const form = reactive({
  email: '',
  password: '',
  rememberMe: authStore.rememberMe
});

const emailRules = [
  val => !!val || t('validation.required'),
  val => validateEmail(val) || t('validation.email')
];

const passwordRules = [
  val => !!val || t('validation.required'),
  val => val.length >= 8 || t('validation.passwordMin', { min: 8 })
];

const handleLogin = async () => {
  const valid = await formRef.value.validate();
  if (!valid) return;
  
  loading.value = true;
  
  try {
    await authStore.login({
      email: form.email,
      password: form.password,
      rememberMe: form.rememberMe
    });
    
    $q.notify({
      message: t('auth.loginSuccess'),
      color: 'positive',
      icon: 'check',
      position: 'top'
    });
    
    // Clear form
    form.password = '';
    
    router.push('/');
  } catch (error) {
    // Clear password on error for user to re-enter
    form.password = '';
    
    $q.notify({
      message: t(error.message) || t('auth.loginError'),
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
