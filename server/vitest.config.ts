import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node', fileParallelism: false, testTimeout: 30000, hookTimeout: 30000,
    env: { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/nmamit_test', SESSION_SECRET: 'test-secret-test-secret-test-secret-123456', ALLOWED_EMAIL_DOMAINS: 'nmamit.in,nitte.edu.in', HOD_ACCESS_CODE: 'test-hod-access-code' },
  },
});
