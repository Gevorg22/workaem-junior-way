import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    /*
     * Не es2022: игру открывают с телефонов, а на iPhone Safari обновляется
     * вместе с системой, и на неподновлённых устройствах часть синтаксиса
     * es2022 просто не разбирается - страница остаётся пустой целиком.
     * Safari 14 - это iOS 14, то есть телефоны с 2020 года.
     */
    target: ["es2020", "safari14"],
    assetsInlineLimit: 8192,
  },
  server: {
    host: true,
    port: 5173,
  },
});
