import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false, testTimeout: 30000, hookTimeout: 30000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://mailpilot:mailpilot@localhost:5432/mailpilot_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
      TOKEN_ENCRYPTION_KEY: "test-encryption-key-0123456789abcdef",
      GOOGLE_CLIENT_ID: "test-google-id", GOOGLE_CLIENT_SECRET: "test-google-secret",
      SLACK_CLIENT_ID: "test-slack-id", SLACK_CLIENT_SECRET: "test-slack-secret",
      FRONTEND_URL: "http://localhost:5173", BACKEND_URL: "http://localhost:4000",
      EMAIL_ATTEMPTS: "2", EMAIL_BACKOFF_MS: "50", NODE_ENV: "test",
    },
  },
});
