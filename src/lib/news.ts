import { supabase } from "@/lib/supabase";
import { resolveStorageImage } from "@/lib/storage-public";

const placeholderNewsImage = "/placeholder.svg";

export type NewsCategory = "nautiplex" | "thassos";

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: NewsCategory;
  coverImage: string;
  authorName: string;
  publishedAt: string | null;
}

const NEWS_CACHE_KEY = "nautiplex:news-cache:v1";
const NEWS_CACHE_TTL_MS = 10 * 60 * 1000;
const NEWS_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

const isBrowser = typeof window !== "undefined";

type NewsCachePayload = {
  updatedAt: number;
  posts: NewsPost[];
};

let newsInMemory: NewsCachePayload | null = null;
let newsInFlight: Promise<NewsPost[]> | null = null;

const isFresh = (updatedAt: number, ttlMs: number) => Date.now() - updatedAt <= ttlMs;

const readCachedNews = (): NewsCachePayload | null => {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as NewsCachePayload).posts)) {
      return parsed as NewsCachePayload;
    }
    return null;
  } catch {
    return null;
  }
};

const writeCachedNews = (postsToCache: NewsPost[]) => {
  if (!isBrowser) return;
  try {
    const payload: NewsCachePayload = { updatedAt: Date.now(), posts: postsToCache };
    window.localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
    newsInMemory = payload;
  } catch {
    // Ignore cache write failures.
  }
};

const mapNewsRow = (row: {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: NewsCategory;
  cover_image: string | null;
  author_name: string | null;
  published_at: string | null;
}): NewsPost => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  content: row.content,
  category: row.category,
  coverImage: resolveStorageImage(row.cover_image, "news-images", placeholderNewsImage),
  authorName: row.author_name ?? "",
  publishedAt: row.published_at,
});

export const getNewsPosts = async (category?: NewsCategory): Promise<NewsPost[]> => {
  if (newsInMemory && isFresh(newsInMemory.updatedAt, NEWS_CACHE_TTL_MS)) {
    return category ? newsInMemory.posts.filter((post) => post.category === category) : newsInMemory.posts;
  }

  const cached = readCachedNews();
  if (cached && isFresh(cached.updatedAt, NEWS_CACHE_TTL_MS) && cached.posts.length > 0) {
    newsInMemory = cached;
    return category ? cached.posts.filter((post) => post.category === category) : cached.posts;
  }

  if (!newsInFlight) {
    newsInFlight = (async () => {
      try {
        const { data, error } = await supabase
          .from("news_posts")
          .select("id, slug, title, excerpt, content, category, cover_image, author_name, published_at")
          .eq("status", "published")
          .order("published_at", { ascending: false });

        if (error || !Array.isArray(data)) {
          throw new Error(error?.message || "No news posts returned");
        }

        const posts = data.map(mapNewsRow);
        writeCachedNews(posts);
        return posts;
      } catch {
        if (cached && cached.posts.length > 0 && isFresh(cached.updatedAt, NEWS_CACHE_MAX_STALE_MS)) {
          newsInMemory = cached;
          return cached.posts;
        }
        if (newsInMemory?.posts?.length) {
          return newsInMemory.posts;
        }
        return [];
      } finally {
        newsInFlight = null;
      }
    })();
  }

  const posts = await newsInFlight;
  return category ? posts.filter((post) => post.category === category) : posts;
};

export const getNewsPostBySlug = async (slug: string): Promise<NewsPost | null> => {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) return null;

  const { data, error } = await supabase
    .from("news_posts")
    .select("id, slug, title, excerpt, content, category, cover_image, author_name, published_at")
    .eq("slug", trimmedSlug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapNewsRow(data);
};
