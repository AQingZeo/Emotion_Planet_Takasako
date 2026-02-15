import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: '.',
    publicDir: 'public',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY ?? ''),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
