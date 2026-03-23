import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Download, Search, Star, CheckCircle, AlertCircle, User, Layers, Trophy, Moon, Sun, ExternalLink, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { levelLinkSchema, type LevelLink, type LevelInfo } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface HistoryEntry {
  id: string;
  ts: string;
  title: string;
  creators: string[];
  dataKey: string | null;
  fetchedAt: Date;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function StarRating({ rating, count }: { rating?: number | null; count?: number | null }) {
  if (!rating) return null;
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${i <= filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {rating.toFixed(1)} {count ? `(${count})` : ""}
      </span>
    </div>
  );
}

function LevelCard({ level, onDownload, isDownloading }: {
  level: LevelInfo;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  return (
    <Card className="border-card-border bg-card" data-testid="card-level-info">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {level.verified && (
                <Badge className="text-xs gap-1" data-testid="badge-verified">
                  <CheckCircle className="w-3 h-3" /> Verified
                </Badge>
              )}
            </div>
            <h2
              className="text-xl font-semibold text-card-foreground leading-tight"
              data-testid="text-level-title"
            >
              {level.title}
            </h2>
            {level.creators.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground" data-testid="text-level-creators">
                  {level.creators.join(", ")}
                </span>
              </div>
            )}
          </div>
          <Button
            onClick={onDownload}
            disabled={!level.downloadUrl || isDownloading}
            className="flex-shrink-0 gap-2"
            data-testid="button-download-level"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? "Downloading..." : "Download"}
          </Button>
        </div>
      </CardHeader>
      <Separator className="mx-6" />
      <CardContent className="pt-4">
        {level.description && (
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed" data-testid="text-level-description">
            {level.description}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {level.averageRating != null && (
            <div className="flex flex-col gap-1" data-testid="stat-rating">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Rating</span>
              <StarRating rating={level.averageRating} count={level.ratingCount} />
            </div>
          )}
          {level.complexity != null && (
            <div className="flex flex-col gap-1" data-testid="stat-complexity">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Complexity</span>
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-medium text-card-foreground">{level.complexity}</span>
              </div>
            </div>
          )}
          {level.maxCheckpoint != null && (
            <div className="flex flex-col gap-1" data-testid="stat-checkpoints">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Checkpoints</span>
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-medium text-card-foreground">{level.maxCheckpoint}</span>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1" data-testid="stat-id">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Level ID</span>
            <span className="text-xs font-mono text-muted-foreground truncate">{level.id}</span>
          </div>
        </div>

        {!level.downloadUrl && (
          <div className="mt-4 flex items-center gap-2 text-sm text-destructive" data-testid="status-no-download">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>No downloadable file found for this level.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LevelCardSkeleton() {
  return (
    <Card className="border-card-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-9 w-28 flex-shrink-0" />
        </div>
      </CardHeader>
      <Separator className="mx-6" />
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryItem({
  entry,
  onRestore,
  onRemove,
}: {
  entry: HistoryEntry;
  onRestore: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 py-3 group"
      data-testid={`history-item-${entry.id}`}
    >
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Layers className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {entry.creators.length > 0 ? entry.creators.join(", ") : "Unknown creator"}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRestore(entry)}
          data-testid={`button-restore-${entry.id}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
          onClick={() => onRemove(entry.id)}
          data-testid={`button-remove-history-${entry.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-16 text-right">
          {entry.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const form = useForm<LevelLink>({
    resolver: zodResolver(levelLinkSchema),
    defaultValues: { link: "" },
  });

  const fetchMutation = useMutation({
    mutationFn: async (data: LevelLink) => {
      const res = await fetch(`/api/level-info?link=${encodeURIComponent(data.link)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to fetch level info");
      }
      return res.json() as Promise<LevelInfo>;
    },
    onSuccess: (data) => {
      setLevelInfo(data);
      setHistory((prev) => {
        const exists = prev.find((h) => h.id === data.id && h.ts === data.ts);
        if (exists) return prev;
        return [
          {
            id: data.id,
            ts: data.ts,
            title: data.title,
            creators: data.creators,
            dataKey: data.dataKey,
            fetchedAt: new Date(),
          },
          ...prev.slice(0, 9),
        ];
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not fetch level",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleDownload = async () => {
    if (!levelInfo) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({
        id: levelInfo.id,
        ts: levelInfo.ts,
        ...(levelInfo.dataKey ? { dataKey: levelInfo.dataKey } : {}),
      });
      const res = await fetch(`/api/level-download?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${levelInfo.title || levelInfo.id}_${levelInfo.ts}.level`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download started!", description: `${levelInfo.title}.level` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      toast({ title: "Download failed", description: message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRestoreHistory = (entry: HistoryEntry) => {
    setLevelInfo({
      id: entry.id,
      ts: entry.ts,
      title: entry.title,
      creators: entry.creators,
      dataKey: entry.dataKey,
      downloadUrl: entry.dataKey ? `placeholder` : null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRemoveHistory = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const onSubmit = (data: LevelLink) => {
    setLevelInfo(null);
    fetchMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">
              GRAB Level Downloader
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 flex flex-col gap-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Download GRAB Levels
          </h1>
          <p className="text-muted-foreground text-base">
            Paste any grabvr.quest level link to fetch info and download the{" "}
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">.level</code> file.
          </p>
        </div>

        {/* Input form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="link"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        {...field}
                        placeholder="https://grabvr.quest/levels/viewer/?level=id:timestamp"
                        className="font-mono text-sm bg-card border-input"
                        data-testid="input-level-link"
                      />
                      <Button
                        type="submit"
                        disabled={fetchMutation.isPending}
                        className="flex-shrink-0 gap-2"
                        data-testid="button-fetch-level"
                      >
                        <Search className="w-4 h-4" />
                        {fetchMutation.isPending ? "Fetching..." : "Fetch"}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Example:{" "}
              <button
                type="button"
                className="font-mono text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  form.setValue(
                    "link",
                    "https://grabvr.quest/levels/viewer/?level=2bxbvcht0nsillans5exy:1771389229"
                  );
                }}
                data-testid="button-example-link"
              >
                grabvr.quest/levels/viewer/?level=2bxbvcht0nsillans5exy:1771389229
              </button>
            </p>
          </form>
        </Form>

        {/* Result */}
        {fetchMutation.isPending && <LevelCardSkeleton />}

        {levelInfo && !fetchMutation.isPending && (
          <LevelCard
            level={levelInfo}
            onDownload={handleDownload}
            isDownloading={isDownloading}
          />
        )}

        {fetchMutation.isError && !fetchMutation.isPending && (
          <div
            className="flex items-center gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            data-testid="status-fetch-error"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{fetchMutation.error?.message || "Something went wrong."}</span>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Recent ({history.length})
              </h2>
            </div>
            <Card className="border-card-border bg-card" data-testid="card-history">
              <CardContent className="py-0 divide-y divide-border">
                {history.map((entry) => (
                  <HistoryItem
                    key={`${entry.id}-${entry.ts}`}
                    entry={entry}
                    onRestore={handleRestoreHistory}
                    onRemove={handleRemoveHistory}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state when no level loaded yet */}
        {!levelInfo && !fetchMutation.isPending && !fetchMutation.isError && (
          <div className="text-center py-12 text-muted-foreground" data-testid="status-empty">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm">Paste a GRAB level link above to get started.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-5">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Uses the{" "}
            <a
              href="https://api.slin.dev/grab/v1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              data-testid="link-api-docs"
            >
              slin.dev GRAB API
            </a>{" "}
            — unofficial.
          </p>
          <p className="text-xs text-muted-foreground">Not affiliated with GRAB VR.</p>
        </div>
      </footer>
    </div>
  );
}
