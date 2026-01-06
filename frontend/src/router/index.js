import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../pages/auth/LoginPage.vue'), meta: { requiresAuth: false } },
  { path: '/', component: () => import('../layouts/MainLayout.vue'), meta: { requiresAuth: true }, children: [
    { path: '', name: 'Dashboard', component: () => import('../pages/DashboardPage.vue') },
    { path: 'management-companies', name: 'ManagementCompaniesList', component: () => import('../pages/managementCompanies/ListPage.vue') },
    { path: 'management-companies/create', name: 'ManagementCompaniesCreate', component: () => import('../pages/managementCompanies/CreatePage.vue') },
    { path: 'management-companies/:id', name: 'ManagementCompaniesView', component: () => import('../pages/managementCompanies/ViewPage.vue') },
    { path: 'management-companies/:id/edit', name: 'ManagementCompaniesEdit', component: () => import('../pages/managementCompanies/EditPage.vue') },
    { path: 'complexes', name: 'ComplexesList', component: () => import('../pages/complexes/ListPage.vue') },
    { path: 'complexes/create', name: 'ComplexesCreate', component: () => import('../pages/complexes/CreatePage.vue') },
    { path: 'complexes/:id', name: 'ComplexesView', component: () => import('../pages/complexes/ViewPage.vue') },
    { path: 'complexes/:id/edit', name: 'ComplexesEdit', component: () => import('../pages/complexes/EditPage.vue') },
    { path: 'units', name: 'UnitsList', component: () => import('../pages/units/ListPage.vue') },
    { path: 'units/:id', name: 'UnitsView', component: () => import('../pages/units/ViewPage.vue') },
    { path: 'residents', name: 'ResidentsList', component: () => import('../pages/residents/ListPage.vue') },
    { path: 'residents/:id', name: 'ResidentsView', component: () => import('../pages/residents/ViewPage.vue') },
    { path: 'workers', name: 'WorkersList', component: () => import('../pages/workers/ListPage.vue') },
    { path: 'workers/:id', name: 'WorkersView', component: () => import('../pages/workers/ViewPage.vue') },
    { path: 'tickets', name: 'TicketsList', component: () => import('../pages/tickets/ListPage.vue') },
    { path: 'tickets/:id', name: 'TicketsView', component: () => import('../pages/tickets/ViewPage.vue') },
    { path: 'meter-readings', name: 'MeterReadingsList', component: () => import('../pages/meterReadings/ListPage.vue') },
    { path: 'billing', name: 'BillingOverview', component: () => import('../pages/billing/OverviewPage.vue') },
    { path: 'billing/:id', name: 'BillingView', component: () => import('../pages/billing/ViewPage.vue') },
    { path: 'polls', name: 'PollsList', component: () => import('../pages/polls/ListPage.vue') },
    { path: 'polls/:id', name: 'PollsView', component: () => import('../pages/polls/ViewPage.vue') },
    { path: 'access-control', name: 'AccessControl', component: () => import('../pages/accessControl/OverviewPage.vue') },
    { path: 'reports', name: 'Reports', component: () => import('../pages/reports/OverviewPage.vue') },
    { path: 'settings', name: 'Settings', component: () => import('../pages/settings/SettingsPage.vue') },
    { path: 'profile', name: 'Profile', component: () => import('../pages/profile/ProfilePage.vue') }
  ]}
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false);
  if (requiresAuth && !authStore.isAuthenticated) { next('/login'); } else if (to.path === '/login' && authStore.isAuthenticated) { next('/'); } else { next(); }
});

export default router;
