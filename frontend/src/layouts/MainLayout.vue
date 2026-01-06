<template>
  <q-layout view="lHh Lpr lFf">
    <!-- Header -->
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleDrawer"
        />

        <q-toolbar-title>
          {{ $t('app.name') }}
        </q-toolbar-title>

        <!-- Language Selector -->
        <q-btn-dropdown flat no-caps :label="currentLocale.toUpperCase()">
          <q-list>
            <q-item
              v-for="locale in locales"
              :key="locale.value"
              clickable
              v-close-popup
              @click="changeLocale(locale.value)"
            >
              <q-item-section>
                <q-item-label>{{ locale.label }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <!-- Notifications -->
        <q-btn flat round dense icon="notifications">
          <q-badge v-if="unreadCount > 0" color="red" floating>{{ unreadCount }}</q-badge>
        </q-btn>

        <!-- User Menu -->
        <q-btn flat round dense icon="account_circle">
          <q-menu>
            <q-list style="min-width: 200px">
              <q-item>
                <q-item-section>
                  <q-item-label>{{ user?.name || user?.email }}</q-item-label>
                  <q-item-label caption>{{ $t(`roles.${user?.role}`) }}</q-item-label>
                </q-item-section>
              </q-item>
              
              <q-separator />
              
              <q-item clickable v-close-popup @click="$router.push('/profile')">
                <q-item-section avatar>
                  <q-icon name="person" />
                </q-item-section>
                <q-item-section>{{ $t('nav.profile') }}</q-item-section>
              </q-item>
              
              <q-item clickable v-close-popup @click="$router.push('/settings')">
                <q-item-section avatar>
                  <q-icon name="settings" />
                </q-item-section>
                <q-item-section>{{ $t('nav.settings') }}</q-item-section>
              </q-item>
              
              <q-separator />
              
              <q-item clickable v-close-popup @click="handleLogout">
                <q-item-section avatar>
                  <q-icon name="logout" color="negative" />
                </q-item-section>
                <q-item-section>{{ $t('auth.logout') }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- Left Drawer (Menu) -->
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      :width="280"
      :breakpoint="768"
    >
      <q-scroll-area class="fit">
        <q-list padding>
          <!-- Dashboard -->
          <q-item
            clickable
            :active="$route.name === 'dashboard'"
            @click="$router.push('/dashboard')"
          >
            <q-item-section avatar>
              <q-icon name="dashboard" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.dashboard') }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Management Companies (Super Admin only) -->
          <q-item
            v-if="canViewManagementCompanies"
            clickable
            :active="$route.path.startsWith('/management-companies')"
            @click="$router.push('/management-companies')"
          >
            <q-item-section avatar>
              <q-icon name="business" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.managementCompanies') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Complexes -->
          <q-item
            clickable
            :active="$route.path.startsWith('/complexes')"
            @click="$router.push('/complexes')"
          >
            <q-item-section avatar>
              <q-icon name="apartment" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.complexes') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Units -->
          <q-item
            clickable
            :active="$route.path.startsWith('/units')"
            @click="$router.push('/units')"
          >
            <q-item-section avatar>
              <q-icon name="door_front" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.units') }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Residents -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/residents')"
            @click="$router.push('/residents')"
          >
            <q-item-section avatar>
              <q-icon name="people" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.residents') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Workers -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/workers')"
            @click="$router.push('/workers')"
          >
            <q-item-section avatar>
              <q-icon name="engineering" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.workers') }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Tickets -->
          <q-item
            clickable
            :active="$route.path.startsWith('/tickets')"
            @click="$router.push('/tickets')"
          >
            <q-item-section avatar>
              <q-icon name="confirmation_number" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.tickets') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Meter Readings -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/meter-readings')"
            @click="$router.push('/meter-readings')"
          >
            <q-item-section avatar>
              <q-icon name="speed" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.meterReadings') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Billing -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/billing')"
            @click="$router.push('/billing')"
          >
            <q-item-section avatar>
              <q-icon name="payments" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.billing') }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Polls -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/polls')"
            @click="$router.push('/polls')"
          >
            <q-item-section avatar>
              <q-icon name="poll" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.polls') }}</q-item-label>
            </q-item-section>
          </q-item>

          <!-- Access Control -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/access-control')"
            @click="$router.push('/access-control')"
          >
            <q-item-section avatar>
              <q-icon name="security" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.accessControl') }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator spaced />

          <!-- Reports -->
          <q-item
            v-if="!isWorker"
            clickable
            :active="$route.path.startsWith('/reports')"
            @click="$router.push('/reports')"
          >
            <q-item-section avatar>
              <q-icon name="assessment" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ $t('nav.reports') }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <!-- Page Content -->
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script>
import { defineComponent, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuasar } from 'quasar';
import { useAuthStore, useAppStore } from '../stores';

export default defineComponent({
  name: 'MainLayout',

  setup() {
    const router = useRouter();
    const { t, locale } = useI18n();
    const $q = useQuasar();
    const authStore = useAuthStore();
    const appStore = useAppStore();

    const drawerOpen = ref(appStore.leftDrawerOpen);

    const locales = [
      { value: 'en', label: 'English' },
      { value: 'ru', label: 'Русский' },
      { value: 'bg', label: 'Български' }
    ];

    const user = computed(() => authStore.currentUser);
    const currentLocale = computed(() => locale.value);
    const unreadCount = computed(() => appStore.unreadNotifications);

    // Role checks
    const canViewManagementCompanies = computed(() => 
      authStore.isSuperAdmin || authStore.isSuperAccountant
    );
    const isWorker = computed(() => authStore.isWorker);

    const toggleDrawer = () => {
      drawerOpen.value = !drawerOpen.value;
      appStore.toggleDrawer();
    };

    const changeLocale = (newLocale) => {
      locale.value = newLocale;
      appStore.setLocale(newLocale);
      $q.notify({
        message: t('common.success'),
        color: 'positive',
        icon: 'check'
      });
    };

    const handleLogout = async () => {
      $q.dialog({
        title: t('auth.logout'),
        message: t('auth.logoutConfirm'),
        cancel: true,
        persistent: true
      }).onOk(async () => {
        await authStore.logout();
        $q.notify({
          message: t('auth.logoutSuccess'),
          color: 'positive',
          icon: 'check'
        });
        router.push('/login');
      });
    };

    return {
      drawerOpen,
      locales,
      user,
      currentLocale,
      unreadCount,
      canViewManagementCompanies,
      isWorker,
      toggleDrawer,
      changeLocale,
      handleLogout
    };
  }
});
</script>

<style lang="scss" scoped>
.q-item {
  border-radius: 8px;
  margin: 4px 8px;
  
  &.q-router-link--active {
    background-color: rgba(25, 118, 210, 0.1);
    color: $primary;
  }
}
</style>
