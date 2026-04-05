import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@shared/schema";
import { FolderPlus, ArrowRight, Clock, CheckCircle, AlertTriangle, XCircle, Building2, MapPin } from "lucide-react";
import { format } from "date-fns";

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case "on_hold": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    default: return <Clock className="w-4 h-4 text-primary" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": return "Completed";
    case "on_hold": return "On Hold";
    default: return "Active";
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const isCertifier = user?.role === "certifier";

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {isCertifier ? "My Projects" : "Your Projects"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isCertifier
              ? "Manage building certificate compliance across all your projects"
              : "View and upload certificates for your assigned projects"}
          </p>
        </div>
        {isCertifier && (
          <Button asChild size="sm" data-testid="button-new-project">
            <Link href="/new">
              <FolderPlus className="w-4 h-4 mr-2" />
              New Project
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 bg-muted rounded-2xl mb-4">
            <Building2 className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="font-semibold text-foreground mb-1">No projects yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            {isCertifier
              ? "Create your first project to start checking certificates against Building Approvals."
              : "You haven't been assigned to any projects yet. Contact your certifier."}
          </p>
          {isCertifier && (
            <Button asChild>
              <Link href="/new">
                <FolderPlus className="w-4 h-4 mr-2" />
                Create first project
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <Link key={p.id} href={`/project/${p.id}`} data-testid={`card-project-${p.id}`}>
              <div className="bg-card border border-border rounded-xl p-4 cursor-pointer hover-elevate hover:border-primary/30 transition-colors group">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-foreground truncate">{p.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">{p.streetAddress}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge variant="secondary" className="text-xs font-mono">{p.paNumber}</Badge>
                  <Badge variant="outline" className="text-xs">{p.buildingClass}</Badge>
                  <Badge variant="outline" className="text-xs">{p.dwellingType}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {statusIcon(p.status || "active")}
                    <span>{statusLabel(p.status || "active")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(p.createdAt), "dd/MM/yyyy")}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
