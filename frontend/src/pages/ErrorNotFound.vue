<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="text-center q-pa-xl">
          <div class="text-h1 text-weight-bold text-primary" style="font-size: 10rem;">404</div>
          <div class="text-h4 q-mb-md">Oops! Page Not Found</div>
          <div class="text-subtitle1 text-grey-7 q-mb-lg">The page you are looking for doesn't exist.</div>
          <q-btn
            label="Go Home"
            color="primary"
            icon="home"
            size="lg"
            @click="$router.push('/')"
            no-caps
            unelevated
          />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ErrorNotFound'
});
</script>
