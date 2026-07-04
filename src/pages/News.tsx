import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { Newspaper, Ship, MapPin } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DestinationGridSkeleton } from "@/components/loading/LoadingUI";
import { getNewsPosts, type NewsCategory, type NewsPost } from "@/lib/news";
import { useLanguage } from "@/contexts/LanguageContext";
import { withRetry } from "@/lib/retry";

type CategoryFilter = "all" | NewsCategory;

const formatPublishedDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const News = () => {
  const { tl } = useLanguage();
  useSEO({
    title: "News | Nautiplex",
    description: "Nautiplex platform updates and local Thassos news for boat renters and owners.",
    canonical: "https://nautiplex.gr/news",
    keywords: "Nautiplex news, Thassos news, boat rental updates, Thassos island events",
  });

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const loadPosts = async () => {
    try {
      setIsLoading(true);
      setLoadError("");
      const nextPosts = await withRetry(() => getNewsPosts(), { retries: 2, initialDelayMs: 220 });
      setPosts(nextPosts);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load news.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const filteredPosts = useMemo(
    () => (categoryFilter === "all" ? posts : posts.filter((post) => post.category === categoryFilter)),
    [posts, categoryFilter],
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-16">
        <section className="border-b border-border bg-gradient-ocean py-16 md:py-20">
          <div className="container mx-auto px-4">
            <p className="text-primary-foreground/80 text-sm mb-3">{tl("News", "Νέα")}</p>
            <h1 className="text-3xl md:text-5xl font-heading font-bold text-primary-foreground mb-4">
              {tl("Nautiplex updates and Thassos news", "Νέα Nautiplex και ειδήσεις Θάσου")}
            </h1>
            <p className="text-primary-foreground/70 max-w-2xl">
              {tl("Platform announcements and what's happening around the island.", "Ανακοινώσεις πλατφόρμας και τα νέα του νησιού.")}
            </p>
          </div>
        </section>

        <section className="py-10 md:py-12">
          <div className="container mx-auto px-4 space-y-6">
            <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
              <Button
                size="sm"
                variant={categoryFilter === "all" ? "default" : "ghost"}
                onClick={() => setCategoryFilter("all")}
              >
                {tl("All", "Όλα")}
              </Button>
              <Button
                size="sm"
                variant={categoryFilter === "nautiplex" ? "default" : "ghost"}
                className="gap-1.5"
                onClick={() => setCategoryFilter("nautiplex")}
              >
                <Ship className="h-4 w-4" />
                Nautiplex
              </Button>
              <Button
                size="sm"
                variant={categoryFilter === "thassos" ? "default" : "ghost"}
                className="gap-1.5"
                onClick={() => setCategoryFilter("thassos")}
              >
                <MapPin className="h-4 w-4" />
                Thassos
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isLoading ? (
                <DestinationGridSkeleton count={4} />
              ) : loadError ? (
                <Card className="md:col-span-2">
                  <CardContent className="py-10 text-center space-y-3">
                    <p className="text-lg font-semibold text-foreground">{tl("Could not load news", "Δεν φορτώθηκαν τα νέα")}</p>
                    <p className="text-sm text-muted-foreground">{loadError}</p>
                    <Button variant="outline" onClick={loadPosts}>{tl("Try again", "Δοκίμασε ξανά")}</Button>
                  </CardContent>
                </Card>
              ) : filteredPosts.length === 0 ? (
                <Card className="md:col-span-2">
                  <CardContent className="py-10 text-center space-y-2">
                    <Newspaper className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-lg font-semibold text-foreground">{tl("No news yet", "Δεν υπάρχουν νέα ακόμα")}</p>
                    <p className="text-sm text-muted-foreground">{tl("Check back soon.", "Ξαναδές σύντομα.")}</p>
                  </CardContent>
                </Card>
              ) : (
                filteredPosts.map((post) => (
                  <Card key={post.id} className="overflow-hidden shadow-card-hover">
                    <div className="aspect-[16/9] overflow-hidden">
                      <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
                    </div>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                        <Badge className="bg-gradient-accent text-accent-foreground shrink-0">
                          {post.category === "nautiplex" ? "Nautiplex" : "Thassos"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground line-clamp-3">{post.excerpt}</p>
                      {formatPublishedDate(post.publishedAt) ? (
                        <p className="text-xs text-muted-foreground">{formatPublishedDate(post.publishedAt)}</p>
                      ) : null}
                      <Button asChild variant="outline" className="w-full">
                        <Link to={`/news/${post.slug}`}>{tl("Read more", "Διάβασε περισσότερα")}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default News;
