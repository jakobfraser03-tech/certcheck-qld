import {
  type User, type InsertUser, users,
  type Project, type InsertProject, projects,
  type Certificate, type InsertCertificate, certificates,
  type BaDocument, type InsertBaDocument, baDocuments,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";

// Store database in the project directory (works on Render free tier)
const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Run migrations to create tables and add new columns
function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certifier_id INTEGER NOT NULL DEFAULT 1,
      client_id INTEGER,
      name TEXT NOT NULL,
      street_address TEXT NOT NULL,
      lot_plan TEXT NOT NULL,
      lga TEXT NOT NULL,
      building_class TEXT NOT NULL,
      dwelling_type TEXT NOT NULL,
      pa_number TEXT NOT NULL,
      ba_reference TEXT,
      ba_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL DEFAULT 1,
      original_filename TEXT NOT NULL,
      file_data TEXT,
      suggested_filename TEXT,
      form_type TEXT,
      aspect_description TEXT,
      extracted_data TEXT,
      compliance_result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      uploaded_at TEXT NOT NULL,
      marked_up_file_data TEXT,
      issued_to_client INTEGER NOT NULL DEFAULT 0,
      issued_at TEXT,
      certifier_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client',
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ba_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      document_type TEXT NOT NULL,
      file_data TEXT NOT NULL,
      extracted_text TEXT,
      uploaded_at TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL
    );
  `);

  // Add new columns to projects if they don't exist
  const projectCols = sqlite.prepare("PRAGMA table_info(projects)").all() as any[];
  const projectColNames = projectCols.map((c: any) => c.name);
  if (!projectColNames.includes("certifier_id")) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN certifier_id INTEGER NOT NULL DEFAULT 1`);
  }
  if (!projectColNames.includes("client_id")) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN client_id INTEGER`);
  }
  if (!projectColNames.includes("ba_date")) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN ba_date TEXT`);
  }
  if (!projectColNames.includes("status")) {
    sqlite.exec(`ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  }

  // Add new columns to certificates if they don't exist
  const certCols = sqlite.prepare("PRAGMA table_info(certificates)").all() as any[];
  const certColNames = certCols.map((c: any) => c.name);
  if (!certColNames.includes("uploaded_by")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN uploaded_by INTEGER NOT NULL DEFAULT 1`);
  }
  if (!certColNames.includes("file_data")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN file_data TEXT`);
  }
  if (!certColNames.includes("marked_up_file_data")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN marked_up_file_data TEXT`);
  }
  if (!certColNames.includes("issued_to_client")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN issued_to_client INTEGER NOT NULL DEFAULT 0`);
  }
  if (!certColNames.includes("issued_at")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN issued_at TEXT`);
  }
  if (!certColNames.includes("certifier_notes")) {
    sqlite.exec(`ALTER TABLE certificates ADD COLUMN certifier_notes TEXT`);
  }
}

migrate();

export interface IStorage {
  // Users
  createUser(user: InsertUser): User;
  getUserById(id: number): User | undefined;
  getUserByUsername(username: string): User | undefined;
  getUserByEmail(email: string): User | undefined;
  // Projects
  createProject(project: InsertProject): Project;
  getProject(id: number): Project | undefined;
  getProjectsByCertifier(certifierId: number): Project[];
  getProjectsByClient(clientId: number): Project[];
  getAllProjects(): Project[];
  updateProject(id: number, data: Partial<Project>): Project | undefined;
  // BA Documents
  createBaDocument(doc: InsertBaDocument): BaDocument;
  getBaDocumentsByProject(projectId: number): BaDocument[];
  // Certificates
  createCertificate(cert: InsertCertificate): Certificate;
  getCertificate(id: number): Certificate | undefined;
  getCertificatesByProject(projectId: number): Certificate[];
  updateCertificate(id: number, data: Partial<Certificate>): Certificate | undefined;
}

export class DatabaseStorage implements IStorage {
  // ─── Users ──────────────────────────────────────────────────────────────────
  createUser(user: InsertUser): User {
    return db.insert(users).values(user).returning().get();
  }

  getUserById(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByUsername(username: string): User | undefined {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  // ─── Projects ───────────────────────────────────────────────────────────────
  createProject(project: InsertProject): Project {
    return db.insert(projects).values(project).returning().get();
  }

  getProject(id: number): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }

  getProjectsByCertifier(certifierId: number): Project[] {
    return db.select().from(projects).where(eq(projects.certifierId, certifierId)).orderBy(desc(projects.id)).all();
  }

  getProjectsByClient(clientId: number): Project[] {
    return db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.id)).all();
  }

  getAllProjects(): Project[] {
    return db.select().from(projects).orderBy(desc(projects.id)).all();
  }

  updateProject(id: number, data: Partial<Project>): Project | undefined {
    const existing = this.getProject(id);
    if (!existing) return undefined;
    db.update(projects).set(data).where(eq(projects.id, id)).run();
    return this.getProject(id);
  }

  // ─── BA Documents ───────────────────────────────────────────────────────────
  createBaDocument(doc: InsertBaDocument): BaDocument {
    return db.insert(baDocuments).values(doc).returning().get();
  }

  getBaDocumentsByProject(projectId: number): BaDocument[] {
    return db.select().from(baDocuments).where(eq(baDocuments.projectId, projectId)).all();
  }

  // ─── Certificates ───────────────────────────────────────────────────────────
  createCertificate(cert: InsertCertificate): Certificate {
    return db.insert(certificates).values(cert).returning().get();
  }

  getCertificate(id: number): Certificate | undefined {
    return db.select().from(certificates).where(eq(certificates.id, id)).get();
  }

  getCertificatesByProject(projectId: number): Certificate[] {
    return db.select().from(certificates).where(eq(certificates.projectId, projectId)).orderBy(desc(certificates.id)).all();
  }

  updateCertificate(id: number, data: Partial<Certificate>): Certificate | undefined {
    const existing = this.getCertificate(id);
    if (!existing) return undefined;
    db.update(certificates).set(data).where(eq(certificates.id, id)).run();
    return this.getCertificate(id);
  }
}

export const storage = new DatabaseStorage();
