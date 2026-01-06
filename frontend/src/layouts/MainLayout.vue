<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-white text-grey-9">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="toggleLeftDrawer" />
        <q-toolbar-title class="text-weight-bold">ServAI</q-toolbar-title>
        <q-space />
        <q-btn flat round dense icon="notifications" @click="showNotifications = true"><q-badge v-if="unreadCount > 0" color="red" floating>{{ unreadCount }}</q-badge></q-btn>
        <q-btn flat round dense icon="account_circle"><q-menu><q-list style="min-width: 200px"><q-item clickable v-close-popup @click="$router.push('/profile')"><q-item-section avatar><q-icon name="person" /></q-item-section><q-item-section>{{ $t('nav.profile') }}</q-item-section></q-item><q-item clickable v-close-popup @click="$router.push('/settings')"><q-item-section avatar><q-icon name="settings" /></q-item-section><q-item-section>{{ $t('nav.settings') }}</q-item-section></q-item><q-separator /><q-item clickable v-close-popup @click="logout"><q-item-section avatar><q-icon name="logout" color="negative" /></q-item-section><q-item-section>{{ $t('auth.logout') }}</q-item-section></q-item></q-list></q-menu></q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered class="bg-grey-1">
      <q-list>
        <q-item-label header>{{ $t('app.name') }}</q-item-label>
        <q-item clickable v-ripple :active="$route.path === '/'" @click="$router.push('/')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="dashboard" /></q-item-section><q-item-section>{{ $t('nav.dashboard') }}</q-item-section></q-item>
        <q-separator />
        <q-item clickable v-ripple :active="$route.path.includes('/management-companies')" @click="$router.push('/management-companies')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="business" /></q-item-section><q-item-section>{{ $t('nav.managementCompanies') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/complexes')" @click="$router.push('/complexes')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="apartment" /></q-item-section><q-item-section>{{ $t('nav.complexes') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/units')" @click="$router.push('/units')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="home" /></q-item-section><q-item-section>{{ $t('nav.units') }}</q-item-section></q-item>
        <q-separator />
        <q-item clickable v-ripple :active="$route.path.includes('/residents')" @click="$router.push('/residents')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="people" /></q-item-section><q-item-section>{{ $t('nav.residents') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/workers')" @click="$router.push('/workers')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="engineering" /></q-item-section><q-item-section>{{ $t('nav.workers') }}</q-item-section></q-item>
        <q-separator />
        <q-item clickable v-ripple :active="$route.path.includes('/tickets')" @click="$router.push('/tickets')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="confirmation_number" /></q-item-section><q-item-section>{{ $t('nav.tickets') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/meter-readings')" @click="$router.push('/meter-readings')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="speed" /></q-item-section><q-item-section>{{ $t('nav.meterReadings') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/billing')" @click="$router.push('/billing')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="receipt" /></q-item-section><q-item-section>{{ $t('nav.billing') }}</q-item-section></q-item>
        <q-separator />
        <q-item clickable v-ripple :active="$route.path.includes('/polls')" @click="$router.push('/polls')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="poll" /></q-item-section><q-item-section>{{ $t('nav.polls') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/access-control')" @click="$router.push('/access-control')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="vpn_key" /></q-item-section><q-item-section>{{ $t('nav.accessControl') }}</q-item-section></q-item>
        <q-item clickable v-ripple :active="$route.path.includes('/reports')" @click="$router.push('/reports')" active-class="bg-primary text-white"><q-item-section avatar><q-icon name="assessment" /></q-item-section><q-item-section>{{ $t('nav.reports') }}</q-item-section></q-item>
      </q-list>
    </q-drawer>

    <q-page-container><router-view /></q-page-container>

    <q-dialog v-model="showNotifications" position="right" maximized><q-card style="width: 400px"><q-card-section class="row items-center q-pb-none"><div class="text-h6">Notifications</div><q-space /><q-btn icon="close" flat round dense v-close-popup /></q-card-section><q-separator /><q-card-section class="q-pt-none" style="max-height: calc(100vh - 100px); overflow-y: auto;"><q-list v-if="notifications.length > 0"><q-item v-for="notification in notifications" :key="notification.id" clickable @click="markAsRead(notification.id)" :class="{'bg-blue-1': !notification.read}"><q-item-section avatar><q-icon :name="notification.icon || 'notifications'" :color="notification.read ? 'grey' : 'primary'" /></q-item-section><q-item-section><q-item-label>{{ notification.title }}</q-item-label><q-item-label caption>{{ notification.message }}</q-item-label><q-item-label caption class="text-grey">{{ formatDate(notification.createdAt) }}</q-item-label></q-item-section></q-item></q-list><div v-else class="text-center text-grey-7 q-pa-lg">No notifications</div></q-card-section><q-separator /><q-card-actions align="center"><q-btn flat label="Mark all as read" color="primary" @click="markAllAsRead" v-if="unreadCount > 0" /></q-card-actions></q-card></q-dialog>
  </q-layout>
</template>

<script>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores';
import { useNotifications } from '../composables/useNotifications';

export default {
  name: 'MainLayout',
  setup() {
    const router = useRouter();
    const { t } = useI18n();
    const authStore = useAuthStore();
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const leftDrawerOpen = ref(true);
    const showNotifications = ref(false);
    const toggleLeftDrawer = () => { leftDrawerOpen.value = !leftDrawerOpen.value; };
    const logout = async () => { await authStore.logout(); router.push('/login'); };
    const formatDate = (date) => new Date(date).toLocaleString();
    return { leftDrawerOpen, showNotifications, notifications, unreadCount, toggleLeftDrawer, logout, markAsRead, markAllAsRead, formatDate };
  }
};
</script>
