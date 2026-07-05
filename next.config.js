/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Phaser is a browser-only lib loaded via a client-only dynamic import
    // (ssr: false). Externalize it from the server bundle so Next doesn't try to
    // statically analyze its UMD build and emit the bogus
    // "'phaser' does not contain a default export" warning.
    if (isServer) {
      const ext = config.externals;
      config.externals = [
        ...(Array.isArray(ext) ? ext : ext ? [ext] : []),
        { phaser: "commonjs phaser" },
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
