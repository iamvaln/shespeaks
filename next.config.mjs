/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // old public URL of the form (links already shared or emailed)
    return [{ source: '/diagnostic', destination: '/interet', permanent: true }];
  },
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};
export default nextConfig;
