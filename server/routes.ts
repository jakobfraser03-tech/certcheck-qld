import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PDFParse } from "pdf-parse";
import type { SessionUser } from "@shared/schema";

const JWT_SECRET = "certcheck-qld-jwt-secret-2024";

// Extend Request to carry decoded user
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
function getTokenUser(req: Request): SessionUser | null {
  // Support both Authorization header and ?token= query param (for window.open downloads)
  const auth = req.headers.authorization;
  const queryToken = req.query?.token as string | undefined;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : queryToken;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getTokenUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  req.user = user;
  next();
}

function requireCertifier(req: Request, res: Response, next: NextFunction) {
  const user = getTokenUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (user.role !== "certifier") return res.status(403).json({ error: "Certifier access required" });
  req.user = user;
  next();
}

// ─── PDF text extraction ──────────────────────────────────────────────────────
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const result = await parser.getText();
  await parser.destroy();
  return result.text || "";
}

// ─── PDF markup using pdf-lib ────────────────────────────────────────────────
// Strip non-WinAnsi (non-Latin-1) characters from text
function safeText(s: string, maxLen = 999): string {
  return (s || "")
    .replace(/[\u0100-\uFFFF]/g, "")  // remove non-Latin characters
    .replace(/[\x00-\x1F\x7F]/g, "")  // remove control characters
    .substring(0, maxLen);
}

async function createMarkedUpPdf(
  originalBuffer: Buffer,
  complianceResult: any,
  extractedData: any,
  projectData: any,
): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts, degrees } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.load(originalBuffer);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // ── Overall status stamp on first page ──────────────────────────────────────
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  const status = complianceResult?.overallStatus || "warning";
  const score = complianceResult?.score ?? 0;

  // Diagonal watermark stamp
  const stampText = status === "pass" ? "REVIEWED - COMPLIANT" :
    status === "fail" ? "REVIEWED - NON-COMPLIANT" : "REVIEWED - WARNINGS";
  const stampColor = status === "pass" ? rgb(0.06, 0.60, 0.27) :
    status === "fail" ? rgb(0.85, 0.12, 0.12) : rgb(0.87, 0.55, 0.0);

  firstPage.drawText(stampText, {
    x: width * 0.1,
    y: height * 0.35,
    size: 32,
    font: helveticaBold,
    color: stampColor,
    opacity: 0.25,
    rotate: degrees(35),
  });

  // ── Summary box in top-right corner ─────────────────────────────────────────
  const boxW = 200;
  const boxH = 130;
  const boxX = width - boxW - 20;
  const boxY = height - boxH - 20;

  firstPage.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: status === "pass" ? rgb(0.90, 0.98, 0.92) :
      status === "fail" ? rgb(0.99, 0.92, 0.92) : rgb(1.0, 0.97, 0.88),
    borderColor: stampColor,
    borderWidth: 1.5,
    opacity: 0.92,
  });

  firstPage.drawText("CERTCHECK QLD REVIEW", {
    x: boxX + 8,
    y: boxY + boxH - 16,
    size: 7.5,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.3),
  });

  firstPage.drawText(`Status: ${stampText}`, {
    x: boxX + 8,
    y: boxY + boxH - 30,
    size: 7.5,
    font: helveticaBold,
    color: stampColor,
  });

  firstPage.drawText(`Score: ${score}/100`, {
    x: boxX + 8,
    y: boxY + boxH - 44,
    size: 7.5,
    font: helvetica,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Compliance check summary
  const checks = complianceResult?.checks || [];
  const passed = checks.filter((c: any) => c.status === "pass").length;
  const failed = checks.filter((c: any) => c.status === "fail").length;
  const warned = checks.filter((c: any) => c.status === "warning").length;

  firstPage.drawText(`Checks: ${passed} pass, ${failed} fail, ${warned} warn`, {
    x: boxX + 8,
    y: boxY + boxH - 58,
    size: 7.5,
    font: helvetica,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Key findings (up to 4)
  const failedChecks = checks.filter((c: any) => c.status === "fail" || c.status === "warning").slice(0, 4);
  let yOffset = boxY + boxH - 74;
  for (const check of failedChecks) {
    const prefix = check.status === "fail" ? "FAIL: " : "WARN: ";
    const line = safeText(prefix + (check.description || ""), 35);
    firstPage.drawText(line, {
      x: boxX + 8,
      y: yOffset,
      size: 6.5,
      font: check.status === "fail" ? helveticaBold : helvetica,
      color: check.status === "fail" ? rgb(0.75, 0.1, 0.1) : rgb(0.65, 0.45, 0.0),
    });
    yOffset -= 13;
  }

  const reviewDate = new Date().toLocaleDateString("en-AU");
  firstPage.drawText(`Reviewed: ${reviewDate} | Project: ${projectData.paNumber}`, {
    x: boxX + 8,
    y: boxY + 6,
    size: 6,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  // ── Add compliance checks page at the end ─────────────────────────────────
  const checkPage = pdfDoc.addPage([595, 842]); // A4
  const cpW = 595;
  const cpH = 842;

  // Header
  checkPage.drawRectangle({
    x: 0, y: cpH - 70,
    width: cpW, height: 70,
    color: status === "pass" ? rgb(0.06, 0.45, 0.25) :
      status === "fail" ? rgb(0.72, 0.10, 0.10) : rgb(0.75, 0.45, 0.0),
  });

  checkPage.drawText("CERTCHECK QLD — COMPLIANCE REVIEW", {
    x: 30, y: cpH - 28,
    size: 14,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  checkPage.drawText(safeText(`Project: ${projectData.name}  |  PA: ${projectData.paNumber}  |  ${reviewDate}`, 100), {
    x: 30, y: cpH - 50,
    size: 9,
    font: helvetica,
    color: rgb(0.9, 0.9, 0.9),
  });

  // Extracted data section
  let y = cpH - 95;
  checkPage.drawText("EXTRACTED CERTIFICATE DATA", {
    x: 30, y,
    size: 9,
    font: helveticaBold,
    color: rgb(0.25, 0.35, 0.55),
  });
  y -= 16;

  const dataFields = [
    ["Form Type", safeText(extractedData?.formType || "Not detected")],
    ["Certifier / Signatory", safeText(extractedData?.certifierName || "Not found")],
    ["Licence Number", safeText(extractedData?.licenceNumber || "Not found")],
    ["Issue Date", safeText(extractedData?.issueDate || "Not found")],
    ["Signed", extractedData?.isSigned ? "Yes" : "No"],
    ["Dated", extractedData?.isDated ? "Yes" : "No"],
    ["BA Ref on Cert", safeText(extractedData?.baReferenceOnCert || "Not found")],
    ["PA Number on Cert", safeText(extractedData?.paNumberOnCert || "Not found")],
    ["Referenced Drawings", safeText((extractedData?.referencedDocuments || []).join(", ") || "None listed")],
    ["Building Class", safeText(extractedData?.buildingClass || "Not found")],
  ];

  for (const [label, value] of dataFields) {
    if (y < 60) break;
    checkPage.drawText(`${label}:`, {
      x: 30, y,
      size: 8,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    const valStr = String(value).substring(0, 90);
    checkPage.drawText(valStr, {
      x: 175, y,
      size: 8,
      font: helvetica,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 14;
  }

  y -= 10;
  checkPage.drawLine({
    start: { x: 30, y }, end: { x: cpW - 30, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 16;

  // Compliance checks
  checkPage.drawText("COMPLIANCE CHECKS", {
    x: 30, y,
    size: 9,
    font: helveticaBold,
    color: rgb(0.25, 0.35, 0.55),
  });
  y -= 18;

  for (const rawCheck of checks) {
    // Sanitize AI-generated text (strip non-WinAnsi chars)
    const check = {
      ...rawCheck,
      description: safeText(rawCheck.description || ""),
      details: safeText(rawCheck.details || ""),
      reference: safeText(rawCheck.reference || ""),
    };
    if (y < 60) break;

    const statusColor = check.status === "pass" ? rgb(0.06, 0.55, 0.25) :
      check.status === "fail" ? rgb(0.80, 0.10, 0.10) :
        check.status === "warning" ? rgb(0.70, 0.42, 0.0) : rgb(0.4, 0.4, 0.8);

    const indicator = check.status === "pass" ? "[PASS]" :
      check.status === "fail" ? "[FAIL]" :
        check.status === "warning" ? "[WARN]" : "[INFO]";

    // Background row
    const rowH = check.details.length > 60 ? 36 : 24;
    checkPage.drawRectangle({
      x: 25, y: y - rowH + 6,
      width: cpW - 50, height: rowH,
      color: check.status === "fail" ? rgb(0.99, 0.96, 0.96) :
        check.status === "warning" ? rgb(1.0, 0.98, 0.93) :
          check.status === "pass" ? rgb(0.95, 0.99, 0.96) : rgb(0.96, 0.97, 1.0),
      opacity: 0.7,
    });

    checkPage.drawText(indicator, {
      x: 30, y: y - 2,
      size: 7.5,
      font: helveticaBold,
      color: statusColor,
    });

    checkPage.drawText(check.description, {
      x: 75, y: y - 2,
      size: 8,
      font: helveticaBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    if (check.reference) {
      checkPage.drawText(check.reference, {
        x: cpW - 170, y: y - 2,
        size: 6.5,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Details (truncated if long)
    const detailsStr = check.details.substring(0, 100);
    checkPage.drawText(detailsStr, {
      x: 75, y: y - 13,
      size: 7,
      font: helvetica,
      color: rgb(0.35, 0.35, 0.35),
    });

    y -= rowH + 4;
  }

  // Footer
  checkPage.drawLine({
    start: { x: 30, y: 30 }, end: { x: cpW - 30, y: 30 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  });
  checkPage.drawText("This review was generated by CertCheck QLD. It does not replace professional building certification advice.", {
    x: 30, y: 16,
    size: 6.5,
    font: helvetica,
    color: rgb(0.55, 0.55, 0.55),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── AI analysis ─────────────────────────────────────────────────────────────
async function analyzeWithAI(
  certText: string,
  projectData: any,
  baTexts: { type: string; text: string; filename: string }[],
): Promise<any> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const baContext = baTexts.length > 0
    ? `\n\nBA/APPROVED DOCUMENTS CONTEXT:\n` + baTexts.map(b =>
      `[${b.type.toUpperCase()}: ${b.filename}]\n${b.text.substring(0, 3000)}`
    ).join("\n\n---\n\n")
    : "\n\nNo BA or approved plan documents have been uploaded for this project.";

  const systemPrompt = `You are an expert Queensland (Australia) building certification AI. You analyze building certificates (Form 43, Form 12, Form 15) under the Building Regulation 2021 and Building Act 1975.

KEY FORM TYPES:
- Form 43 (Aspect Certificate - QBCC Licensee): Used by QBCC licensees for single detached class 1a and class 10. Must include scope, property, building class, aspect description, basis of certification, reference docs, BA reference, QBCC licensee details (name, licence class/number, signature, date).
- Form 12 (Aspect Inspection Certificate - Competent Person): For all classes. Must include aspect, property, building class, aspect description, basis, reference docs, BA reference, competent person details.
- Form 15 (Compliance Certificate - Design/Spec): For design/specification compliance. Must include property, aspect, basis, reference docs, certifier reference, competent person details.

CRITICAL CHECKS (beyond basic field validation):
1. SIGNATURE: Certificate MUST be physically signed. Look for signature indicators in the text.
2. DATE: Certificate MUST be dated. Date MUST be on or after the BA date (if provided).
3. DRAWING REFERENCES: Certificate MUST reference the approved drawing numbers from the BA/approved plans. Cross-check any drawing numbers on the cert against those in the BA documents.
4. PA/BA NUMBER MATCH: The PA/BA approval number on the cert must exactly match the project PA number.
5. APPROVED PLANS CROSS-REFERENCE: If approved plans are provided, verify the cert references specific drawing numbers from those plans.
6. PROPERTY DETAILS MATCH: Address, lot/plan, LGA must match the project.

Respond ONLY in valid JSON format.`;

  const userPrompt = `Analyze this building certificate and check compliance against the project details and BA documents.

PROJECT DETAILS:
- Name: ${projectData.name}
- Street Address: ${projectData.streetAddress}
- Lot and Plan: ${projectData.lotPlan}
- LGA: ${projectData.lga}
- Building Class: ${projectData.buildingClass}
- Dwelling Type: ${projectData.dwellingType}
- PA Number: ${projectData.paNumber}
- BA Reference: ${projectData.baReference || "Not provided"}
- BA Date: ${projectData.baDate || "Not provided"}
${baContext}

CERTIFICATE TEXT TO ANALYZE:
${certText.substring(0, 10000)}

Respond with this exact JSON structure:
{
  "extractedData": {
    "formType": "Form 43" | "Form 12" | "Form 15" | null,
    "aspectDescription": "string",
    "propertyAddress": "string or null",
    "lotPlan": "string or null",
    "buildingClass": "string or null",
    "certifierName": "string or null",
    "licenceNumber": "string or null",
    "licenceClass": "string or null",
    "issueDate": "date string or null",
    "referencedStandards": ["AS/NZS references"],
    "referencedDocuments": ["drawing numbers/document refs found on cert"],
    "basisOfCertification": "string or null",
    "baReferenceOnCert": "BA/DA reference found on cert or null",
    "paNumberOnCert": "PA number found on cert or null",
    "scopeOfWork": "string or null",
    "isSigned": true | false | null,
    "isDated": true | false | null
  },
  "complianceResult": {
    "overallStatus": "pass" | "fail" | "warning",
    "score": 0-100,
    "suggestedFilename": "Form XX - Aspect Description",
    "summary": "2-3 sentence summary",
    "checks": [
      {
        "id": "unique-id",
        "description": "Check name",
        "status": "pass" | "fail" | "warning" | "info",
        "details": "Explanation",
        "reference": "Regulation/standard reference"
      }
    ]
  }
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response did not contain valid JSON");
  return JSON.parse(jsonMatch[0]);
}

// ─── Route registration ───────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, role, displayName } = req.body;
      if (!username || !email || !password || !displayName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const existingUsername = storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ error: "Username already taken" });

      const existingEmail = storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ error: "Email already registered" });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = storage.createUser({
        username,
        email,
        passwordHash,
        role: role === "certifier" ? "certifier" : "client",
        displayName,
        createdAt: new Date().toISOString(),
      });

      const sessionUser: SessionUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      };
      const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: "7d" });
      res.json({ ...sessionUser, token });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = storage.getUserByUsername(username);
      if (!user) return res.status(401).json({ error: "Invalid username or password" });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: "Invalid username or password" });

      const sessionUser: SessionUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      };
      const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: "7d" });
      res.json({ ...sessionUser, token });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getTokenUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json(user);
  });

  // ── Projects ──────────────────────────────────────────────────────────────
  app.post("/api/projects", requireAuth, (req, res) => {
    try {
      const user = req.user!;
      const project = storage.createProject({
        ...req.body,
        certifierId: user.role === "certifier" ? user.id : req.body.certifierId || user.id,
        clientId: req.body.clientId || null,
        createdAt: new Date().toISOString(),
        status: "active",
      });
      res.json(project);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/projects", requireAuth, (req, res) => {
    const user = req.user!;
    if (user.role === "certifier") {
      res.json(storage.getProjectsByCertifier(user.id));
    } else {
      res.json(storage.getProjectsByClient(user.id));
    }
  });

  app.get("/api/projects/:id", requireAuth, (req, res) => {
    const user = req.user!;
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Access control
    if (user.role === "certifier" && project.certifierId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (user.role === "client" && project.clientId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const certs = storage.getCertificatesByProject(project.id);
    const baDocs = storage.getBaDocumentsByProject(project.id);

    // Strip file data from ba docs for list view (too large)
    const baDocsSafe = baDocs.map(d => ({ ...d, fileData: d.fileData ? "available" : null }));

    // For clients, only show issued certificates
    const visibleCerts = user.role === "client"
      ? certs.filter(c => c.issuedToClient)
      : certs;

    // Strip raw file data from certs in list (too large for list)
    const certsSafe = visibleCerts.map(c => ({
      ...c,
      fileData: c.fileData ? "available" : null,
      markedUpFileData: c.markedUpFileData ? "available" : null,
    }));

    res.json({ ...project, certificates: certsSafe, baDocuments: baDocsSafe });
  });

  app.patch("/api/projects/:id", requireCertifier, (req, res) => {
    const user = req.user!;
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });

    const updated = storage.updateProject(project.id, req.body);
    res.json(updated);
  });

  // ── Users (for certifier to look up clients) ───────────────────────────────
  app.get("/api/users/clients", requireCertifier, (req, res) => {
    // Return safe user info - no password hashes
    try {
      const { db } = require("./storage");
      const { users: usersTable } = require("@shared/schema");
      const { eq } = require("drizzle-orm");
      const allUsers = db.select({
        id: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
        displayName: usersTable.displayName,
        role: usersTable.role,
      }).from(usersTable).where(eq(usersTable.role, "client")).all();
      res.json(allUsers);
    } catch (e: any) {
      res.json([]);
    }
  });

  // ── BA Documents ──────────────────────────────────────────────────────────
  app.post("/api/projects/:id/ba-documents", requireCertifier, upload.array("files", 10), async (req, res) => {
    const user = req.user!;
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "No files" });

    const results = [];
    for (const file of files) {
      let extractedText = "";
      try {
        if (file.mimetype === "application/pdf") {
          extractedText = await extractPdfText(file.buffer);
        }
      } catch (e) {
        // ignore extraction errors
      }

      const docType = (req.body.documentType as string) || "approved_plans";
      const doc = storage.createBaDocument({
        projectId: project.id,
        originalFilename: file.originalname,
        documentType: docType,
        fileData: file.buffer.toString("base64"),
        extractedText: extractedText || null,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
      });
      results.push({ ...doc, fileData: "available" });
    }

    res.json(results);
  });

  app.get("/api/projects/:id/ba-documents/:docId/download", requireAuth, (req, res) => {
    const user = req.user!;
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (user.role === "certifier" && project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });
    if (user.role === "client" && project.clientId !== user.id) return res.status(403).json({ error: "Access denied" });

    const baDocs = storage.getBaDocumentsByProject(project.id);
    const doc = baDocs.find(d => d.id === Number(req.params.docId));
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const buffer = Buffer.from(doc.fileData, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${doc.originalFilename}"`);
    res.send(buffer);
  });

  // ── Certificates ──────────────────────────────────────────────────────────
  app.post("/api/projects/:id/certificates", requireAuth, upload.array("files", 20), async (req, res) => {
    const user = req.user!;
    const project = storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Clients can only upload to their assigned projects
    if (user.role === "client" && project.clientId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (user.role === "certifier" && project.certifierId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    // Fetch BA document texts for AI cross-reference
    const baDocs = storage.getBaDocumentsByProject(project.id);
    const baTexts = baDocs
      .filter(d => d.extractedText && d.extractedText.trim().length > 50)
      .map(d => ({ type: d.documentType, text: d.extractedText!, filename: d.originalFilename }));

    const results = [];

    for (const file of files) {
      const cert = storage.createCertificate({
        projectId: project.id,
        uploadedBy: user.id,
        originalFilename: file.originalname,
        fileData: file.buffer.toString("base64"),
        status: "analyzing",
        uploadedAt: new Date().toISOString(),
      });

      try {
        let extractedText = "";
        if (file.mimetype === "application/pdf") {
          extractedText = await extractPdfText(file.buffer);
        } else {
          extractedText = file.buffer.toString("utf-8");
        }

        if (!extractedText.trim()) {
          storage.updateCertificate(cert.id, {
            status: "error",
            complianceResult: JSON.stringify({
              overallStatus: "warning", score: 0,
              suggestedFilename: file.originalname,
              summary: "Could not extract text. The PDF may be a scanned image — please ensure it contains selectable text.",
              checks: [{ id: "text-extraction", description: "Text Extraction", status: "warning", details: "No selectable text found. OCR may be required." }],
            }),
          });
          results.push({ ...storage.getCertificate(cert.id), fileData: null, markedUpFileData: null });
          continue;
        }

        // AI analysis
        const analysis = await analyzeWithAI(extractedText, project, baTexts);

        // Generate marked-up PDF
        let markedUpData: string | null = null;
        try {
          const markedUpBuffer = await createMarkedUpPdf(
            file.buffer,
            analysis.complianceResult,
            analysis.extractedData,
            project,
          );
          markedUpData = markedUpBuffer.toString("base64");
        } catch (markupErr) {
          console.error("Markup error:", markupErr);
        }

        storage.updateCertificate(cert.id, {
          formType: analysis.extractedData?.formType || null,
          aspectDescription: analysis.extractedData?.aspectDescription || null,
          suggestedFilename: analysis.complianceResult?.suggestedFilename || null,
          extractedData: JSON.stringify(analysis.extractedData),
          complianceResult: JSON.stringify(analysis.complianceResult),
          markedUpFileData: markedUpData,
          status: analysis.complianceResult?.overallStatus || "analyzed",
        });

        const saved = storage.getCertificate(cert.id);
        results.push({ ...saved, fileData: null, markedUpFileData: markedUpData ? "available" : null });
      } catch (err: any) {
        console.error("Analysis error:", err);
        storage.updateCertificate(cert.id, {
          status: "error",
          complianceResult: JSON.stringify({
            overallStatus: "fail", score: 0,
            suggestedFilename: file.originalname,
            summary: `Analysis failed: ${err.message}`,
            checks: [],
          }),
        });
        results.push({ ...storage.getCertificate(cert.id), fileData: null, markedUpFileData: null });
      }
    }

    res.json(results);
  });

  app.get("/api/certificates/:id", requireAuth, (req, res) => {
    const user = req.user!;
    const cert = storage.getCertificate(Number(req.params.id));
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    const project = storage.getProject(cert.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Access control
    if (user.role === "certifier" && project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });
    if (user.role === "client") {
      if (project.clientId !== user.id || !cert.issuedToClient) return res.status(403).json({ error: "Access denied" });
    }

    res.json({ ...cert, fileData: null, markedUpFileData: cert.markedUpFileData ? "available" : null });
  });

  // Download original certificate PDF
  app.get("/api/certificates/:id/download", requireAuth, (req, res) => {
    const user = req.user!;
    const cert = storage.getCertificate(Number(req.params.id));
    if (!cert || !cert.fileData) return res.status(404).json({ error: "Not found" });

    const project = storage.getProject(cert.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (user.role === "certifier" && project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });
    if (user.role === "client" && (project.clientId !== user.id || !cert.issuedToClient)) return res.status(403).json({ error: "Access denied" });

    const buffer = Buffer.from(cert.fileData, "base64");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${cert.originalFilename}"`);
    res.send(buffer);
  });

  // Download marked-up certificate PDF
  app.get("/api/certificates/:id/marked-up", requireAuth, (req, res) => {
    const user = req.user!;
    const cert = storage.getCertificate(Number(req.params.id));
    if (!cert || !cert.markedUpFileData) return res.status(404).json({ error: "Not found" });

    const project = storage.getProject(cert.projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (user.role === "certifier" && project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });
    if (user.role === "client" && (project.clientId !== user.id || !cert.issuedToClient)) return res.status(403).json({ error: "Access denied" });

    const buffer = Buffer.from(cert.markedUpFileData, "base64");
    const filename = cert.suggestedFilename
      ? `MARKED_UP - ${cert.suggestedFilename}.pdf`
      : `MARKED_UP - ${cert.originalFilename}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  // Certifier: issue certificate to client
  app.post("/api/certificates/:id/issue", requireCertifier, (req, res) => {
    const user = req.user!;
    const cert = storage.getCertificate(Number(req.params.id));
    if (!cert) return res.status(404).json({ error: "Certificate not found" });

    const project = storage.getProject(cert.projectId);
    if (!project || project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });

    const updated = storage.updateCertificate(cert.id, {
      issuedToClient: 1,
      issuedAt: new Date().toISOString(),
      certifierNotes: req.body.notes || null,
    });
    res.json({ ...updated, fileData: null, markedUpFileData: updated?.markedUpFileData ? "available" : null });
  });

  // Certifier: update notes on a certificate
  app.patch("/api/certificates/:id/notes", requireCertifier, (req, res) => {
    const user = req.user!;
    const cert = storage.getCertificate(Number(req.params.id));
    if (!cert) return res.status(404).json({ error: "Certificate not found" });
    const project = storage.getProject(cert.projectId);
    if (!project || project.certifierId !== user.id) return res.status(403).json({ error: "Access denied" });

    const updated = storage.updateCertificate(cert.id, { certifierNotes: req.body.notes });
    res.json({ ...updated, fileData: null, markedUpFileData: updated?.markedUpFileData ? "available" : null });
  });

  return httpServer;
}
