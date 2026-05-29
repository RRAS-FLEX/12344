import { useEffect } from "react";

interface SEOOptions {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  keywords?: string;
  noIndex?: boolean;
  locale?: string;
  twitterCard?: "summary" | "summary_large_image";
  hashtags?: string[];
}

const BASE_TITLE = "Nautiplex";
const DEFAULT_OG_IMAGE = "https://nautiplex.gr/og-image.png";

const setMeta = (name: string, content: string, isProperty = false) => {
  const attr = isProperty ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const setCanonical = (href: string) => {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export const useSEO = ({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  keywords,
  noIndex = false,
  locale = "en_US",
  twitterCard = "summary_large_image",
  hashtags,
}: SEOOptions) => {
  useEffect(() => {
    const fullTitle = title.includes(BASE_TITLE) ? title : `${title} | ${BASE_TITLE}`;
    document.title = fullTitle;

    setMeta("description", description);
    setMeta("robots", noIndex ? "noindex, nofollow" : "index, follow, max-snippet:-1, max-image-preview:large");

    if (keywords) setMeta("keywords", keywords);

    // Locale / site identifiers
    if (locale) {
      setMeta("og:locale", locale, true);
    }
    setMeta("og:site_name", BASE_TITLE, true);

    const hashtagString = Array.isArray(hashtags)
      ? hashtags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`))
          .join(" ")
      : "";

    const ogDescription = hashtagString ? `${description} ${hashtagString}` : description;

    // Open Graph (used by many social platforms when sharing links)
    setMeta("og:title", fullTitle, true);
    setMeta("og:description", ogDescription, true);
    setMeta("og:type", ogType, true);
    setMeta("og:image", ogImage, true);

    // Twitter
    setMeta("twitter:card", twitterCard);
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", hashtagString ? `${description} ${hashtagString}` : description);
    setMeta("twitter:image", ogImage);

    if (canonical) setCanonical(canonical);

    return () => {
      // Reset to home defaults on unmount
      document.title = "Nautiplex — Boat Rentals & Sea Experiences in Greece";
    };
  }, [title, description, canonical, ogImage, ogType, keywords, noIndex, locale, twitterCard, hashtags]);
};

