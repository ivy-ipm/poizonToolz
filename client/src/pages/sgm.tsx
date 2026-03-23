import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Package, ExternalLink, RefreshCw, Star, CheckCircle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { LevelListItem } from "@shared/schema";

function SgmRow({ item, onDownload, downloading }: {
  item: LevelListItem;
  onDownload: (item: LevelListItem) => void;
  downloading: boolean;
}) {
  const grabLink = `https://grabvr.quest/levels/viewer/?level=${item.identifier}`;
  const date = item.creationTimestamp
    ? new Date(item.creationTimestamp).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      })
    : null;

  return (
    <div
      className="flex items-center gap-3 py-3.5 border-b border-border last:border-0 group"
      data-testid={`sgm-row-${item.identifier}`}
    >
      <div className="w-8 h-8 rounded-md bg-violet-500/15 flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-violet-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate" data-testid={`text-sgm-title-${item.identifier}`}>
            {item.title}
          </span>
          {item.verified && (
            <Badge className="text-[10px] gap-0.5 px-1.5 py-0">
              <CheckCircle className="w-2.5 h-2.5" /> Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
          {item.creators.length > 0 && <span>{item.creators.join(", ")}</span>}
          {item.complexity != null && <span>Complexity {item.complexity}</span>}
          {item.averageRating != null && (
            <div className="flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span>{item.averageRating.toFixed(1)}</span>
            </div>
          )}
          {date && <span>{date}</span>}
          <span className="font-mono text-[10px] opacity-60">{item.identifier}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <a href={grabLink} target="_blank" rel="noopener noreferrer" data-testid={`link-sgm-view-${item.identifier}`}>
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
          data-testid={`button-sgm-download-${item.identifier}`}
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? "..." : "Download"}
        </Button>
      </div>
    </div>
  );
}

function SgmRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-border last:border-0">
      <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-8 w-24 flex-shrink-0" />
    </div>
  );
}

export default function Sgm() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<LevelListItem[]>({
    queryKey: ["/api/sgm/list"],
    queryFn: async () => {
      const res = await fetch("/api/sgm/list");
      if (!res.ok) throw new Error("Failed to fetch SGM list");
      return res.json();
    },
    staleTime: 60_000,
  });

  const handleDownload = async (item: LevelListItem) => {
    const [id, ts] = item.identifier.split(":");
    setDownloading(item.identifier);
    try {
      const params = new URLSearchParams({
        id, ts,
        ...(item.dataKey ? { dataKey: item.dataKey } : {}),
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
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">SGM Inspector</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse and download Shared Game Modules from GRAB VR.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-sgm-refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-4">
        {isLoading && (
          <Card className="border-card-border bg-card">
            <CardContent className="py-0 px-5">
              {[0, 1, 2, 3].map((i) => <SgmRowSkeleton key={i} />)}
            </CardContent>
          </Card>
        )}

        {isError && (
          <div className="text-center py-16 text-muted-foreground" data-testid="status-sgm-error">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Failed to load SGM files. Try refreshing.</p>
          </div>
        )}

        {data && !isLoading && data.length === 0 && (
          <div className="text-center py-20 text-muted-foreground" data-testid="status-sgm-empty">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No SGM files found</p>
            <p className="text-xs mt-1.5 opacity-70 max-w-xs mx-auto">
              The GRAB API currently has no Shared Game Modules indexed. Check back later as more content is published.
            </p>
          </div>
        )}

        {data && data.length > 0 && (
          <Card className="border-card-border bg-card" data-testid="card-sgm-list">
            <CardHeader className="pb-0 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-foreground">
                  {data.length} SGM{data.length !== 1 ? "s" : ""} found
                </span>
              </div>
            </CardHeader>
            <Separator className="mx-5 mt-4" />
            <CardContent className="py-0 px-5">
              {data.map((item) => (
                <SgmRow
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
