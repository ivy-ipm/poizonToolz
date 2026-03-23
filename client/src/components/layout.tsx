import { Link, useLocation } from "wouter";
import { Download, LayoutGrid, User, Sun, Moon, Menu, X, Zap, Palette, Package, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Downloader", icon: Download, description: "Download .level files" },
  { href: "/browse", label: "Browse", icon: LayoutGrid, description: "Top & new levels" },
  { href: "/profile", label: "Player Lookup", icon: User, description: "Search by username" },
  { href: "/pixel-art", label: "Pixel Art", icon: Palette, description: "Image to .level converter" },
  { href: "/editor", label: "Level Editor", icon: PenTool, description: "Build & open levels" },
  { href: "/sgm", label: "SGM Inspector", icon: Package, description: "Shared Game Modules" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="w-8 h-8"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
        <Zap className="w-4 h-4 text-primary-foreground" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-bold text-sm text-foreground tracking-tight">poizonTools</span>
        <span className="text-[10px] text-primary font-semibold tracking-widest uppercase">GRAB VR</span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
        <div className="p-4 border-b border-sidebar-border">
          <Brand />
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1" data-testid="nav-sidebar">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
                data-testid={`nav-link-${label.toLowerCase().replace(" ", "-")}`}
              >
                <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Unofficial tool</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/90 backdrop-blur-md flex items-center justify-between px-4">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            size="icon"
            variant="ghost"
            className="w-8 h-8"
            onClick={() => setMobileOpen((o) => !o)}
            data-testid="button-mobile-menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 pt-14">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <nav className="relative bg-sidebar border-r border-sidebar-border w-56 h-full p-3 flex flex-col gap-1 shadow-xl">
            {navItems.map(({ href, label, icon: Icon, description }) => {
              const active = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                  onClick={() => setMobileOpen(false)}
                  data-testid={`mobile-nav-${label.toLowerCase().replace(" ", "-")}`}
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <div>{label}</div>
                    <div className="text-xs text-muted-foreground font-normal">{description}</div>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
