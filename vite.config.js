import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Pasta onde os arquivos finais serão gerados (ex: 'dist')
    outDir: 'dist',
    
    // Configurações avançadas do build
    rollupOptions: {
      input: {
        // A entrada principal é seu index.html
        main: 'index.html',
      },
      output: {
        // Gera nomes de arquivos com hash para evitar problemas de cache
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
      },
    },

    // Ativa a minificação com o 'terser' para ofuscação
    minify: 'terser',
    
    // Opções do Terser para máxima ofuscação
    terserOptions: {
      compress: {
        // Remove todos os `console.log` do código final
        drop_console: true,
      },
      mangle: true, // Renomeia variáveis, funções, etc. para nomes curtos e ilegíveis
      format: {
        comments: false, // Remove todos os comentários
      },
    },
  },
});