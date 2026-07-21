import type { User } from "@supabase/supabase-js";
import { supabase, getSessionSafe, type DatabaseTables } from "./supabase";

export type MessageSender = "customer" | "owner";

export interface ChatMessage {
  id: string;
  boatId: string;
  sender: MessageSender;
  text: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  boatId: string;
  boatName: string;
  ownerName: string;
  customerId: string;
  customerName: string;
  messages: ChatMessage[];
  lastUpdatedAt: string;
}

export interface ChatThreadSummary {
  id: string;
  boatId: string;
  boatName: string;
  ownerName: string;
  customerId: string;
  customerName: string;
  lastUpdatedAt: string;
  lastMessageText: string;
}

const toReadableChatError = (error: unknown, fallback: string) => {
  const errorLike = error as { message?: string; code?: string } | null | undefined;
  const message = String(errorLike?.message ?? fallback);
  const normalized = message.toLowerCase();

  if (errorLike?.code === "42P01" || normalized.includes("relation") && normalized.includes("chat_")) {
    return "Chat tables are missing. Run supabase_full_app_migration.sql in Supabase SQL editor.";
  }

  if (normalized.includes("foreign key") || normalized.includes("violates foreign key")) {
    return "Your account profile is not synced yet. Sign out/in and retry chat.";
  }

  return message || fallback;
};

const getSignedInSession = async () => {
  const {
    data: { session },
  } = await getSessionSafe();

  if (!session?.user) {
    throw new Error("Sign in to chat with owners.");
  }

  return session;
};

const ensureCustomerProfile = async (session: { user: User }) => {
  const email = session.user?.email?.trim?.().toLowerCase?.();
  if (!email) {
    throw new Error("Supabase user is missing an email address");
  }

  const fallbackName =
    (typeof session.user?.user_metadata?.name === "string" && session.user.user_metadata.name.trim()) ||
    email.split("@")[0] ||
    "Nautiplex User";

  const { error } = await supabase
    .from("users")
    .upsert(
      {
        id: session.user.id,
        email,
        name: fallbackName,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(toReadableChatError(error, "Failed to sync user profile for chat"));
  }
};

const mapMessage = (message: DatabaseTables["chat_messages"]["Row"]): ChatMessage => ({
  id: message.id,
  boatId: message.boat_id,
  sender: message.sender_role,
  text: message.text,
  createdAt: message.created_at,
});

const getOwnerBoatMap = async (ownerId: string) => {
  const { data: boats, error } = await supabase
    .from("boats")
    .select("id, owner_id")
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(toReadableChatError(error, "Failed to load owner boats"));
  }

  const rows = Array.isArray(boats) ? boats : [];
  return new Set(rows.map((boat) => String(boat.id)));
};

const getCustomerNameMap = async (customerIds: string[]) => {
  if (customerIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .in("id", customerIds);

  if (error) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();
  for (const row of Array.isArray(data) ? data : []) {
    map.set(String(row.id), String(row.name ?? "Customer"));
  }
  return map;
};

const ensureOwnerCanAccessThread = async (userId: string, boatId: string) => {
  const ownerBoatIds = await getOwnerBoatMap(userId);
  if (!ownerBoatIds.has(String(boatId))) {
    throw new Error("You can only access conversations for boats you own.");
  }
};

export const getOrCreateThread = async (boatId: string, boatName: string, ownerName: string): Promise<ChatThread> => {
  if (!boatId?.trim()) {
    throw new Error("Missing boat context. Open chat from a boat profile.");
  }

  const session = await getSignedInSession();
  await ensureCustomerProfile(session);
  const threadsTable = supabase.from("chat_threads");
  const messagesTable = supabase.from("chat_messages");

  let { data: thread } = await threadsTable
    .select("*")
    .eq("boat_id", boatId)
    .eq("customer_id", session.user.id)
    .maybeSingle();

  if (!thread) {
    const { data: createdThread, error } = await threadsTable
      .insert({
        boat_id: boatId,
        boat_name: boatName,
        owner_name: ownerName,
        customer_id: session.user.id,
      })
      .select()
      .single();

    if (error || !createdThread) {
      const maybeExisting = await threadsTable
        .select("*")
        .eq("boat_id", boatId)
        .eq("customer_id", session.user.id)
        .maybeSingle();

      if (maybeExisting?.data) {
        thread = maybeExisting.data;
      } else {
        throw new Error(toReadableChatError(error, "Failed to create chat thread"));
      }
    } else {
      thread = createdThread;
    }
  }

  const { data: messageRows, error: messageError } = await messagesTable
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  if (messageError) {
    throw new Error(toReadableChatError(messageError, "Failed to load chat messages"));
  }

  return {
    id: thread.id,
    boatId: thread.boat_id,
    boatName: thread.boat_name,
    ownerName: thread.owner_name,
    customerId: thread.customer_id,
    customerName: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Customer",
    messages: Array.isArray(messageRows) ? messageRows.map(mapMessage) : [],
    lastUpdatedAt: thread.last_updated_at,
  };
};

export const getThreadById = async (threadId: string): Promise<ChatThread> => {
  if (!threadId?.trim()) {
    throw new Error("Missing chat thread context.");
  }

  const session = await getSignedInSession();
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    throw new Error(toReadableChatError(threadError, "Failed to load chat thread"));
  }

  const isCustomer = String(thread.customer_id) === session.user.id;
  if (!isCustomer) {
    await ensureOwnerCanAccessThread(session.user.id, thread.boat_id);
  }

  const { data: messageRows, error: messageError } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  if (messageError) {
    throw new Error(toReadableChatError(messageError, "Failed to load chat messages"));
  }

  const customerNameMap = await getCustomerNameMap([String(thread.customer_id)]);

  return {
    id: thread.id,
    boatId: thread.boat_id,
    boatName: thread.boat_name,
    ownerName: thread.owner_name,
    customerId: thread.customer_id,
    customerName: customerNameMap.get(String(thread.customer_id)) || "Customer",
    messages: Array.isArray(messageRows) ? messageRows.map(mapMessage) : [],
    lastUpdatedAt: thread.last_updated_at,
  };
};

export const getOwnerThreads = async (): Promise<ChatThreadSummary[]> => {
  const session = await getSignedInSession();
  const ownerBoatIds = await getOwnerBoatMap(session.user.id);
  const boatIds = [...ownerBoatIds];

  if (boatIds.length === 0) {
    return [];
  }

  const { data: threadRows, error: threadError } = await supabase
    .from("chat_threads")
    .select("id, boat_id, boat_name, owner_name, customer_id, last_updated_at")
    .in("boat_id", boatIds)
    .order("last_updated_at", { ascending: false });

  if (threadError) {
    throw new Error(toReadableChatError(threadError, "Failed to load owner chats"));
  }

  const threads = Array.isArray(threadRows) ? threadRows : [];
  if (threads.length === 0) {
    return [];
  }

  const threadIds = threads.map((thread) => String(thread.id));
  const customerIds = [...new Set(threads.map((thread) => String(thread.customer_id)).filter(Boolean))];
  const customerNameMap = await getCustomerNameMap(customerIds);

  const { data: messageRows } = await supabase
    .from("chat_messages")
    .select("thread_id, text, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  const latestByThread = new Map<string, string>();
  for (const message of Array.isArray(messageRows) ? messageRows : []) {
    const threadId = String(message.thread_id);
    if (!latestByThread.has(threadId)) {
      latestByThread.set(threadId, String(message.text ?? ""));
    }
  }

  return threads.map((thread) => ({
    id: String(thread.id),
    boatId: String(thread.boat_id),
    boatName: String(thread.boat_name ?? "Boat"),
    ownerName: String(thread.owner_name ?? "Owner"),
    customerId: String(thread.customer_id),
    customerName: customerNameMap.get(String(thread.customer_id)) || "Customer",
    lastUpdatedAt: String(thread.last_updated_at ?? new Date().toISOString()),
    lastMessageText: latestByThread.get(String(thread.id)) || "",
  }));
};

export const addMessageToThread = async (
  threadId: string,
  sender: MessageSender,
  text: string,
): Promise<ChatMessage> => {
  if (!threadId?.trim()) {
    throw new Error("Missing chat thread context.");
  }

  const session = await getSignedInSession();
  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("id, boat_id, customer_id")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    throw new Error(toReadableChatError(threadError, "Failed to load chat thread"));
  }

  if (sender === "customer") {
    if (String(thread.customer_id) !== session.user.id) {
      throw new Error("You can only send customer messages in your own conversations.");
    }
    await ensureCustomerProfile(session);
  } else {
    await ensureOwnerCanAccessThread(session.user.id, thread.boat_id);
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: thread.id,
      boat_id: thread.boat_id,
      sender_role: sender,
      sender_user_id: session.user.id,
      text: text.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(toReadableChatError(error, "Failed to send message"));
  }

  await supabase.from("chat_threads").update({ last_updated_at: data.created_at }).eq("id", thread.id);
  return mapMessage(data);
};

