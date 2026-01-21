/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@escape/shared', '@escape/contracts'],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
