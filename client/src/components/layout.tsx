import { Link, useLocation } from "wouter";
import { useTheme, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, LayoutDashboard, FolderPlus, LogOut, User, ChevronDown, Building2 } from "lucide-react";
import { queryClient, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { dark, toggle } = useTheme();
  const { user, setUser } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();

  async function handleLogout() {
    const token = getAuthToken();
    await fetch(`/api/auth/logout`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    queryClient.clear();
    setUser(null);
    toast({ title: "Signed out" });
  }

  const isCertifier = user?.role === "certifier";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <svg viewBox="0 0 36 36" className="w-8 h-8 text-primary" fill="none" aria-label="CertCheck QLD">
              <rect x="3" y="3" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M10 18l6 6 10-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="0.25"/>
            </svg>
            <div className="hidden sm:block">
              <span className="font-bold text-sm text-foreground leading-tight block">CertCheck QLD</span>
              <span className="text-[10px] text-muted-foreground leading-tight block">AI Certificate Checker</span>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1 ml-2">
            <Button
              variant={location === "/" ? "secondary" : "ghost"}
              size="sm"
              asChild
              data-testid="nav-dashboard"
            >
              <Link href="/">
                <LayoutDashboard className="w-4 h-4 mr-1.5" />
                Dashboard
              </Link>
            </Button>
            {isCertifier && (
              <Button
                variant={location === "/new" ? "secondary" : "ghost"}
                size="sm"
                asChild
                data-testid="nav-new"
              >
                <Link href="/new">
                  <FolderPlus className="w-4 h-4 mr-1.5" />
                  New Project
                </Link>
              </Button>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Role badge */}
            <span className={`hidden sm:flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
              isCertifier ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <Building2 className="w-3 h-3" />
              {isCertifier ? "Certifier" : "Client"}
            </span>

            {/* Dark mode */}
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle" className="h-8 w-8">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="user-menu">
                  <User className="w-4 h-4" />
                  <span className="hidden sm:block max-w-[100px] truncate">{user?.displayName}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium truncate">{user?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
