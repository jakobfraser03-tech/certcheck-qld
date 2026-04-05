import { useState, useCallback, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { useAuth } from "@/App";
import { API_BASE, getAuthToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Upload, FileCheck, AlertTriangle, XCircle, CheckCircle,
  ChevronDown, ChevronUp, Copy, Download, Send, FileText, Paperclip,
  Building2, Eye, ClipboardList, Settings, Loader2
} from "lucide-react";
import type { ComplianceResult, ExtractedCertData } from "@shared/schema";

// ── Status helpers ─────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "pass") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">Pass</Badge>;
  if (status === "fail") return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">Fail</Badge>;
  if (status === "warning") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">Warning</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  if (status === "analyzing") return <Badge variant="secondary" className="animate-pulse">Analysing...</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function statusIcon(status: string, size = "w-4 h-4") {
  if (status === "pass") return <CheckCircle className={`${size} text-emerald-500`} />;
  if (status === "fail") return <XCircle className={`${size} text-red-500`} />;
  if (status === "warning") return <AlertTriangle className={`${size} text-amber-500`} />;
  return <FileCheck className={`${size} text-muted-foreground`} />;
}

// ── Drop zone ──────────────────────────────────────────────────────────────────
function DropZone({ onFiles, accept = ".pdf", label, sublabel }: {
  onFiles: (f: FileList) => void;
  accept?: string;
  label?: string;
  sublabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      data-testid="dropzone"
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
        ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple className="hidden"
        onChange={e => e.target.files && onFiles(e.target.files)} />
      <Upload className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
      <p className="text-sm font-medium text-foreground">{label || "Drop PDF files here or click to browse"}</p>
      <p className="text-xs text-muted-foreground mt-1">{sublabel || "Form 43, Form 12, Form 15 — PDF format"}</p>
    </div>
  );
}

// ── Certificate card ───────────────────────────────────────────────────────────
function CertCard({ cert, projectId, isCertifier, onIssued }: {
  cert: any;
  projectId: number;
  isCertifier: boolean;
  onIssued?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(cert.certifierNotes || "");
  const { toast } = useToast();
  const qc = useQueryClient();

  const compliance: ComplianceResult | null = cert.complianceResult
    ? JSON.parse(cert.complianceResult) : null;
  const extracted: ExtractedCertData | null = cert.extractedData
    ? JSON.parse(cert.extractedData) : null;

  const score = compliance?.score ?? 0;
  const scoreColor = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";

  const issueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/certificates/${cert.id}/issue`, { notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Certificate issued to client" });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      onIssued?.();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/certificates/${cert.id}/notes`, { notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Notes saved" });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function downloadMarkedUp() {
    const token = getAuthToken();
    window.open(`${API_BASE}/api/certificates/${cert.id}/marked-up?token=${token}`, "_blank");
  }

  function downloadOriginal() {
    const token = getAuthToken();
    window.open(`${API_BASE}/api/certificates/${cert.id}/download?token=${token}`, "_blank");
  }

  return (
    <div data-testid={`card-cert-${cert.id}`} className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{cert.originalFilename}</span>
            {cert.formType && <Badge variant="outline" className="text-xs">{cert.formType}</Badge>}
            {cert.issuedToClient ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                <Send className="w-3 h-3 mr-1" /> Issued
              </Badge>
            ) : null}
          </div>
          {cert.aspectDescription && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cert.aspectDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusBadge(cert.status)}
        </div>
      </div>

      {/* Score bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Compliance Score</span>
          <span className="text-xs font-mono font-medium">{score}/100</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${scoreColor} transition-all`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {/* Summary */}
      {compliance?.summary && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{compliance.summary}</p>
        </div>
      )}

      {/* Suggested filename */}
      {cert.suggestedFilename && (
        <div className="mx-4 mb-3 flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2 text-xs font-mono">
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate text-foreground">{cert.suggestedFilename}</span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(cert.suggestedFilename || "");
              toast({ title: "Copied to clipboard" });
            }}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {cert.markedUpFileData === "available" && (
          <Button size="sm" variant="outline" onClick={downloadMarkedUp} data-testid={`button-download-markup-${cert.id}`}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Marked-up PDF
          </Button>
        )}
        {cert.fileData === "available" && isCertifier && (
          <Button size="sm" variant="ghost" onClick={downloadOriginal}>
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Original
          </Button>
        )}
        {isCertifier && !cert.issuedToClient && cert.status !== "analyzing" && (
          <Button
            size="sm"
            variant="outline"
            className="border-primary/50 text-primary hover:bg-primary/10"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending}
            data-testid={`button-issue-${cert.id}`}
          >
            {issueMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Issue to Client
          </Button>
        )}
        {isCertifier && (
          <Button size="sm" variant="ghost" onClick={() => setNotesOpen(n => !n)}>
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Notes
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setExpanded(e => !e)} data-testid={`button-expand-${cert.id}`}>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1.5" /> : <ChevronDown className="w-3.5 h-3.5 mr-1.5" />}
          {expanded ? "Hide Details" : "Show Analysis"}
        </Button>
      </div>

      {/* Certifier notes */}
      {notesOpen && isCertifier && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Internal Notes</p>
          <Textarea
            rows={3}
            placeholder="Add notes visible only to certifiers..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="text-sm"
          />
          <Button
            size="sm"
            className="mt-2"
            onClick={() => notesMutation.mutate()}
            disabled={notesMutation.isPending}
          >
            {notesMutation.isPending ? "Saving..." : "Save Notes"}
          </Button>
          {cert.certifierNotes && (
            <p className="text-xs text-muted-foreground mt-2 italic">{cert.certifierNotes}</p>
          )}
        </div>
      )}

      {/* Expanded analysis */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 bg-muted/20">
          {/* Extracted data */}
          {extracted && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Extracted Data</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["Certifier", extracted.certifierName],
                  ["Licence No", extracted.licenceNumber],
                  ["Licence Class", extracted.licenceClass],
                  ["Issue Date", extracted.issueDate],
                  ["Signed", extracted.isSigned != null ? (extracted.isSigned ? "Yes ✓" : "No ✗") : "Unknown"],
                  ["Dated", extracted.isDated != null ? (extracted.isDated ? "Yes ✓" : "No ✗") : "Unknown"],
                  ["BA Ref on Cert", extracted.baReferenceOnCert],
                  ["PA No. on Cert", extracted.paNumberOnCert],
                  ["Building Class", extracted.buildingClass],
                  ["Lot/Plan", extracted.lotPlan],
                ].map(([k, v]) => v ? (
                  <div key={k} className="text-xs py-0.5">
                    <span className="text-muted-foreground">{k}: </span>
                    <span className="text-foreground font-medium">{v}</span>
                  </div>
                ) : null)}
              </div>
              {extracted.referencedDocuments && extracted.referencedDocuments.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Referenced Drawings:</p>
                  <p className="text-xs font-medium text-foreground">{extracted.referencedDocuments.join(", ")}</p>
                </div>
              )}
            </div>
          )}

          {/* Compliance checks */}
          {compliance?.checks && compliance.checks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Compliance Checks</p>
              <div className="flex flex-col gap-1.5">
                {compliance.checks.map(check => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: any }) {
  const [open, setOpen] = useState(false);
  const colors = {
    pass: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/10",
    fail: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10",
    warning: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10",
    info: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/10",
  }[check.status] || "border-border bg-card";

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        {statusIcon(check.status, "w-3.5 h-3.5")}
        <span className="text-xs font-medium text-foreground flex-1">{check.description}</span>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5 capitalize">{check.status}</Badge>
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </div>
      {open && (
        <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {check.details}
          {check.reference && <span className="block mt-1 font-mono text-[10px] text-primary/80">Ref: {check.reference}</span>}
        </div>
      )}
    </div>
  );
}

// ── BA document list ───────────────────────────────────────────────────────────
function BaDocRow({ doc, projectId }: { doc: any; projectId: number }) {
  function download() {
    const token = getAuthToken();
    window.open(`${API_BASE}/api/projects/${projectId}/ba-documents/${doc.id}/download?token=${token}`, "_blank");
  }
  const typeLabel: Record<string, string> = { ba: "Building Approval", approved_plans: "Approved Plans", other: "Other" };
  return (
    <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2.5 text-sm">
      <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.originalFilename}</p>
        <p className="text-xs text-muted-foreground">{typeLabel[doc.documentType] || doc.documentType}</p>
      </div>
      <Button size="sm" variant="ghost" onClick={download}>
        <Download className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const [, params] = useRoute("/project/:id");
  const projectId = parseInt(params!.id);
  const { user } = useAuth();
  const isCertifier = user?.role === "certifier";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadingBA, setUploadingBA] = useState(false);
  const [baDocType, setBaDocType] = useState<"ba" | "approved_plans" | "other">("approved_plans");

  const { data: project, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${projectId}`);
      return res.json();
    },
  });

  async function handleCertUpload(files: FileList) {
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append("files", f));
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/certificates`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      await res.json();
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Certificate analysed", description: `${files.length} file(s) processed` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleBAUpload(files: FileList) {
    setUploadingBA(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append("files", f));
    formData.append("documentType", baDocType);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/ba-documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      await res.json();
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "BA document uploaded", description: "Text extracted for AI cross-referencing" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingBA(false);
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Project not found</p>
          <Button variant="outline" asChild className="mt-4"><Link href="/">Back to Dashboard</Link></Button>
        </div>
      </Layout>
    );
  }

  const certs = project.certificates || [];
  const baDocs = project.baDocuments || [];
  const total = certs.length;
  const passed = certs.filter((c: any) => c.status === "pass").length;
  const warned = certs.filter((c: any) => c.status === "warning").length;
  const failed = certs.filter((c: any) => c.status === "fail").length;
  const issued = certs.filter((c: any) => c.issuedToClient).length;

  return (
    <Layout>
      {/* Breadcrumb + title */}
      <div className="flex items-start gap-3 mb-5">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 mt-0.5">
          <Link href="/"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <Badge variant="secondary" className="font-mono text-xs">{project.paNumber}</Badge>
            <Badge variant="outline" className="text-xs">{project.buildingClass}</Badge>
            <span className="text-xs text-muted-foreground">{project.streetAddress}</span>
          </div>
          {project.baDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              BA Date: {new Date(project.baDate).toLocaleDateString("en-AU")}
            </p>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          { label: "Pass", value: passed, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Warning", value: warned, color: "text-amber-600 dark:text-amber-400" },
          { label: "Fail", value: failed, color: "text-red-600 dark:text-red-400" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="certificates">
        <TabsList className="mb-4">
          <TabsTrigger value="certificates" className="gap-1.5">
            <FileCheck className="w-3.5 h-3.5" />
            Certificates
            {total > 0 && <span className="ml-1 bg-muted rounded-full text-xs px-1.5">{total}</span>}
          </TabsTrigger>
          {isCertifier && (
            <TabsTrigger value="ba-docs" className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              BA Documents
              {baDocs.length > 0 && <span className="ml-1 bg-muted rounded-full text-xs px-1.5">{baDocs.length}</span>}
            </TabsTrigger>
          )}
          {isCertifier && (
            <TabsTrigger value="project-info" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Project Info
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Certificates tab ── */}
        <TabsContent value="certificates">
          {/* Upload drop zone */}
          <div className="mb-5">
            {uploading ? (
              <div className="border-2 border-dashed border-primary rounded-xl p-6 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Analysing certificate with AI...</p>
                  <p className="text-xs text-muted-foreground">This may take 15–30 seconds</p>
                </div>
              </div>
            ) : (
              <DropZone
                onFiles={handleCertUpload}
                label="Drop certificates here or click to browse"
                sublabel="Form 43, Form 12, Form 15 — PDF format"
              />
            )}
          </div>

          {/* Client notice */}
          {!isCertifier && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3 mb-4 text-sm text-blue-700 dark:text-blue-400">
              <p className="font-medium mb-0.5">Client Portal</p>
              <p className="text-xs">Upload your certificates above. You will receive the reviewed, marked-up copies once your certifier issues them.</p>
              {issued > 0 && <p className="text-xs mt-1 font-medium">{issued} certificate(s) have been issued to you — download the marked-up PDFs below.</p>}
            </div>
          )}

          {/* Certificate list */}
          {certs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No certificates uploaded yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {certs.map((cert: any) => (
                <CertCard
                  key={cert.id}
                  cert={cert}
                  projectId={projectId}
                  isCertifier={isCertifier}
                  onIssued={() => qc.invalidateQueries({ queryKey: ["/api/projects", projectId] })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── BA Documents tab (certifier only) ── */}
        {isCertifier && (
          <TabsContent value="ba-docs">
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-3">
                <p className="text-sm font-medium">Document type to upload:</p>
                <div className="flex gap-2">
                  {(["ba", "approved_plans", "other"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setBaDocType(t)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        baDocType === t
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {t === "ba" ? "Building Approval" : t === "approved_plans" ? "Approved Plans" : "Other"}
                    </button>
                  ))}
                </div>
              </div>

              {uploadingBA ? (
                <div className="border-2 border-dashed border-primary rounded-xl p-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Uploading and extracting text...</p>
                  </div>
                </div>
              ) : (
                <DropZone
                  onFiles={handleBAUpload}
                  label="Upload BA documents or approved plans"
                  sublabel="PDF format — text will be extracted for AI cross-referencing"
                />
              )}
            </div>

            {baDocs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No BA documents uploaded</p>
                <p className="text-xs">Upload the Building Approval and approved plans to enable drawing number cross-referencing during AI analysis</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {baDocs.map((doc: any) => (
                  <BaDocRow key={doc.id} doc={doc} projectId={projectId} />
                ))}
              </div>
            )}

            <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How BA cross-referencing works</p>
              <p>When certificates are uploaded, the AI will compare drawing numbers referenced on the certificate against those found in the approved plans. It also verifies that the PA/BA number, property details, and dates match.</p>
            </div>
          </TabsContent>
        )}

        {/* ── Project info tab (certifier only) ── */}
        {isCertifier && (
          <TabsContent value="project-info">
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">Project Details</h3>
              <div className="grid gap-3">
                {[
                  ["Project Name", project.name],
                  ["Street Address", project.streetAddress],
                  ["Lot and Plan", project.lotPlan],
                  ["LGA", project.lga],
                  ["Building Class", project.buildingClass],
                  ["Dwelling Type", project.dwellingType],
                  ["PA Number", project.paNumber],
                  ["BA Reference", project.baReference || "—"],
                  ["BA Date", project.baDate ? new Date(project.baDate).toLocaleDateString("en-AU") : "—"],
                  ["Status", project.status || "active"],
                  ["Created", new Date(project.createdAt).toLocaleDateString("en-AU")],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground w-32 shrink-0">{label}:</span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </Layout>
  );
}
