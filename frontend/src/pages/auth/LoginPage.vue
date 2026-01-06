<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card class="login-card" flat bordered>
          <q-card-section class="text-center q-pt-lg">
            <div class="text-h4 text-weight-bold text-primary">
              {{ $t('app.name') }}
            </div>
            <div class="text-subtitle2 text-grey-7 q-mt-sm">
              {{ $t('app.tagline') }}
            </div>
          </q-card-section>

          <q-card-section class="q-px-lg q-pb-lg">
            <q-form @submit="onSubmit" class="q-gutter-md">
              <q-input
                v-model="email"
                :label="$t('auth.email')"
                type="email"
                outlined
                :rules="[val => !!val || $t('validation.required'), val => /.+@.+\..+/.test(val) || $t('validation.email')]"
                lazy-rules
              >
                <template v-slot:prepend>
                  <q-icon name="email" />
                </template>
              </q-input>

              <q-input
                v-model="password"
                :label="$t('auth.password')"
                :type="showPassword ? 'text' : 'password'"
                outlined
                :rules="[val => !!val || $t('validation.required')]"
                lazy-rules
              >
                <template v-slot:prepend>
                  <q-icon name="lock" />
                </template>
                <template v-slot:append>
                  <q-icon
                    :name="showPassword ? 'visibility' : 'visibility_off'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <div class="row items-center justify-between">
                <q-checkbox v-model="rememberMe" :label="$t('auth.rememberMe')" />
                <q-btn
                  flat
                  no-caps
                  dense
                  :label="$t('auth.forgotPassword')"
                  color="primary"
                  class="text-caption"
                  @click="onForgotPassword"
                />
              </div>

              <q-btn
                type="submit"
                :label="$t('auth.login')"
                color="primary"
                size="lg"
                class="full-width"
                :loading="loading"
                no-caps
              />
            </q-form>
          </q-card-section>

          <q-separator />

          <q-card-section class="text-center">
            <div class="row items-center justify-center q-gutter-sm">
              <q-btn
                v-for="locale in locales"
                :key="locale.value"
                flat
                dense
                size="sm"
                :label="locale.label"
                :color="currentLocale === locale.value ? 'primary' : 'grey-7'"
                @click="changeLocale(locale.value)"
              />
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script>
import { defineComponent, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useAuthStore, useAppStore } from '../../stores';

export default defineComponent({
  name: 'LoginPage',

  setup() {
    const router = useRouter();
    const { t, locale } = useI18n();
    const $q = useQuasar();
    const authStore = useAuthStore();
    const appStore = useAppStore();

    const email = ref('');
    const password = ref('');
    const rememberMe = ref(false);
    const showPassword = ref(false);
    const loading = ref(false);

    const locales = [
      { value: 'en', label: 'EN' },
      { value: 'ru', label: 'RU' },
      { value: 'bg', label: 'BG' }
    ];

    const currentLocale = computed(() => locale.value);

    const changeLocale = (newLocale) => {
      locale.value = newLocale;
      appStore.setLocale(newLocale);
    };

    const onSubmit = async () => {
      loading.value = true;
      
      try {
        const result = await authStore.login(email.value, password.value);
        
        if (result.success) {
          $q.notify({
            message: t('auth.loginSuccess'),
            color: 'positive',
            icon: 'check',
            position: 'top'
          });
          
          // Redirect to intended route or dashboard
          const redirect = router.currentRoute.value.query.redirect || '/dashboard';
          router.push(redirect);
        } else {
          $q.notify({
            message: result.error || t('auth.loginError'),
            color: 'negative',
            icon: 'error',
            position: 'top'
          });
        }
      } catch (error) {
        $q.notify({
          message: error.message || t('auth.loginError'),
          color: 'negative',
          icon: 'error',
          position: 'top'
        });
      } finally {
        loading.value = false;
      }
    };

    const onForgotPassword = () => {
      $q.notify({
        message: t('common.info'),
        caption: 'Password reset functionality coming soon',
        color: 'info',
        icon: 'info'
      });
    };

    return {
      email,
      password,
      rememberMe,
      showPassword,
      loading,
      locales,
      currentLocale,
      changeLocale,
      onSubmit,
      onForgotPassword
    };
  }
});
</script>

<style lang="scss" scoped>
.bg-gradient {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 100%;
  max-width: 450px;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}
</style>
