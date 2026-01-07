<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card style="width: 480px; max-width: 90vw;" class="q-pa-md">
          <q-card-section class="text-center">
            <div class="text-h5 text-weight-bold text-primary q-mb-xs">{{ $t('auth.createAccount') }}</div>
            <div class="text-subtitle2 text-grey-7">{{ $t('auth.joinServAI') }}</div>
          </q-card-section>

          <q-card-section>
            <q-form @submit.prevent="handleRegister" class="q-gutter-md" ref="formRef">
              <div class="row q-col-gutter-md">
                <div class="col-6">
                  <q-input
                    v-model="form.firstName"
                    :label="$t('auth.firstName')"
                    outlined
                    :rules="[val => !!val || $t('validation.required')]"
                    @blur="form.firstName = form.firstName.trim()"
                  >
                    <template v-slot:prepend><q-icon name="person" /></template>
                  </q-input>
                </div>
                <div class="col-6">
                  <q-input
                    v-model="form.lastName"
                    :label="$t('auth.lastName')"
                    outlined
                    :rules="[val => !!val || $t('validation.required')]"
                    @blur="form.lastName = form.lastName.trim()"
                  >
                    <template v-slot:prepend><q-icon name="person" /></template>
                  </q-input>
                </div>
              </div>

              <q-input
                v-model="form.email"
                :label="$t('auth.email')"
                type="email"
                outlined
                :rules="emailRules"
                @blur="form.email = form.email.trim().toLowerCase()"
              >
                <template v-slot:prepend><q-icon name="email" /></template>
              </q-input>

              <q-input
                v-model="form.phone"
                :label="$t('auth.phone') + ' (' + $t('common.optional') + ')'"
                type="tel"
                outlined
                mask="+# (###) ###-##-##"
              >
                <template v-slot:prepend><q-icon name="phone" /></template>
              </q-input>

              <q-input
                v-model="form.password"
                :label="$t('auth.password')"
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
                <div class="text-caption" :class="`text-${passwordStrength.color}`">
                  {{ $t(`auth.strength.${passwordStrength.label}`) }}
                </div>
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

              <q-checkbox v-model="form.acceptTerms" :rules="[val => !!val || $t('validation.acceptTerms')]">
                <template v-slot:default>
                  <span class="text-caption">
                    {{ $t('auth.iAccept') }}
                    <a href="/terms" target="_blank" class="text-primary">{{ $t('auth.terms') }}</a>
                    {{ $t('common.and') }}
                    <a href="/privacy" target="_blank" class="text-primary">{{ $t('auth.privacy') }}</a>
                  </span>
                </template>
              </q-checkbox>

              <q-btn
                type="submit"
                :label="$t('auth.register')"
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
              {{ $t('auth.haveAccount') }}
              <q-btn 
                flat 
                dense 
                no-caps 
                :label="$t('auth.login')" 
                color="primary" 
                size="sm"
                @click="$router.push('/login')"
              />
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { validateEmail, getPasswordStrength } from '../../utils/validators';

const router = useRouter();
const $q = useQuasar();
const { t } = useI18n();
const authStore = useAuthStore();

const loading = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const formRef = ref(null);
const passwordStrength = ref({ score: 0, label: 'weak', color: 'grey' });

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
});

const emailRules = [
  val => !!val || t('validation.required'),
  val => validateEmail(val) || t('validation.email')
];

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

const handleRegister = async () => {
  const valid = await formRef.value.validate();
  if (!valid) return;
  
  loading.value = true;
  
  try {
    await authStore.register({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || undefined,
      password: form.password
    });
    
    $q.notify({
      message: t('auth.registerSuccess'),
      color: 'positive',
      icon: 'check',
      position: 'top'
    });
    
    form.password = '';
    form.confirmPassword = '';
    
    router.push('/');
  } catch (error) {
    form.password = '';
    form.confirmPassword = '';
    
    $q.notify({
      message: t(error.message) || t('auth.registerError'),
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
