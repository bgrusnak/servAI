<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center bg-gradient">
        <q-card style="width: 400px; max-width: 90vw;" class="q-pa-md">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-primary q-mb-xs">{{ $t('app.name') }}</div>
            <div class="text-subtitle2 text-grey-7">{{ $t('app.tagline') }}</div>
          </q-card-section>

          <q-card-section>
            <q-form @submit="handleLogin" class="q-gutter-md">
              <q-input
                v-model="form.email"
                :label="$t('auth.email')"
                type="email"
                outlined
                :rules="[val => !!val || $t('validation.required'), val => /.+@.+\..+/.test(val) || $t('validation.email')]"
              >
                <template v-slot:prepend><q-icon name="email" /></template>
              </q-input>

              <q-input
                v-model="form.password"
                :label="$t('auth.password')"
                :type="showPassword ? 'text' : 'password'"
                outlined
                :rules="[val => !!val || $t('validation.required')]"
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
                <q-btn flat dense no-caps :label="$t('auth.forgotPassword')" color="primary" size="sm" />
              </div>

              <q-btn
                type="submit"
                :label="$t('auth.login')"
                color="primary"
                class="full-width"
                size="lg"
                :loading="loading"
                no-caps
                unelevated
              />
            </q-form>
          </q-card-section>

          <q-separator />

          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">
              {{ $t('auth.noAccount') }}
              <q-btn flat dense no-caps :label="$t('auth.signUp')" color="primary" size="sm" />
            </div>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores';

export default defineComponent({
  name: 'LoginPage',
  setup() {
    const router = useRouter();
    const $q = useQuasar();
    const { t } = useI18n();
    const authStore = useAuthStore();

    const loading = ref(false);
    const showPassword = ref(false);
    const form = ref({
      email: '',
      password: '',
      rememberMe: false
    });

    const handleLogin = async () => {
      loading.value = true;
      try {
        await authStore.login({
          email: form.value.email,
          password: form.value.password
        });
        $q.notify({
          message: t('auth.loginSuccess'),
          color: 'positive',
          icon: 'check'
        });
        router.push('/');
      } catch (error) {
        $q.notify({
          message: error.message || t('auth.loginError'),
          color: 'negative',
          icon: 'error'
        });
      } finally {
        loading.value = false;
      }
    };

    return {
      loading,
      showPassword,
      form,
      handleLogin
    };
  }
});
</script>

<style lang="scss" scoped>
.bg-gradient {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
