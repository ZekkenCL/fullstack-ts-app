const path = require('path');
const nextConfig = {
  reactStrictMode: true,
  images: { domains: ['example.com'] },
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
};

module.exports = nextConfig;