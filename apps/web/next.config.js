/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@thesis/shared', '@thesis/contracts'],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
