import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Building2, ShieldCheck, Users } from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    displayName: "",
    role: "client",
  });

  function setField(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login"
        ? { username: form.username, password: form.password }
        : form;

      const res = await fetch(`${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setUser(data);
      toast({ title: mode === "login" ? "Welcome back!" : "Account created", description: `Logged in as ${data.displayName}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left panel — branding */}
      <div className="lg:w-1/2 bg-primary flex flex-col justify-center p-10 lg:p-16">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <svg viewBox="0 0 36 36" className="w-10 h-10 text-white" fill="none" aria-label="CertCheck QLD logo">
              <rect x="3" y="3" width="30" height="30" rx="4" stroke="white" strokeWidth="2"/>
              <path d="M10 18l6 6 10-12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="8" y="8" width="5" height="5" rx="1" fill="white" opacity="0.3"/>
            </svg>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">CertCheck QLD</h1>
              <p className="text-primary-foreground/70 text-sm">AI Certificate Compliance</p>
            </div>
          </div>

          <h2 className="text-white text-2xl font-bold mb-3 leading-snug">
            QLD Building Certificate Management
          </h2>
          <p className="text-primary-foreground/80 mb-8 text-sm leading-relaxed">
            Upload, analyse, and manage Form 43, Form 12, and Form 15 certificates against Building Approvals and approved drawings.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-white/15 rounded-md">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">AI Compliance Checking</p>
                <p className="text-primary-foreground/70 text-xs">Cross-reference certs against BA docs, approved plans, and signature/date validation</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-white/15 rounded-md">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">PDF Markup & Issue</p>
                <p className="text-primary-foreground/70 text-xs">Annotate certificates with compliance findings and issue marked-up PDFs to clients</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-white/15 rounded-md">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Client Portal</p>
                <p className="text-primary-foreground/70 text-xs">Clients upload certificates and receive issued marked-up copies — all through a secure portal</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-16">
        <Card className="w-full max-w-md shadow-lg border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === "login" ? "Sign in to your account" : "Create an account"}
            </CardTitle>
            <CardDescription className="text-sm">
              {mode === "login"
                ? "Enter your credentials to access your projects"
                : "Sign up as a certifier or client to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "register" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="displayName">Full Name</Label>
                  <Input
                    id="displayName"
                    data-testid="input-display-name"
                    placeholder="e.g. John Smith"
                    value={form.displayName}
                    onChange={e => setField("displayName", e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  placeholder="e.g. jsmith"
                  value={form.username}
                  onChange={e => setField("username", e.target.value)}
                  required
                />
              </div>

              {mode === "register" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    data-testid="input-email"
                    placeholder="john@example.com"
                    value={form.email}
                    onChange={e => setField("email", e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={form.password}
                    onChange={e => setField("password", e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(s => !s)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === "register" && (
                <div className="grid gap-1.5">
                  <Label>Account Type</Label>
                  <Select value={form.role} onValueChange={v => setField("role", v)}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="certifier">Certifier — manages projects &amp; issues certificates</SelectItem>
                      <SelectItem value="client">Client — uploads certs, receives issued copies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                type="submit"
                data-testid="button-submit"
                className="w-full mt-2"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {mode === "login" ? "Signing in..." : "Creating account..."}
                  </span>
                ) : (
                  mode === "login" ? "Sign in" : "Create account"
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground pt-1">
                {mode === "login" ? (
                  <>Don't have an account?{" "}
                    <button type="button" onClick={() => setMode("register")} className="text-primary font-medium hover:underline">
                      Register
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button type="button" onClick={() => setMode("login")} className="text-primary font-medium hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
