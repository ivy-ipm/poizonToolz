import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Layers, Star, CheckCircle, User, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { LevelListItem, LevelListType } from "@shared/schema";

const LIST_TYPES: { value: LevelListType; label: string }[] = [
  { value: "top_today", label: "Top Today" },
  { value: "top_week", label: "Top Week" },
  { value: "top_month", label: "Top Month" },
  { value: "new", label: "New" },
];

function LevelRow({ item, onDownload, downloading }: {
  item: LevelListItem;
  onDownload: (item: LevelListItem) => void;
  downloading: boolean;
}) {
  const grabLink = `https://grabvr.quest/levels/viewer/?level=${item.identifier}`;

  return (
    <div
      className="flex items-center gap-4 py-4 group border-b border-border last:border-0"
      data-testid={`level-row-${item.identifier}`}
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Layers className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate" data-testid={`text-title-${item.identifier}`}>
            {item.title}
          </span>
          {item.verified && (
            <Badge className="text-[10px] gap-0.5 px-1.5 py-0" data-testid={`badge-verified-${item.identifier}`}>
              <CheckCircle className="w-2.5 h-2.5" /> Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {item.creators.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span data-testid={`text-creators-${item.identifier}`}>{item.creators.join(", ")}</span>
            </div>
          )}
          {item.complexity != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="w-3 h-3" />
              <span>Complexity {item.complexity}</span>
            </div>
          )}
          {item.averageRating != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span>{item.averageRating.toFixed(1)}</span>
              {item.ratingCount && <span>({item.ratingCount})</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href={grabLink}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`link-view-${item.identifier}`}
        >
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
          data-testid={`button-download-${item.identifier}`}
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? "..." : "Download"}
        </Button>
      </div>
    </div>
  );
}

function LevelRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-8 w-24 flex-shrink-0" />
    </div>
  );
}

export default function Browse() {
  const { toast } = useToast();
  const [listType, setListType] = useState<LevelListType>("top_today");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<LevelListItem[]>({
    queryKey: ["/api/levels/list", listType],
    queryFn: async () => {
      const res = await fetch(`/api/levels/list?type=${listType}`);
      if (!res.ok) throw new Error("Failed to fetch levels");
      return res.json();
    },
  });

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
        <h1 className="text-lg font-semibold text-foreground">Browse Levels</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Browse top and new GRAB VR levels from the community.
        </p>
      </div>

      <div className="border-b border-border px-6 py-3 flex items-center gap-2 flex-wrap">
        {LIST_TYPES.map(({ value, label }) => (
          <Button
            key={value}
            variant={listType === value ? "default" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setListType(value)}
            data-testid={`tab-${value}`}
          >
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 ml-auto gap-1.5 text-muted-foreground"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-6">
        {isError && (
          <div className="text-center py-16 text-muted-foreground" data-testid="status-browse-error">
            <p className="text-sm text-destructive">Failed to load levels. Try refreshing.</p>
          </div>
        )}

        {isLoading && (
          <Card className="border-card-border bg-card">
            <CardContent className="py-0">
              {[0, 1, 2, 3, 4, 5].map((i) => <LevelRowSkeleton key={i} />)}
            </CardContent>
          </Card>
        )}

        {data && !isLoading && data.length === 0 && (
          <div className="text-center py-16 text-muted-foreground" data-testid="status-browse-empty">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No levels found.</p>
          </div>
        )}

        {data && !isLoading && data.length > 0 && (
          <Card className="border-card-border bg-card" data-testid="card-level-list">
            <CardContent className="py-0">
              {data.map((item) => (
                <LevelRow
                  key={item.identifier}
                  item={item}
                  onDownload={handleDownload}
                  downloading={downloading === item.identifier}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
