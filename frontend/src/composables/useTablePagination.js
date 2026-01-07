import { ref, computed } from 'vue';

export function useTablePagination(options = {}) {
  const {
    initialPage = 1,
    initialRowsPerPage = 10,
    rowsPerPageOptions = [10, 25, 50, 100]
  } = options;

  const pagination = ref({
    page: initialPage,
    rowsPerPage: initialRowsPerPage,
    rowsNumber: 0
  });

  const paginationParams = computed(() => ({
    page: pagination.value.page,
    limit: pagination.value.rowsPerPage
  }));

  const updatePagination = (newPagination) => {
    pagination.value = { ...pagination.value, ...newPagination };
  };

  const resetPagination = () => {
    pagination.value = {
      page: initialPage,
      rowsPerPage: initialRowsPerPage,
      rowsNumber: 0
    };
  };

  const onRequest = async (props, fetchFn) => {
    const { page, rowsPerPage } = props.pagination;
    
    try {
      const response = await fetchFn({
        page,
        limit: rowsPerPage
      });

      pagination.value.page = page;
      pagination.value.rowsPerPage = rowsPerPage;
      pagination.value.rowsNumber = response.total || response.data?.length || 0;

      return response.data || [];
    } catch (error) {
      throw error;
    }
  };

  return {
    pagination,
    paginationParams,
    updatePagination,
    resetPagination,
    onRequest,
    rowsPerPageOptions
  };
}
