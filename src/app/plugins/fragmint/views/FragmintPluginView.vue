<script setup lang="ts">
import FragmintUnityHost from '@/app/plugins/fragmint/views/FragmintUnityHost.vue'
</script>

<template>
  <div class="flex h-screen w-screen flex-col gap-3 p-4">
    <div class="flex items-center gap-2">
      <img
        src="/brand/fragmint-fragment-logo-small.png"
        alt="Fragmint"
        class="h-5 w-5 rounded-sm object-cover"
      />
      <div class="text-xs text-surface/80">Fragmint plugin runtime</div>
    </div>
    <div class="text-[11px] text-surface/65">
      query keys: manifest_url, canvas_id, remote_name, server_url, auth_email, auth_token, graph_path
    </div>
    <FragmintUnityHost />
  </div>
</template>
