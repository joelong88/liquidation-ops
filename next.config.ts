import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Substrait deploys this app as a container (cicd/Dockerfile.backend) — standalone
  // output trims the build to just what's needed to run `node server.js`, no full
  // node_modules copy required.
  output: "standalone",
};

export default nextConfig;
