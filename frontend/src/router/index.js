import { createRouter, createWebHistory } from 'vue-router';
import { LocalStorage } from 'quasar';
import routes from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Navigation guard
router.beforeEach((to, from, next) => {
  const token = LocalStorage.getItem('authToken');
  const isAuthenticated = !!token;
  
  // Check if route requires auth
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }
  
  // Redirect to dashboard if trying to access login while authenticated
  if (to.name === 'login' && isAuthenticated) {
    next({ name: 'dashboard' });
    return;
  }
  
  // Check role permissions
  if (to.meta.roles && isAuthenticated) {
    const user = LocalStorage.getItem('user');
    const userRole = user?.role;
    
    if (!to.meta.roles.includes(userRole)) {
      next({ name: 'unauthorized' });
      return;
    }
  }
  
  next();
});

export default router;
