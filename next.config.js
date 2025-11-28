/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure this is set for your API routes (Vercel Serverless Function)
  // This helps ensure the function doesn't time out during heavy scraping/LLM calls.
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  },

  // This is the critical fix for the build failure
  webpack: (config, { isServer }) => {
    // We only apply this to the server-side build (API Routes)
    if (isServer) {
      // Mark these modules as 'external' so Next.js doesn't try to bundle them.
      // They are needed for the Node.js runtime, but cause errors in the bundle process.
      config.externals.push(
        'playwright-core',
        '@sparticuz/chromium',
        'chromium-bidi', // Fix for Module not found: Can't resolve 'chromium-bidi/...'
        'electron',      // Fix for Module not found: Can't resolve 'electron'
      );
    }
    
    // Return the modified configuration
    return config;
  },
};

module.exports = nextConfig;
