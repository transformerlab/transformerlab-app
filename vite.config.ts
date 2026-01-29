import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          prettier: false,
          svgo: false,
          svgoConfig: {
            plugins: [{ removeViewBox: false }],
          },
          titleProp: true,
          ref: true,
        },
      }),
      visualizer({
        filename: 'release/cloud/stats.html',
        open: false,
        gzipSize: true,
      }),
    ],

    resolve: {
      alias: {
        renderer: path.resolve(__dirname, 'src/renderer'),
        main: path.resolve(__dirname, 'src/main'),
      },
    },

    root: '.',

    build: {
      outDir: 'release/cloud',
      emptyDirBeforeWrite: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              const match = id.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
              if (match) {
                const packageName = match[1].replace('@', '');
                return `vendor-${packageName}`;
              }
            }
          },
        },
      },
      target: 'es2020',
      minify: 'esbuild',
    },

    server: {
      port: 1212,
      open: true,
      cors: true,
    },

    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VERSION': JSON.stringify(env.npm_package_version || '0.0.0'),
      'process.env.MULTIUSER': JSON.stringify(env.MULTIUSER || 'false'),
      'process.env.TL_API_URL': JSON.stringify(env.TL_API_URL || ''),
      'process.env.TL_FORCE_API_URL': JSON.stringify(env.TL_FORCE_API_URL || 'false'),
      'process.env.EMAIL_AUTH_ENABLED': JSON.stringify(env.EMAIL_AUTH_ENABLED || 'true'),
      'process.env.SENTRY_DSN': JSON.stringify(env.SENTRY_DSN || ''),
      'process.env.SENTRY_ENABLE_TRACING': JSON.stringify(env.SENTRY_ENABLE_TRACING || 'false'),
    },

    css: {
      modules: {
        localsConvention: 'camelCase',
      },
    },
  };
});
