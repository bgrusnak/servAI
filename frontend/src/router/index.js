import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { Loading } from 'quasar';

const routes = [
  { 
    path: '/login', 
    name: 'Login', 
    component: () => import('../pages/auth/LoginPage.vue'), 
    meta: { requiresAuth: false, title: 'Login' }
  },
  { 
    path: '/register', 
    name: 'Register', 
    component: () => import('../pages/auth/RegisterPage.vue'), 
    meta: { requiresAuth: false, title: 'Register' }
  },
  { 
    path: '/forgot-password', 
    name: 'ForgotPassword', 
    component: () => import('../pages/auth/ForgotPasswordPage.vue'), 
    meta: { requiresAuth: false, title: 'Forgot Password' }
  },
  { 
    path: '/reset-password/:token', 
    name: 'ResetPassword', 
    component: () => import('../pages/auth/ResetPasswordPage.vue'), 
    meta: { requiresAuth: false, title: 'Reset Password' }
  },
  { 
    path: '/', 
    component: () => import('../layouts/MainLayout.vue'), 
    meta: { requiresAuth: true }, 
    children: [
      { 
        path: '', 
        name: 'Dashboard', 
        component: () => import('../pages/DashboardPage.vue'),
        meta: { title: 'Dashboard' }
      },
      { 
        path: 'management-companies', 
        name: 'ManagementCompaniesList', 
        component: () => import('../pages/managementCompanies/ListPage.vue'),
        meta: { title: 'Management Companies', roles: ['superadmin'] }
      },
      { 
        path: 'management-companies/create', 
        name: 'ManagementCompaniesCreate', 
        component: () => import('../pages/managementCompanies/CreatePage.vue'),
        meta: { title: 'Create Company', roles: ['superadmin'] }
      },
      { 
        path: 'management-companies/:id', 
        name: 'ManagementCompaniesView', 
        component: () => import('../pages/managementCompanies/ViewPage.vue'),
        meta: { title: 'Company Details' }
      },
      { 
        path: 'management-companies/:id/edit', 
        name: 'ManagementCompaniesEdit', 
        component: () => import('../pages/managementCompanies/EditPage.vue'),
        meta: { title: 'Edit Company', roles: ['superadmin', 'uk_director'] }
      },
      { 
        path: 'complexes', 
        name: 'ComplexesList', 
        component: () => import('../pages/complexes/ListPage.vue'),
        meta: { title: 'Complexes' }
      },
      { 
        path: 'complexes/create', 
        name: 'ComplexesCreate', 
        component: () => import('../pages/complexes/CreatePage.vue'),
        meta: { title: 'Create Complex', roles: ['uk_director', 'complex_admin'] }
      },
      { 
        path: 'complexes/:id', 
        name: 'ComplexesView', 
        component: () => import('../pages/complexes/ViewPage.vue'),
        meta: { title: 'Complex Details' }
      },
      { 
        path: 'complexes/:id/edit', 
        name: 'ComplexesEdit', 
        component: () => import('../pages/complexes/EditPage.vue'),
        meta: { title: 'Edit Complex', roles: ['uk_director', 'complex_admin'] }
      },
      { 
        path: 'units', 
        name: 'UnitsList', 
        component: () => import('../pages/units/ListPage.vue'),
        meta: { title: 'Units' }
      },
      { 
        path: 'units/:id', 
        name: 'UnitsView', 
        component: () => import('../pages/units/ViewPage.vue'),
        meta: { title: 'Unit Details' }
      },
      { 
        path: 'residents', 
        name: 'ResidentsList', 
        component: () => import('../pages/residents/ListPage.vue'),
        meta: { title: 'Residents' }
      },
      { 
        path: 'residents/:id', 
        name: 'ResidentsView', 
        component: () => import('../pages/residents/ViewPage.vue'),
        meta: { title: 'Resident Profile' }
      },
      { 
        path: 'workers', 
        name: 'WorkersList', 
        component: () => import('../pages/workers/ListPage.vue'),
        meta: { title: 'Workers', roles: ['uk_director', 'complex_admin'] }
      },
      { 
        path: 'workers/:id', 
        name: 'WorkersView', 
        component: () => import('../pages/workers/ViewPage.vue'),
        meta: { title: 'Worker Profile' }
      },
      { 
        path: 'tickets', 
        name: 'TicketsList', 
        component: () => import('../pages/tickets/ListPage.vue'),
        meta: { title: 'Tickets' }
      },
      { 
        path: 'tickets/:id', 
        name: 'TicketsView', 
        component: () => import('../pages/tickets/ViewPage.vue'),
        meta: { title: 'Ticket Details' }
      },
      { 
        path: 'meter-readings', 
        name: 'MeterReadingsList', 
        component: () => import('../pages/meterReadings/ListPage.vue'),
        meta: { title: 'Meter Readings' }
      },
      { 
        path: 'billing', 
        name: 'BillingOverview', 
        component: () => import('../pages/billing/OverviewPage.vue'),
        meta: { title: 'Billing' }
      },
      { 
        path: 'billing/:id', 
        name: 'BillingView', 
        component: () => import('../pages/billing/ViewPage.vue'),
        meta: { title: 'Invoice Details' }
      },
      { 
        path: 'polls', 
        name: 'PollsList', 
        component: () => import('../pages/polls/ListPage.vue'),
        meta: { title: 'Polls' }
      },
      { 
        path: 'polls/:id', 
        name: 'PollsView', 
        component: () => import('../pages/polls/ViewPage.vue'),
        meta: { title: 'Poll Details' }
      },
      { 
        path: 'reports', 
        name: 'Reports', 
        component: () => import('../pages/reports/OverviewPage.vue'),
        meta: { title: 'Reports', roles: ['uk_director', 'complex_admin', 'accountant'] }
      },
      { 
        path: 'settings', 
        name: 'Settings', 
        component: () => import('../pages/settings/SettingsPage.vue'),
        meta: { title: 'Settings' }
      },
      { 
        path: 'profile', 
        name: 'Profile', 
        component: () => import('../pages/profile/ProfilePage.vue'),
        meta: { title: 'My Profile' }
      }
    ]
  },
  { 
    path: '/:pathMatch(.*)*', 
    name: 'NotFound', 
    component: () => import('../pages/ErrorNotFound.vue'),
    meta: { title: '404' }
  }
];

const router = createRouter({ 
  history: createWebHistory(), 
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else if (to.hash) {
      return { el: to.hash, behavior: 'smooth' };
    } else {
      return { top: 0 };
    }
  }
});

let loadingTimeout = null;

/**
 * CRITICAL: Validate route parameters for security
 */
function validateRouteParams(to) {
  // Validate reset password token
  if (to.name === 'ResetPassword' && to.params.token) {
    const token = to.params.token;
    
    // Accept UUID v4 or 64-char hex token
    const validTokenRegex = /^[a-f0-9]{64}$|^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!validTokenRegex.test(token)) {
      console.warn('[Security] Invalid reset token format:', token.substring(0, 8) + '...');
      return { path: '/login', replace: true };
    }
  }
  
  // Validate UUID parameters (id, complexId, etc)
  const uuidParams = ['id', 'complexId', 'buildingId', 'unitId', 'userId'];
  
  for (const paramName of uuidParams) {
    const paramValue = to.params[paramName];
    
    if (paramValue) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(paramValue)) {
        console.warn(`[Security] Invalid ${paramName} parameter:`, paramValue);
        return { name: 'NotFound', replace: true };
      }
    }
  }
  
  // Check for path traversal attempts in any parameter
  const allParams = { ...to.params, ...to.query };
  
  for (const [key, value] of Object.entries(allParams)) {
    if (typeof value === 'string') {
      // Block path traversal patterns
      if (value.includes('../') || value.includes('..\\') || value.includes('%2e%2e')) {
        console.error('[Security] Path traversal attempt detected:', { key, value });
        return { name: 'NotFound', replace: true };
      }
      
      // Block null bytes
      if (value.includes('\x00') || value.includes('%00')) {
        console.error('[Security] Null byte injection attempt:', { key, value });
        return { name: 'NotFound', replace: true };
      }
    }
  }
  
  return null; // Valid
}

router.beforeEach(async (to, from, next) => {
  Loading.show();
  
  // Safety timeout for Loading
  loadingTimeout = setTimeout(() => {
    Loading.hide();
  }, 10000);
  
  // CRITICAL: Validate route parameters first
  const paramValidation = validateRouteParams(to);
  if (paramValidation) {
    Loading.hide();
    clearTimeout(loadingTimeout);
    return next(paramValidation);
  }
  
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false);
  
  // Update page title
  document.title = to.meta.title ? `${to.meta.title} - ServAI` : 'ServAI';
  
  if (requiresAuth) {
    if (!authStore.isAuthenticated) {
      Loading.hide();
      clearTimeout(loadingTimeout);
      return next({ path: '/login', query: { redirect: to.fullPath } });
    }
    
    // Validate token and fetch user if needed
    if (!authStore.user) {
      try {
        await authStore.fetchUser();
      } catch (error) {
        console.error('Token validation failed:', error);
        authStore.clearAuth();
        Loading.hide();
        clearTimeout(loadingTimeout);
        return next({ path: '/login', query: { redirect: to.fullPath } });
      }
    }
    
    // Check role-based access
    if (to.meta.roles && to.meta.roles.length > 0) {
      const hasRole = to.meta.roles.some(role => authStore.hasRole(role));
      if (!hasRole) {
        console.warn('[Security] Unauthorized access attempt:', {
          user: authStore.user?.email,
          requiredRoles: to.meta.roles,
          path: to.path
        });
        Loading.hide();
        clearTimeout(loadingTimeout);
        return next({ path: '/', replace: true });
      }
    }
  }
  
  // Redirect authenticated users away from auth pages
  if (to.path === '/login' && authStore.isAuthenticated) { 
    Loading.hide();
    clearTimeout(loadingTimeout);
    return next('/'); 
  }
  
  next();
});

router.afterEach(() => {
  Loading.hide();
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
});

export default router;
