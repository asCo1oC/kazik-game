import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const appBuild = mode === 'appbundle'
  return {
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: appBuild
      ? {
          outDir: '../frontend/react-app',
          emptyOutDir: true,
          lib: {
            entry: './src/app-entry.tsx',
            name: 'ReactCasinoAppBundle',
            fileName: () => 'app.iife.js',
            formats: ['iife'],
          },
        }
      : undefined,
  }
})
