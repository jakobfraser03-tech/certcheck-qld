import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  name: z.string().min(1, "Project name required"),
  streetAddress: z.string().min(1, "Street address required"),
  lotPlan: z.string().min(1, "Lot/Plan required"),
  lga: z.string().min(1, "LGA required"),
  buildingClass: z.string().min(1, "Building class required"),
  dwellingType: z.string().min(1, "Dwelling type required"),
  paNumber: z.string().min(1, "PA Number required").regex(/^PA\d{2}-\d{4}$/, "Format must be PAXX-XXXX"),
  baReference: z.string().optional(),
  baDate: z.string().optional(),
  clientId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewProject() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Load clients for assignment
  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/users/clients"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", streetAddress: "", lotPlan: "", lga: "",
      buildingClass: "", dwellingType: "", paNumber: "", baReference: "", baDate: "", clientId: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/projects", {
        ...data,
        clientId: data.clientId ? parseInt(data.clientId) : null,
      });
      return res.json();
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project created", description: project.name });
      setLocation(`/project/${project.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">New Project</h1>
            <p className="text-sm text-muted-foreground">Enter BA details to cross-reference certificates</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(data => mutation.mutate(data))} className="space-y-5">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 123 Main St — New Build" data-testid="input-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="streetAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 123 Main Street, Springfield QLD 4300" data-testid="input-address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="lotPlan" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot and Plan</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Lot 5 SP123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lga" render={({ field }) => (
                  <FormItem>
                    <FormLabel>LGA</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Brisbane City Council" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="buildingClass" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Building Class *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-class">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["1a","1b","2","3","4","5","6","7a","7b","8","9a","9b","9c","10a","10b","10c"].map(c => (
                          <SelectItem key={c} value={`Class ${c}`}>Class {c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dwellingType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dwelling Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-dwelling">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Single Detached">Single Detached</SelectItem>
                        <SelectItem value="Dual Occupancy">Dual Occupancy</SelectItem>
                        <SelectItem value="Townhouse">Townhouse</SelectItem>
                        <SelectItem value="Apartment">Apartment</SelectItem>
                        <SelectItem value="Commercial">Commercial</SelectItem>
                        <SelectItem value="Industrial">Industrial</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="paNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>PA Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. PA24-0001" data-testid="input-pa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="baReference" render={({ field }) => (
                  <FormItem>
                    <FormLabel>BA Reference</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. BA-2024-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="baDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>BA Issue Date</FormLabel>
                  <FormControl>
                    <Input type="date" data-testid="input-ba-date" {...field} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">Used to verify certificate dates occur after BA issue</p>
                </FormItem>
              )} />

              {clients && clients.length > 0 && (
                <FormField control={form.control} name="clientId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign Client (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client">
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No client assigned</SelectItem>
                        {clients.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.displayName} (@{c.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" data-testid="button-create" disabled={mutation.isPending} className="flex-1">
                  {mutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : "Create Project"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/">Cancel</Link>
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
