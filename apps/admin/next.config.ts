import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default config;
