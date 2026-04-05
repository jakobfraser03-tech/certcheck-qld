import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("client"), // "certifier" | "client"
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  certifierId: integer("certifier_id").notNull(), // who owns/manages this project
  clientId: integer("client_id"), // assigned client (optional)
  name: text("name").notNull(),
  streetAddress: text("street_address").notNull(),
  lotPlan: text("lot_plan").notNull(),
  lga: text("lga").notNull(),
  buildingClass: text("building_class").notNull(),
  dwellingType: text("dwelling_type").notNull(),
  paNumber: text("pa_number").notNull(),
  baReference: text("ba_reference"),
  baDate: text("ba_date"), // date of the building approval (ISO string)
  status: text("status").notNull().default("active"), // "active" | "completed" | "on_hold"
  createdAt: text("created_at").notNull(),
});

// ─── BA Documents (Building Approval + Approved Plans) ────────────────────────
export const baDocuments = sqliteTable("ba_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  originalFilename: text("original_filename").notNull(),
  documentType: text("document_type").notNull(), // "ba" | "approved_plans" | "other"
  fileData: text("file_data").notNull(), // base64 encoded
  extractedText: text("extracted_text"), // text extracted from PDF
  uploadedAt: text("uploaded_at").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
});

// ─── Certificates ─────────────────────────────────────────────────────────────
export const certificates = sqliteTable("certificates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileData: text("file_data"), // base64 encoded original PDF
  suggestedFilename: text("suggested_filename"),
  formType: text("form_type"),
  aspectDescription: text("aspect_description"),
  extractedData: text("extracted_data"), // JSON
  complianceResult: text("compliance_result"), // JSON
  status: text("status").notNull().default("pending"),
  uploadedAt: text("uploaded_at").notNull(),
  // Markup & issue tracking
  markedUpFileData: text("marked_up_file_data"), // base64 encoded marked-up PDF
  issuedToClient: integer("issued_to_client").notNull().default(0), // boolean
  issuedAt: text("issued_at"),
  certifierNotes: text("certifier_notes"),
});

// ─── Insert schemas ───────────────────────────────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertCertificateSchema = createInsertSchema(certificates).omit({ id: true });
export const insertBaDocumentSchema = createInsertSchema(baDocuments).omit({ id: true });

// ─── Types ────────────────────────────────────────────────────────────────────
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertCertificate = z.infer<typeof insertCertificateSchema>;
export type Certificate = typeof certificates.$inferSelect;
export type InsertBaDocument = z.infer<typeof insertBaDocumentSchema>;
export type BaDocument = typeof baDocuments.$inferSelect;

// ─── AI Analysis Types ────────────────────────────────────────────────────────
export interface ExtractedCertData {
  formType: string | null;
  aspectDescription: string;
  propertyAddress: string | null;
  lotPlan: string | null;
  buildingClass: string | null;
  certifierName: string | null;
  licenceNumber: string | null;
  licenceClass: string | null;
  issueDate: string | null;
  referencedStandards: string[];
  referencedDocuments: string[]; // drawing numbers referenced on cert
  basisOfCertification: string | null;
  baReferenceOnCert: string | null;
  paNumberOnCert: string | null;
  scopeOfWork: string | null;
  isSigned: boolean | null;
  isDated: boolean | null;
}

export interface ComplianceCheck {
  id: string;
  description: string;
  status: "pass" | "fail" | "warning" | "info";
  details: string;
  reference?: string;
}

export interface ComplianceResult {
  overallStatus: "pass" | "fail" | "warning";
  score: number;
  checks: ComplianceCheck[];
  suggestedFilename: string;
  summary: string;
}

// Auth types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: string;
  displayName: string;
}
