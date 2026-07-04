import { supabase, type DatabaseTables } from "./supabase";

export interface BusinessTicket {
  id: string;
  businessName: string;
  businessType: "hotel" | "travel-agent" | "villa" | "other";
  contactName: string;
  contactEmail: string;
  message: string;
  createdAt: string;
  status: "new" | "reviewing" | "approved";
}
const mapTicket = (ticket: DatabaseTables["business_tickets"]["Row"]): BusinessTicket => ({
  id: ticket.id,
  businessName: ticket.business_name,
  businessType: ticket.business_type,
  contactName: ticket.contact_name,
  contactEmail: ticket.contact_email,
  message: ticket.message,
  createdAt: ticket.created_at,
  status: ticket.status,
});

export const listBusinessTickets = async (): Promise<BusinessTicket[]> => {
  const { data, error } = await supabase.from("business_tickets").select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message || "Failed to load business tickets");
  }
  return Array.isArray(data) ? data.map(mapTicket) : [];
};

export const addBusinessTicket = async (ticket: Omit<BusinessTicket, "id" | "createdAt" | "status">): Promise<BusinessTicket> => {
  const { data, error } = await supabase
    .from("business_tickets")
    .insert({
      business_name: ticket.businessName,
      business_type: ticket.businessType,
      contact_name: ticket.contactName,
      contact_email: ticket.contactEmail,
      message: ticket.message,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create business ticket");
  }

  return mapTicket(data);
};

export const getBusinessTicketMetrics = async () => {
  const tickets = await listBusinessTickets();
  const hotelLeads = tickets.filter((ticket) => ticket.businessType === "hotel").length;
  const total = tickets.length;
  const promotedBookings = Math.round(total * 2.1);
  const estimatedRevenue = promotedBookings * 220;

  return {
    total,
    hotelLeads,
    promotedBookings,
    estimatedRevenue,
  };
};
