<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>{{ $t('app.name') }}</q-toolbar-title>
        <q-space />
        <NotificationBell />
        <q-btn-dropdown flat round dense icon="language">
          <q-list>
            <q-item clickable v-close-popup @click="changeLocale('ru')"><q-item-section>Русский</q-item-section></q-item>
            <q-item clickable v-close-popup @click="changeLocale('en')"><q-item-section>English</q-item-section></q-item>
            <q-item clickable v-close-popup @click="changeLocale('bg')"><q-item-section>Български</q-item-section></q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn-dropdown flat round dense icon="account_circle">
          <q-list>
            <q-item clickable v-close-popup :to="'/profile'"><q-item-section avatar><q-icon name="person" /></q-item-section><q-item-section>{{ $t('nav.profile') }}</q-item-section></q-item>
            <q-item clickable v-close-popup :to="'/settings'"><q-item-section avatar><q-icon name="settings" /></q-item-section><q-item-section>{{ $t('nav.settings') }}</q-item-section></q-item>
            <q-separator />
            <q-item clickable @click="handleLogout"><q-item-section avatar><q-icon name="logout" /></q-item-section><q-item-section>{{ $t('auth.logout') }}</q-item-section></q-item>
          </q-list>
        </q-btn-dropdown>
      </q-toolbar>
    </q-header>
    <q-drawer v-model="drawer" show-if-above :width="260" :breakpoint="500" bordered>
      <q-scroll-area class="fit">
        <q-list padding>
          <q-item clickable :to="'/'" exact><q-item-section avatar><q-icon name="dashboard" /></q-item-section><q-item-section>{{ $t('nav.dashboard') }}</q-item-section></q-item>
          <q-separator />
          <q-item clickable :to="'/management-companies'"><q-item-section avatar><q-icon name="business" /></q-item-section><q-item-section>{{ $t('nav.managementCompanies') }}</q-item-section></q-item>
          <q-item clickable :to="'/complexes'"><q-item-section avatar><q-icon name="apartment" /></q-item-section><q-item-section>{{ $t('nav.complexes') }}</q-item-section></q-item>
          <q-item clickable :to="'/units'"><q-item-section avatar><q-icon name="home" /></q-item-section><q-item-section>{{ $t('nav.units') }}</q-item-section></q-item>
          <q-separator />
          <q-item clickable :to="'/residents'"><q-item-section avatar><q-icon name="people" /></q-item-section><q-item-section>{{ $t('nav.residents') }}</q-item-section></q-item>
          <q-item clickable :to="'/workers'"><q-item-section avatar><q-icon name="engineering" /></q-item-section><q-item-section>{{ $t('nav.workers') }}</q-item-section></q-item>
          <q-separator />
          <q-item clickable :to="'/tickets'"><q-item-section avatar><q-icon name="confirmation_number" /></q-item-section><q-item-section>{{ $t('nav.tickets') }}</q-item-section></q-item>
          <q-item clickable :to="'/meter-readings'"><q-item-section avatar><q-icon name="speed" /></q-item-section><q-item-section>{{ $t('nav.meterReadings') }}</q-item-section></q-item>
          <q-item clickable :to="'/billing'"><q-item-section avatar><q-icon name="receipt" /></q-item-section><q-item-section>{{ $t('nav.billing') }}</q-item-section></q-item>
          <q-item clickable :to="'/polls'"><q-item-section avatar><q-icon name="poll" /></q-item-section><q-item-section>{{ $t('nav.polls') }}</q-item-section></q-item>
          <q-separator />
          <q-item clickable :to="'/reports'"><q-item-section avatar><q-icon name="assessment" /></q-item-section><q-item-section>{{ $t('nav.reports') }}</q-item-section></q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>
    <q-page-container><router-view /></q-page-container>
  </q-layout>
</template>
<script>
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../stores';
import NotificationBell from '../components/NotificationBell.vue';
export default defineComponent({
  name: 'MainLayout',
  components: { NotificationBell },
  setup() {
    const router = useRouter();
    const { locale } = useI18n();
    const $q = useQuasar();
    const authStore = useAuthStore();
    const drawer = ref(true);
    const changeLocale = (lang) => {
      locale.value = lang;
      localStorage.setItem('locale', lang);
    };
    const handleLogout = async () => {
      $q.dialog({
        title: 'Confirm',
        message: 'Are you sure you want to logout?',
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await authStore.logout();
        router.push('/login');
      });
    };
    return { drawer, changeLocale, handleLogout };
  }
});
</script>
