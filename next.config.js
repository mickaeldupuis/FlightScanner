/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.planespotters.net' },
      { protocol: 'https', hostname: 'www.planespotters.net' },
    ],
  },
}
module.exports = nextConfig
