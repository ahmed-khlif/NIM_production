import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "NIM Production", short_name: "NIM", description: "Suivi de production et traçabilité industrielle", start_url: "/dashboard", display: "standalone", background_color: "#f8fafc", theme_color: "#9f1d2f", lang: "fr", icons: [{ src: "/assets/brand/nim-logo.png", sizes: "1595x783", type: "image/png", purpose: "any" }, { src: "/assets/illustrations/login-security.png", sizes: "1254x1254", type: "image/png", purpose: "maskable" }] };
}
