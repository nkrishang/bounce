/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@thesis/shared', '@thesis/contracts'],
};

module.exports = nextConfig;
