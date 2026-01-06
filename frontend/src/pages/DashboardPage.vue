<template>
  <q-page padding>
    <div class="q-pa-md">
      <!-- Welcome Section -->
      <div class="row items-center q-mb-lg">
        <div class="col">
          <h4 class="q-my-none text-weight-bold">
            {{ $t('dashboard.welcome', { name: userName }) }}
          </h4>
          <p class="text-grey-7 q-mb-none">
            {{ currentDate }}
          </p>
        </div>
        <div class="col-auto">
          <q-btn
            color="primary"
            icon="refresh"
            :label="$t('common.refresh')"
            @click="fetchStats"
            :loading="loading"
            no-caps
          />
        </div>
      </div>

      <!-- Statistics Cards -->
      <div class="row q-col-gutter-md q-mb-lg">
        <!-- Total Companies (Super Admin only) -->
        <div v-if="isSuperAdmin" class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-primary">{{ stats.totalCompanies || 0 }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.totalCompanies') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="business" class="stat-icon text-primary" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Total Complexes -->
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-secondary">{{ stats.totalComplexes || 0 }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.totalComplexes') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="apartment" class="stat-icon text-secondary" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Total Units -->
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-accent">{{ stats.totalUnits || 0 }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.totalUnits') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="door_front" class="stat-icon text-accent" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Active Residents -->
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-positive">{{ stats.activeResidents || 0 }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.activeResidents') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="people" class="stat-icon text-positive" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Open Tickets -->
        <div class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-warning">{{ stats.openTickets || 0 }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.openTickets') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="confirmation_number" class="stat-icon text-warning" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Monthly Revenue (not for workers) -->
        <div v-if="!isWorker" class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card class="stat-card">
            <q-card-section>
              <div class="row items-center">
                <div class="col">
                  <div class="stat-value text-info">{{ formatCurrency(stats.monthlyRevenue || 0) }}</div>
                  <div class="stat-label">{{ $t('dashboard.stats.monthlyRevenue') }}</div>
                </div>
                <div class="col-auto">
                  <q-icon name="payments" class="stat-icon text-info" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Charts and Additional Info -->
      <div class="row q-col-gutter-md">
        <!-- Recent Activity -->
        <div class="col-12 col-md-6">
          <q-card>
            <q-card-section>
              <div class="text-h6">Recent Activity</div>
            </q-card-section>
            <q-separator />
            <q-card-section>
              <q-list>
                <q-item v-if="!recentActivity.length">
                  <q-item-section>
                    <q-item-label class="text-grey-7 text-center">
                      {{ $t('common.noData') }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
                <q-item v-for="item in recentActivity" :key="item.id">
                  <q-item-section avatar>
                    <q-icon :name="item.icon" :color="item.color" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ item.title }}</q-item-label>
                    <q-item-label caption>{{ item.time }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </div>

        <!-- Quick Actions -->
        <div class="col-12 col-md-6">
          <q-card>
            <q-card-section>
              <div class="text-h6">Quick Actions</div>
            </q-card-section>
            <q-separator />
            <q-card-section>
              <div class="row q-col-gutter-sm">
                <div v-if="isSuperAdmin" class="col-6">
                  <q-btn
                    color="primary"
                    icon="add"
                    label="Add UK"
                    class="full-width"
                    outline
                    @click="$router.push('/management-companies/create')"
                    no-caps
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    color="secondary"
                    icon="add"
                    label="Add Complex"
                    class="full-width"
                    outline
                    @click="$router.push('/complexes/create')"
                    no-caps
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    color="accent"
                    icon="confirmation_number"
                    label="View Tickets"
                    class="full-width"
                    outline
                    @click="$router.push('/tickets')"
                    no-caps
                  />
                </div>
                <div class="col-6">
                  <q-btn
                    color="info"
                    icon="assessment"
                    label="Reports"
                    class="full-width"
                    outline
                    @click="$router.push('/reports')"
                    no-caps
                  />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores';
import { useQuasar } from 'quasar';

export default defineComponent({
  name: 'DashboardPage',

  setup() {
    const $q = useQuasar();
    const authStore = useAuthStore();

    const loading = ref(false);
    const stats = ref({
      totalCompanies: 0,
      totalComplexes: 0,
      totalUnits: 0,
      activeResidents: 0,
      openTickets: 0,
      monthlyRevenue: 0
    });
    const recentActivity = ref([]);

    const userName = computed(() => authStore.user?.name || authStore.user?.email?.split('@')[0] || 'User');
    const isSuperAdmin = computed(() => authStore.isSuperAdmin);
    const isWorker = computed(() => authStore.isWorker);
    
    const currentDate = computed(() => {
      const date = new Date();
      return date.toLocaleDateString('ru-RU', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    });

    const formatCurrency = (value) => {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'EUR'
      }).format(value);
    };

    const fetchStats = async () => {
      loading.value = true;
      
      try {
        // TODO: Replace with actual API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data
        stats.value = {
          totalCompanies: 12,
          totalComplexes: 45,
          totalUnits: 1250,
          activeResidents: 3420,
          openTickets: 23,
          monthlyRevenue: 125000
        };

        recentActivity.value = [
          { id: 1, icon: 'confirmation_number', color: 'primary', title: 'New ticket created', time: '2 hours ago' },
          { id: 2, icon: 'payments', color: 'positive', title: 'Payment received', time: '5 hours ago' },
          { id: 3, icon: 'apartment', color: 'secondary', title: 'New complex added', time: '1 day ago' }
        ];
      } catch (error) {
        $q.notify({
          message: 'Failed to load statistics',
          color: 'negative',
          icon: 'error'
        });
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      fetchStats();
    });

    return {
      loading,
      stats,
      recentActivity,
      userName,
      isSuperAdmin,
      isWorker,
      currentDate,
      formatCurrency,
      fetchStats
    };
  }
});
</script>
