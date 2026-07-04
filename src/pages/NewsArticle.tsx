import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { NewsArticleSkeleton } from "@/components/loading/LoadingUI";
import { Badge } from "@/components/ui/badge";
import { getNewsPostBySlug, type NewsPost } from "@/lib/news";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";

const formatPublishedDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const NewsArticle = () => {
  const { tl } = useLanguage();
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<NewsPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadPost = async () => {
      if (!slug) {
        if (!cancelled) {
          setPost(null);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setPost(null);
        setIsLoading(true);
      }

      try {
        const foundPost = await withRetry(() => getNewsPostBySlug(slug), { retries: 2, initialDelayMs: 220 });
        if (!cancelled) {
          setPost(foundPost);
          setLoadError("");
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setPost(null);
          setLoadError(error instanceof Error ? error.message : "Unable to load this article.");
          setIsLoading(false);
        }
      }
    };

    loadPost();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useSEO({
    title: post ? `${post.title} | Nautiplex News` : "News | Nautiplex",
    description: post?.excerpt ?? "Nautiplex platform updates and local Thassos news.",
    canonical: post ? `https://nautiplex.gr/news/${post.slug}` : "https://nautiplex.gr/news",
  });

  if (isLoading) {
    return <NewsArticleSkeleton />;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center space-y-4">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Could not load article", "Δεν ήταν δυνατή η φόρτωση άρθρου")}</h1>
            <p className="text-muted-foreground">{loadError}</p>
            <Link to="/news" className="text-aegean hover:text-turquoise font-medium">{tl("Back to news →", "Επιστροφή στα νέα →")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-20">
          <div className="container mx-auto px-4 text-center space-y-4">
            <h1 className="text-3xl font-heading font-bold text-foreground">{tl("Article not found", "Το άρθρο δεν βρέθηκε")}</h1>
            <p className="text-muted-foreground">{tl("This article may have been removed or the link is incorrect.", "Αυτό το άρθρο μπορεί να έχει αφαιρεθεί ή ο σύνδεσμος να είναι λανθασμένος.")}</p>
            <Link to="/news" className="text-aegean hover:text-turquoise font-medium">{tl("Back to news →", "Επιστροφή στα νέα →")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const paragraphs = post.content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16 pb-20">
        <section className="py-8 md:py-10 border-b border-border">
          <div className="container mx-auto px-4 max-w-3xl space-y-3">
            <Link to="/news" className="text-sm text-aegean hover:text-turquoise font-medium">
              {tl("← Back to news", "← Επιστροφή στα νέα")}
            </Link>
            <div className="flex items-center gap-3">
              <Badge className="bg-gradient-accent text-accent-foreground">
                {post.category === "nautiplex" ? "Nautiplex" : "Thassos"}
              </Badge>
              {formatPublishedDate(post.publishedAt) ? (
                <span className="text-sm text-muted-foreground">{formatPublishedDate(post.publishedAt)}</span>
              ) : null}
              {post.authorName ? (
                <span className="text-sm text-muted-foreground">· {post.authorName}</span>
              ) : null}
            </div>
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground">{post.title}</h1>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 max-w-3xl space-y-6">
            <div className="aspect-[16/9] overflow-hidden rounded-2xl">
              <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
            </div>
            <div className="space-y-4">
              {paragraphs.map((paragraph, index) => (
                <p key={`news-paragraph-${index}`} className="text-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default NewsArticle;
