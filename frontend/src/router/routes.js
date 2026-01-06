const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../pages/auth/LoginPage.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard'
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../pages/DashboardPage.vue')
      },
      
      // Management Companies
      {
        path: 'management-companies',
        name: 'managementCompanies',
        component: () => import('../pages/managementCompanies/ListPage.vue'),
        meta: { roles: ['super_admin', 'super_accountant'] }
      },
      {
        path: 'management-companies/create',
        name: 'createManagementCompany',
        component: () => import('../pages/managementCompanies/CreatePage.vue'),
        meta: { roles: ['super_admin'] }
      },
      {
        path: 'management-companies/:id',
        name: 'viewManagementCompany',
        component: () => import('../pages/managementCompanies/ViewPage.vue'),
        meta: { roles: ['super_admin', 'super_accountant'] }
      },
      {
        path: 'management-companies/:id/edit',
        name: 'editManagementCompany',
        component: () => import('../pages/managementCompanies/EditPage.vue'),
        meta: { roles: ['super_admin'] }
      },
      
      // Complexes
      {
        path: 'complexes',
        name: 'complexes',
        component: () => import('../pages/complexes/ListPage.vue')
      },
      {
        path: 'complexes/create',
        name: 'createComplex',
        component: () => import('../pages/complexes/CreatePage.vue'),
        meta: { roles: ['super_admin', 'uk_director'] }
      },
      {
        path: 'complexes/:id',
        name: 'viewComplex',
        component: () => import('../pages/complexes/ViewPage.vue')
      },
      {
        path: 'complexes/:id/edit',
        name: 'editComplex',
        component: () => import('../pages/complexes/EditPage.vue'),
        meta: { roles: ['super_admin', 'uk_director', 'complex_admin'] }
      },
      
      // Units
      {
        path: 'units',
        name: 'units',
        component: () => import('../pages/units/ListPage.vue')
      },
      
      // Residents
      {
        path: 'residents',
        name: 'residents',
        component: () => import('../pages/residents/ListPage.vue')
      },
      
      // Workers
      {
        path: 'workers',
        name: 'workers',
        component: () => import('../pages/workers/ListPage.vue')
      },
      
      // Tickets
      {
        path: 'tickets',
        name: 'tickets',
        component: () => import('../pages/tickets/ListPage.vue')
      },
      {
        path: 'tickets/:id',
        name: 'viewTicket',
        component: () => import('../pages/tickets/ViewPage.vue')
      },
      
      // Meter Readings
      {
        path: 'meter-readings',
        name: 'meterReadings',
        component: () => import('../pages/meterReadings/ListPage.vue')
      },
      
      // Billing
      {
        path: 'billing',
        name: 'billing',
        component: () => import('../pages/billing/OverviewPage.vue')
      },
      
      // Polls
      {
        path: 'polls',
        name: 'polls',
        component: () => import('../pages/polls/ListPage.vue')
      },
      
      // Access Control
      {
        path: 'access-control',
        name: 'accessControl',
        component: () => import('../pages/accessControl/OverviewPage.vue')
      },
      
      // Reports
      {
        path: 'reports',
        name: 'reports',
        component: () => import('../pages/reports/OverviewPage.vue')
      },
      
      // Settings
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../pages/settings/SettingsPage.vue')
      },
      
      // Profile
      {
        path: 'profile',
        name: 'profile',
        component: () => import('../pages/profile/ProfilePage.vue')
      }
    ]
  },
  
  // Error pages
  {
    path: '/unauthorized',
    name: 'unauthorized',
    component: () => import('../pages/errors/UnauthorizedPage.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('../pages/errors/NotFoundPage.vue')
  }
];

export default routes;
