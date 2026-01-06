import { ref, computed } from 'vue';

export function usePagination(initialPage = 1, initialPerPage = 10) {
  const page = ref(initialPage);
  const perPage = ref(initialPerPage);
  const total = ref(0);

  const totalPages = computed(() => Math.ceil(total.value / perPage.value));
  const hasNextPage = computed(() => page.value < totalPages.value);
  const hasPrevPage = computed(() => page.value > 1);
  const from = computed(() => (page.value - 1) * perPage.value + 1);
  const to = computed(() => Math.min(page.value * perPage.value, total.value));

  const nextPage = () => {
    if (hasNextPage.value) page.value++;
  };

  const prevPage = () => {
    if (hasPrevPage.value) page.value--;
  };

  const goToPage = (pageNum) => {
    if (pageNum >= 1 && pageNum <= totalPages.value) {
      page.value = pageNum;
    }
  };

  const reset = () => {
    page.value = initialPage;
    perPage.value = initialPerPage;
    total.value = 0;
  };

  return {
    page,
    perPage,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
    from,
    to,
    nextPage,
    prevPage,
    goToPage,
    reset
  };
}
