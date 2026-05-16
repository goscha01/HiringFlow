/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // Enables ./instrumentation.ts — runs register() once per server
    // runtime init. We use it to monkey-patch console.* so every log line
    // forwards to LogHub (→ Grafana Loki). See instrumentation.ts.
    instrumentationHook: true,
  },
}

module.exports = nextConfig
