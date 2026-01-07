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
                :disable="loading"
                no-caps
                unelevated
              />
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
import { ref } from 'vue';
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

const emailRules = [
  val => !!val || t('validation.required'),
  val => validateEmail(val) || t('validation.email')
];

const handleSubmit = async () => {
  const valid = await formRef.value.validate();
  if (!valid) return;
  
  loading.value = true;
  
  try {
    await authStore.requestPasswordReset(email.value);
    emailSent.value = true;
    
    $q.notify({
      message: t('auth.resetLinkSent'),
      color: 'positive',
      icon: 'check',
      position: 'top'
    });
  } catch (error) {
    $q.notify({
      message: t(error.message) || t('errors.generic'),
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
