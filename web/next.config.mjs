/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig = {
  // The browser only talks to the website; /api/* is forwarded to the Express API.
  // Same origin means the session cookie works without CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  output: "standalone",
};

export default nextConfig;
