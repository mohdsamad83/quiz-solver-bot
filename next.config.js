/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['@sparticuz/chromium'],
    },
    // increase the max duration for serverless functions
    maxDuration: 120,
};

module.exports = nextConfig;
