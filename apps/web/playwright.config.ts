import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Una partida necesita dos navegadores coordinados: en paralelo se pisan en la cola.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    // Configurable para poder pasarle la misma suite a un despliegue real y no
    // sólo al servidor de desarrollo.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // Un despliegue de prueba puede estar detrás de un certificado propio.
    ignoreHTTPSErrors: true,
    /**
     * Para verificar un despliegue recién hecho, cuando el DNS todavía no
     * propagó al resolver de la máquina que corre las pruebas:
     *   E2E_RESOLVE="mi-dominio 203.0.113.10"
     */
    launchOptions: process.env.E2E_RESOLVE
      ? { args: [`--host-resolver-rules=MAP ${process.env.E2E_RESOLVE}`] }
      : {},
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
