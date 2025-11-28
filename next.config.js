/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['@sparticuz/chromium'],
    },
    webpack: (config, { isServer }) => {
        if (isServer) {
            // Make Playwright dependencies external
            config.externals.push('playwright-core', 'chromium-bidi', 'electron');
        }
        return config;
    },
};

module.exports = nextConfig;
