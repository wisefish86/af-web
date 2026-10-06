import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30000,
  expect:{timeout:7000},
  retries:1,
  use:{
    baseURL:'http://127.0.0.1:4173',
    ...devices['Pixel 7'],
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
  },
  webServer:{
    command:'npm run preview -- --port 4173',
    url:'http://127.0.0.1:4173/',
    reuseExistingServer:!process.env.CI,
    timeout:30000,
  },
})
