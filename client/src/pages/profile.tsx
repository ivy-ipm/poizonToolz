import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, Layers, Star, CheckCircle, User, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { LevelListItem } from "@shared/schema";

function LevelCard({ item, onDownload, downloading }: {
  item: LevelListItem;
  onDownload: (item: LevelListItem) => void;
  downloading: boolean;
}) {
  const grabLink = `https://grabvr.quest/levels/viewer/?level=${item.identifier}`;
  const date = item.creationTimestamp
    ? new Date(item.creationTimestamp).toLocaleDateString()
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3.5 border-b border-border last:border-0 group"
      data-testid={`profile-level-${item.identifier}`}
    >
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Layers className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate" data-testid={`text-profile-title-${item.identifier}`}>
            {item.title}
          </span>
          {item.verified && (
            <Badge className="text-[10px] gap-0.5 px-1.5 py-0">
              <CheckCircle className="w-2.5 h-2.5" /> Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {item.complexity != null && (
            <span className="text-xs text-muted-foreground">Complexity {item.complexity}</span>
          )}
          {item.averageRating != null && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span>{item.averageRating.toFixed(1)}</span>
              {item.ratingCount && <span>({item.ratingCount})</span>}
            </div>
          )}
          {date && <span className="text-xs text-muted-foreground">{date}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <a href={grabLink} target="_blank" rel="noopener noreferrer" data-testid={`link-profile-view-${item.identifier}`}>
          <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </a>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8"
          disabled={downloading}
          onClick={() => onDownload(item)}
          data-testid={`button-profile-download-${item.identifier}`}
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? "..." : "Download"}
        </Button>
      </div>
    </div>
  );
}

function LevelCardSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-24 flex-shrink-0" />
    </div>
  );
}

export default function Profile() {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<LevelListItem[]>({
    queryKey: ["/api/levels/user", username],
    queryFn: async () => {
      const res = await fetch(`/api/levels/user?username=${encodeURIComponent(username!)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to fetch player levels");
      }
      return res.json();
    },
    enabled: !!username,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setUsername(trimmed);
  };

  const handleDownload = async (item: LevelListItem) => {
    const [id, ts] = item.identifier.split(":");
    setDownloading(item.identifier);
    try {
      const params = new URLSearchParams({ id, ts, ...(item.dataKey ? { dataKey: item.dataKey } : {}) });
      const res = await fetch(`/api/level-download?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.title || id}_${ts}.level`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download started!", description: `${item.title}.level` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      toast({ title: "Download failed", description: message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Player Lookup</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Find and download all levels uploaded by a GRAB VR player.
        </p>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter GRAB VR username..."
            className="flex-1"
            data-testid="input-username"
          />
          <Button type="submit" disabled={isLoading} className="flex-shrink-0 gap-2" data-testid="button-search-player">
            <Search className="w-4 h-4" />
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </form>

        {!username && (
          <div className="text-center py-16 text-muted-foreground" data-testid="status-profile-empty">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm">Enter a username to see their levels.</p>
          </div>
        )}

        {isError && (
          <div
            className="flex items-center gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            data-testid="status-profile-error"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{(error as Error)?.message || "Player not found."}</span>
          </div>
        )}

        {isLoading && (
          <Card className="border-card-border bg-card">
            <CardContent className="py-0">
              {[0, 1, 2, 3].map((i) => <LevelCardSkeleton key={i} />)}
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <Card className="border-card-border bg-card" data-testid="card-profile-levels">
            <CardHeader className="pb-0 pt-4 px-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground" data-testid="text-profile-username">{username}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.length === 0 ? "No public levels" : `${data.length} level${data.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
            </CardHeader>
            <Separator className="mx-5 mt-4" />
            <CardContent className="py-0 px-5">
              {data.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground" data-testid="status-no-levels">
                  This player has no public levels.
                </div>
              ) : (
                data.map((item) => (
                  <LevelCard
                    key={item.identifier}
                    item={item}
                    onDownload={handleDownload}
                    downloading={downloading === item.identifier}
                  />
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
