import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_API_TARGET ?? 'http://127.0.0.1:4000';
  return {
    root: '.',
    publicDir: 'public',
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(''),
      'process.env.OPENAI_API_KEY': JSON.stringify(''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
