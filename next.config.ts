import type { NextConfig } from "next";

// Where the site is served. The default puts it at https://hashtagbillionaire.com/approval/;
// an empty value serves it from the root of its own (sub)domain. README.md, "Environment".
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/approval").replace(/\/+$/, "");
if (basePath && !/^(\/[A-Za-z0-9._~-]+)+$/.test(basePath)) {
  throw new Error(`NEXT_PUBLIC_BASE_PATH must be empty or a path such as /approval, not "${basePath}".`);
}

// Without it the page can't reach the API, so say so at build time instead of on a customer's phone.
if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn("NEXT_PUBLIC_API_URL isn't set: the page will show a setup error instead of the artwork.");
}

const nextConfig: NextConfig = {
  // Plain files (out/) that Apache serves: no Node process on the server.
  output: "export",
  basePath,
  trailingSlash: true,
  // Artwork previews come from the API's server and are shown as they are; a static export has no image optimizer.
  images: { unoptimized: true },
  // No Next.js "N" badge in the corner while developing: the page should look as customers see it.
  devIndicators: false,
};

export default nextConfig;
