<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card style="width: 420px; max-width: 90vw;" class="q-pa-md">
          <q-card-section class="text-center">
            <q-icon name="lock_open" size="64px" color="primary" />
            <div class="text-h5 text-weight-bold q-mt-md">{{ $t('auth.resetPassword') }}</div>
            <div class="text-subtitle2 text-grey-7 q-mt-sm">
              {{ $t('auth.enterNewPassword') }}
            </div>
          </q-card-section>

          <q-card-section v-if="!passwordReset">
            <q-form @submit.prevent="handleSubmit" class="q-gutter-md" ref="formRef">
              <q-input
                v-model="form.password"
                :label="$t('auth.newPassword')"
                :type="showPassword ? 'text' : 'password'"
                outlined
                :rules="passwordRules"
                @update:model-value="updatePasswordStrength"
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

              <div v-if="form.password" class="q-mt-sm">
                <div class="text-caption text-grey-7 q-mb-xs">{{ $t('auth.passwordStrength') }}:</div>
                <q-linear-progress
                  :value="passwordStrength.score / 4"
                  :color="passwordStrength.color"
                  size="8px"
                  rounded
                />
              </div>

              <q-input
                v-model="form.confirmPassword"
                :label="$t('auth.confirmPassword')"
                :type="showConfirmPassword ? 'text' : 'password'"
                outlined
                :rules="confirmPasswordRules"
              >
                <template v-slot:prepend><q-icon name="lock" /></template>
                <template v-slot:append>
                  <q-icon
                    :name="showConfirmPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showConfirmPassword = !showConfirmPassword"
                  />
                </template>
              </q-input>

              <q-btn
                type="submit"
                :label="$t('auth.resetPassword')"
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
            <q-icon name="check_circle" size="64px" color="positive" />
            <div class="text-body1 q-mt-md">
              {{ $t('auth.passwordResetSuccess') }}
            </div>
            <q-btn
              :label="$t('auth.goToLogin')"
              color="primary"
              class="q-mt-md"
              @click="$router.push('/login')"
              no-caps
            />
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { getPasswordStrength } from '../../utils/validators';

const route = useRoute();
const $q = useQuasar();
const { t } = useI18n();
const authStore = useAuthStore();

const loading = ref(false);
const passwordReset = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const formRef = ref(null);
const passwordStrength = ref({ score: 0, label: 'weak', color: 'grey' });

const form = reactive({
  password: '',
  confirmPassword: ''
});

const passwordRules = [
  val => !!val || t('validation.required'),
  val => val.length >= 8 || t('validation.passwordMin', { min: 8 }),
  val => /[A-Z]/.test(val) || t('validation.passwordUppercase'),
  val => /[a-z]/.test(val) || t('validation.passwordLowercase'),
  val => /[0-9]/.test(val) || t('validation.passwordNumber')
];

const confirmPasswordRules = [
  val => !!val || t('validation.required'),
  val => val === form.password || t('validation.passwordMatch')
];

const updatePasswordStrength = () => {
  passwordStrength.value = getPasswordStrength(form.password);
};

const handleSubmit = async () => {
  const valid = await formRef.value.validate();
  if (!valid) return;
  
  loading.value = true;
  
  try {
    await authStore.resetPassword(route.params.token, form.password);
    passwordReset.value = true;
    
    form.password = '';
    form.confirmPassword = '';
    
    $q.notify({
      message: t('auth.passwordResetSuccess'),
      color: 'positive',
      icon: 'check',
      position: 'top'
    });
  } catch (error) {
    form.password = '';
    form.confirmPassword = '';
    
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
