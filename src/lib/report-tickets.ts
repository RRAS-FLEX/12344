import { supabase } from "./supabase";

export type ReportType = "customer" | "owner" | "boat" | "website";
export type ReportSeverity = "low" | "medium" | "high" | "critical";
export type ReportStatus = "new" | "triaged" | "resolved";

export interface ReportTicket {
  id: string;
  reportType: ReportType;
  subject: string;
  targetName: string;
  targetRef: string | null;
  reporterName: string;
  reporterEmail: string;
  severity: ReportSeverity;
  message: string;
  pageUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  status: ReportStatus;
}

export interface NewReportTicket {
  reportType: ReportType;
  subject: string;
  targetName: string;
  targetRef?: string | null;
  reporterName: string;
  reporterEmail: string;
  severity: ReportSeverity;
  message: string;
  pageUrl?: string | null;
  metadata?: Record<string, unknown>;
}

const REPORT_STORAGE_KEY = "nautiplex:report-tickets";

const mapReportTicket = (ticket: any): ReportTicket => ({
  id: String(ticket.id),
  reportType: ticket.report_type,
  subject: ticket.subject,
  targetName: ticket.target_name,
  targetRef: ticket.target_ref ?? null,
  reporterName: ticket.reporter_name,
  reporterEmail: ticket.reporter_email,
  severity: ticket.severity,
  message: ticket.message,
  pageUrl: ticket.page_url ?? null,
  metadata: typeof ticket.metadata === "object" && ticket.metadata ? ticket.metadata : {},
  createdAt: ticket.created_at,
  status: ticket.status,
});

const isBrowser = () => typeof window !== "undefined";

const readLocalTickets = (): ReportTicket[] => {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REPORT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalTickets = (tickets: ReportTicket[]) => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(tickets));
};

const buildLocalTicket = (ticket: NewReportTicket): ReportTicket => ({
  id: isBrowser() && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`,
  reportType: ticket.reportType,
  subject: ticket.subject,
  targetName: ticket.targetName,
  targetRef: ticket.targetRef ?? null,
  reporterName: ticket.reporterName,
  reporterEmail: ticket.reporterEmail,
  severity: ticket.severity,
  message: ticket.message,
  pageUrl: ticket.pageUrl ?? null,
  metadata: ticket.metadata ?? {},
  createdAt: new Date().toISOString(),
  status: "new",
});

const addLocalTicket = (ticket: NewReportTicket): ReportTicket => {
  const nextTicket = buildLocalTicket(ticket);
  const current = readLocalTickets();
  writeLocalTickets([nextTicket, ...current]);
  return nextTicket;
};

export const listReportTickets = async (options?: {
  reporterEmail?: string;
  limit?: number;
}): Promise<ReportTicket[]> => {
  const reporterEmail = options?.reporterEmail?.trim().toLowerCase() ?? "";

  try {
    let query = (supabase as any)
      .from("report_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (reporterEmail) {
      query = query.eq("reporter_email", reporterEmail);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data.map(mapReportTicket) : [];
  } catch {
    const local = readLocalTickets();
    const filtered = reporterEmail
      ? local.filter((ticket) => ticket.reporterEmail.toLowerCase() === reporterEmail)
      : local;
    return typeof options?.limit === "number" ? filtered.slice(0, options.limit) : filtered;
  }
};

export const addReportTicket = async (ticket: NewReportTicket): Promise<ReportTicket> => {
  try {
    const { data, error } = await (supabase as any)
      .from("report_tickets")
      .insert({
        report_type: ticket.reportType,
        subject: ticket.subject,
        target_name: ticket.targetName,
        target_ref: ticket.targetRef ?? null,
        reporter_name: ticket.reporterName,
        reporter_email: ticket.reporterEmail,
        severity: ticket.severity,
        message: ticket.message,
        page_url: ticket.pageUrl ?? null,
        metadata: ticket.metadata ?? {},
      })
      .select()
      .single();

    if (error || !data) {
      throw error ?? new Error("Failed to create report ticket");
    }

    return mapReportTicket(data);
  } catch {
    return addLocalTicket(ticket);
  }
};
