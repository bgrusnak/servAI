<template>
  <q-page padding>
    <div class="q-pa-md">
      <h5 class="q-my-none q-mb-md">{{ $t('dashboard.title') }}</h5>
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-sm-6 col-md-3"><q-card class="stat-card"><q-card-section><q-icon name="business" size="36px" color="primary" class="q-mb-sm" /><div class="stat-value">{{ stats.totalCompanies }}</div><div class="stat-label">{{ $t('dashboard.stats.totalCompanies') }}</div></q-card-section></q-card></div>
        <div class="col-12 col-sm-6 col-md-3"><q-card class="stat-card"><q-card-section><q-icon name="apartment" size="36px" color="secondary" class="q-mb-sm" /><div class="stat-value">{{ stats.totalComplexes }}</div><div class="stat-label">{{ $t('dashboard.stats.totalComplexes') }}</div></q-card-section></q-card></div>
        <div class="col-12 col-sm-6 col-md-3"><q-card class="stat-card"><q-card-section><q-icon name="home" size="36px" color="info" class="q-mb-sm" /><div class="stat-value">{{ stats.totalUnits }}</div><div class="stat-label">{{ $t('dashboard.stats.totalUnits') }}</div></q-card-section></q-card></div>
        <div class="col-12 col-sm-6 col-md-3"><q-card class="stat-card"><q-card-section><q-icon name="people" size="36px" color="positive" class="q-mb-sm" /><div class="stat-value">{{ stats.activeResidents }}</div><div class="stat-label">{{ $t('dashboard.stats.activeResidents') }}</div></q-card-section></q-card></div>
      </div>
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-md-6"><q-card><q-card-section><div class="text-h6 q-mb-md">Open Tickets</div><q-linear-progress :value="stats.openTickets / 100" color="warning" size="20px" class="q-mb-sm" /><div class="text-h4 text-warning">{{ stats.openTickets }}</div></q-card-section></q-card></div>
        <div class="col-12 col-md-6"><q-card><q-card-section><div class="text-h6 q-mb-md">Monthly Revenue</div><div class="text-h4 text-positive">€ {{ stats.monthlyRevenue.toLocaleString() }}</div></q-card-section></q-card></div>
      </div>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-8"><q-card><q-card-section><div class="text-h6 q-mb-md">Recent Activity</div><q-timeline color="primary"><q-timeline-entry v-for="activity in recentActivity" :key="activity.id" :title="activity.title" :subtitle="formatDate(activity.timestamp)" :icon="activity.icon"><div>{{ activity.description }}</div></q-timeline-entry></q-timeline></q-card-section></q-card></div>
        <div class="col-12 col-md-4"><q-card><q-card-section><div class="text-h6 q-mb-md">Quick Actions</div><q-list><q-item clickable v-ripple @click="$router.push('/tickets')"><q-item-section avatar><q-icon name="add" color="primary" /></q-item-section><q-item-section>Create Ticket</q-item-section></q-item><q-item clickable v-ripple @click="$router.push('/meter-readings')"><q-item-section avatar><q-icon name="add" color="secondary" /></q-item-section><q-item-section>Submit Reading</q-item-section></q-item><q-item clickable v-ripple @click="$router.push('/billing')"><q-item-section avatar><q-icon name="receipt" color="info" /></q-item-section><q-item-section>Generate Invoice</q-item-section></q-item><q-item clickable v-ripple @click="$router.push('/reports')"><q-item-section avatar><q-icon name="assessment" color="warning" /></q-item-section><q-item-section>View Reports</q-item-section></q-item></q-list></q-card-section></q-card></div>
      </div>
    </div>
  </q-page>
</template>
<script>
import { defineComponent, ref, onMounted } from 'vue'; import { dashboardAPI } from '../api';
export default defineComponent({ name: 'DashboardPage', setup() { const stats = ref({ totalCompanies: 0, totalComplexes: 0, totalUnits: 0, activeResidents: 0, openTickets: 0, monthlyRevenue: 0 }); const recentActivity = ref([]); const fetchStats = async () => { try { const response = await dashboardAPI.getStats(); stats.value = response.data; } catch (error) { console.error('Failed', error); } }; const fetchActivity = async () => { try { const response = await dashboardAPI.getRecentActivity(); recentActivity.value = response.data.slice(0, 10); } catch (error) { console.error('Failed', error); } }; const formatDate = (date) => new Date(date).toLocaleString(); onMounted(() => { fetchStats(); fetchActivity(); }); return { stats, recentActivity, formatDate }; } });
</script>
<style lang="scss" scoped>
.stat-card { .stat-value { font-size: 2.5rem; font-weight: 700; line-height: 1; margin-bottom: 8px; } .stat-label { font-size: 0.875rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; } }
</style>
