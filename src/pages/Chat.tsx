import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Lightbulb, MessageCircle, RefreshCcw, Send, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  addMessageToThread,
  getOrCreateThread,
  getOwnerThreads,
  getThreadById,
  type ChatMessage,
  type ChatThread,
  type ChatThreadSummary,
} from "@/lib/chat";
import { buildBoatDetailsPath, getBoatByPublicReference } from "@/lib/boats";
import type { Boat } from "@/lib/boats";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLanguage } from "@/contexts/LanguageContext";

const OwnerAvatar = ({ ownerName, size = "sm" }: { ownerName: string; size?: "sm" | "lg" }) => {
  const initials = ownerName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  const cls = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <Avatar className={`${cls} shrink-0 border border-border`}>
      <AvatarFallback className="bg-aegean/10 text-aegean font-semibold text-xs">{initials}</AvatarFallback>
    </Avatar>
  );
};

const CustomerAvatar = ({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) => {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cls = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  return (
    <Avatar className={`${cls} shrink-0 border border-border`}>
      <AvatarFallback className="bg-turquoise/10 text-turquoise font-semibold text-xs">{initials || "ME"}</AvatarFallback>
    </Avatar>
  );
};

const Bubble = ({
  msg,
  ownerName,
  customerName,
}: {
  msg: ChatMessage;
  ownerName: string;
  customerName: string;
}) => {
  const isOwner = msg.sender === "owner";
  return (
    <div className={`flex gap-2 items-end ${isOwner ? "flex-row" : "flex-row-reverse"}`}>
      {isOwner ? (
        <OwnerAvatar ownerName={ownerName} />
      ) : (
        <CustomerAvatar name={customerName} />
      )}
      <div className={`max-w-[85%] sm:max-w-[75%] space-y-1 ${isOwner ? "items-start" : "items-end"} flex flex-col`}>
        <p className={`text-xs text-muted-foreground px-1 ${isOwner ? "text-left" : "text-right"}`}>
          {isOwner ? ownerName : customerName}
        </p>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isOwner
              ? "rounded-bl-sm bg-muted text-foreground"
              : "rounded-br-sm bg-aegean text-primary-foreground"
          }`}
        >
          {msg.text}
        </div>
        <p className={`text-xs text-muted-foreground/60 px-1 ${isOwner ? "text-left" : "text-right"}`}>
          {format(new Date(msg.createdAt), "HH:mm")}
        </p>
      </div>
    </div>
  );
};

const buildSuggestionIdeas = (boatName: string, ownerName: string, tl: (en: string, el: string) => string) => [
  tl(`Is ${boatName} available next weekend?`, `Είναι διαθέσιμο το ${boatName} το επόμενο Σαββατοκύριακο;`),
  tl("Can you do a sunset cruise?", "Μπορείτε να κάνετε sunset κρουαζιέρα;"),
  tl("What's included in the price?", "Τι περιλαμβάνεται στην τιμή;"),
  tl("Can we customize the route and swim stops?", "Μπορούμε να προσαρμόσουμε τη διαδρομή και τις στάσεις για μπάνιο;"),
  tl("Do you provide skipper and fuel estimate?", "Παρέχετε skipper και εκτίμηση καυσίμων;"),
  tl(`How fast do you usually respond, ${ownerName}?`, `Πόσο γρήγορα απαντάτε συνήθως, ${ownerName};`),
];

const Chat = () => {
  const { tl } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: sessionUser } = useCurrentUser();
  const customerName = sessionUser?.name ?? "You";
  const isOwnerMode = Boolean(sessionUser?.isOwner);

  const boatReference = searchParams.get("boatRef") ?? searchParams.get("boatId") ?? "";
  const threadIdFromQuery = searchParams.get("threadId") ?? "";
  const [boat, setBoat] = useState<Boat | null>(null);
  const [ownerThreads, setOwnerThreads] = useState<ChatThreadSummary[]>([]);
  const [thread, setThread] = useState<ChatThread | null>(null);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maxMessageLength = 240;

  useEffect(() => {
    if (!boatReference) {
      setBoat(null);
      return;
    }

    getBoatByPublicReference(boatReference).then(setBoat);
  }, [boatReference]);

  const boatName = boat?.name ?? searchParams.get("boat") ?? "this boat";
  const ownerName = thread?.ownerName ?? boat?.owner.name ?? "Owner";
  const activeCustomerName = thread?.customerName ?? customerName;
  const boatProfileLink = boat ? buildBoatDetailsPath(boat) : "/boats";
  const hasBoatContext = Boolean(boatReference);
  const suggestionIdeas = useMemo(() => buildSuggestionIdeas(boatName, ownerName, tl), [boatName, ownerName, tl]);

  const scrollToBottom = () =>
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [thread?.messages]);

  const loadThreadById = async (threadId: string, syncQuery = true) => {
    const nextThread = await getThreadById(threadId);
    setThread(nextThread);

    if (syncQuery) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("threadId", threadId);
      setSearchParams(nextParams, { replace: true });
    }
  };

  const reloadActiveThread = async () => {
    if (!thread?.id) {
      return;
    }
    await loadThreadById(thread.id, false);
  };

  const loadOwnerInbox = async (openFirstIfMissing = false) => {
    const threads = await getOwnerThreads();
    setOwnerThreads(threads);

    const preferredThreadId = threadIdFromQuery || (openFirstIfMissing ? threads[0]?.id : "");
    if (preferredThreadId) {
      await loadThreadById(preferredThreadId, !threadIdFromQuery);
    } else {
      setThread(null);
    }
  };

  useEffect(() => {
    if (!sessionUser) {
      setThread(null);
      setOwnerThreads([]);
      setErrorMessage("");
      return;
    }

    const load = async () => {
      try {
        setErrorMessage("");

        if (isOwnerMode) {
          await loadOwnerInbox(true);
          return;
        }

        if (!boatReference || !boat?.id) {
          setThread(null);
          setErrorMessage(tl("Missing boat context. Open chat from a boat profile.", "Λείπει το σκάφος. Άνοιξε τη συνομιλία από το προφίλ σκάφους."));
          return;
        }

        if (sessionUser.isOwner) {
          setThread(null);
          setErrorMessage(tl("You cannot start chat for your own boat.", "Δεν μπορείς να ξεκινήσεις συνομιλία για το δικό σου σκάφος."));
          return;
        }

        const customerThread = await getOrCreateThread(boat.id, boat.name, ownerName);
        setThread(customerThread);
      } catch (error) {
        setThread(null);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load chat.");
      }
    };

    load();
    // sessionUser/boat/ownerName/tl are read for one-shot setup logic here; their
    // identities change every render, and loadOwnerInbox/reloadActiveThread are
    // recreated each render too, so only the stable primitive keys are tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id, isOwnerMode, boatReference, boat?.id]);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isSending) {
        return;
      }

      if (isOwnerMode) {
        loadOwnerInbox(false).catch(() => {
          // Keep polling resilient without interrupting UI.
        });
      } else {
        reloadActiveThread().catch(() => {
          // Keep polling resilient without interrupting UI.
        });
      }
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
    // loadOwnerInbox/reloadActiveThread/sessionUser are recreated every render;
    // adding them here would tear down and restart the 10s poll interval on
    // every render instead of only when these primitive keys actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id, isOwnerMode, isSending, thread?.id, threadIdFromQuery]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || text.length > maxMessageLength || !sessionUser || !thread?.id || isSending) return;

    try {
      setIsSending(true);
      setErrorMessage("");
      await addMessageToThread(thread.id, isOwnerMode ? "owner" : "customer", text);
      setDraft("");
      await reloadActiveThread();
      if (isOwnerMode) {
        await loadOwnerInbox(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : tl("Unable to load chat", "Αδυναμία φόρτωσης συνομιλίας"));
    } finally {
      setIsSending(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!sessionUser) {
      return;
    }

    try {
      setIsRefreshing(true);
      setErrorMessage("");
      if (isOwnerMode) {
        await loadOwnerInbox(false);
      } else {
        await reloadActiveThread();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : tl("Unable to load chat", "Αδυναμία φόρτωσης συνομιλίας"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    setDraft(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openOwnerThread = async (threadSummary: ChatThreadSummary) => {
    try {
      setErrorMessage("");
      await loadThreadById(threadSummary.id, true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to open conversation.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16 flex flex-col">
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            {isOwnerMode ? (
              <span className="text-sm font-medium text-aegean shrink-0">Owner inbox</span>
            ) : (
              <Link to={boatProfileLink} className="text-sm text-aegean hover:text-turquoise font-medium shrink-0">
                ← {boatName}
              </Link>
            )}
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <OwnerAvatar ownerName={ownerName} size="lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground truncate">{isOwnerMode ? activeCustomerName : ownerName}</p>
                  {!isOwnerMode && boat?.owner.isSuperhost && (
                    <Badge className="bg-aegean text-primary-foreground shrink-0">{tl("Guest favorite", "Αγαπημένο των επισκεπτών")}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {isOwnerMode
                    ? `Boat: ${thread?.boatName ?? "-"}`
                    : `${boat?.owner.title ?? tl("Boat owner", "Ιδιοκτήτης σκάφους")} · ${boat?.responseTime ?? tl("Usually responds fast", "Συνήθως απαντά γρήγορα")}`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-xs"
              onClick={handleManualRefresh}
              disabled={isRefreshing || !sessionUser || (!hasBoatContext && !isOwnerMode)}
            >
              <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {tl("Refresh", "Ανανέωση")}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col container mx-auto px-4 max-w-5xl w-full py-4 sm:py-6 gap-4 sm:gap-6 min-h-0">
          {isOwnerMode && ownerThreads.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Conversations</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {ownerThreads.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openOwnerThread(item)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      thread?.id === item.id ? "border-aegean bg-aegean/5" : "border-border hover:border-aegean/40"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground truncate">{item.customerName}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.boatName}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{item.lastMessageText || "No messages yet"}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ScrollArea className="flex-1 rounded-2xl sm:rounded-3xl border border-border bg-background p-3 sm:p-4 h-[calc(100dvh-20rem)] sm:h-[calc(100dvh-18rem)]">
            {!sessionUser ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="font-semibold text-foreground">{tl("Sign in to start chatting", "Συνδέσου για να ξεκινήσεις συνομιλία")}</p>
                <p className="text-sm text-muted-foreground max-w-xs">{tl("Owner conversations use your Supabase account.", "Οι συνομιλίες με ιδιοκτήτες χρησιμοποιούν τον λογαριασμό Supabase.")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/">{tl("Go to home and sign in", "Πήγαινε στην αρχική και συνδέσου")}</Link>
                </Button>
              </div>
            ) : errorMessage ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="font-semibold text-foreground">{tl("Unable to load chat", "Αδυναμία φόρτωσης συνομιλίας")}</p>
                <p className="text-sm text-muted-foreground max-w-xs">{errorMessage}</p>
                <Button size="sm" variant="outline" onClick={handleManualRefresh}>
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  {tl("Retry", "Δοκίμασε ξανά")}
                </Button>
              </div>
            ) : !thread || thread.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="rounded-full bg-aegean/10 p-4">
                  <MessageCircle className="h-8 w-8 text-aegean" />
                </div>
                <p className="font-semibold text-foreground">{isOwnerMode ? "No active conversation selected" : "Start a conversation"}</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {isOwnerMode
                    ? "Open a customer thread above to reply."
                    : `${tl("Ask", "Ρώτησε")} ${ownerName} ${tl("about availability, stops, routes, or anything about", "για διαθεσιμότητα, στάσεις, διαδρομές ή οτιδήποτε σχετικά με")} ${boatName}.`}
                </p>
                {!isOwnerMode && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {suggestionIdeas.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="rounded-full border border-aegean/30 bg-aegean/5 px-3 py-1.5 text-xs text-aegean hover:bg-aegean/10 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {thread.messages.map((msg) => (
                  <Bubble
                    key={msg.id}
                    msg={msg}
                    ownerName={thread.ownerName}
                    customerName={thread.customerName}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-3 items-center rounded-2xl border border-border bg-card p-2 shadow-card">
            {isOwnerMode ? <OwnerAvatar ownerName={ownerName} /> : <CustomerAvatar name={customerName} />}
            <Input
              ref={inputRef}
              className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground"
              placeholder={isOwnerMode ? `Reply to ${activeCustomerName}…` : `${tl("Message", "Μήνυμα προς")} ${ownerName}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={maxMessageLength}
              autoFocus
              disabled={!sessionUser || !thread?.id || (!hasBoatContext && !isOwnerMode) || isSending}
            />
            <Button
              size="icon"
              className="bg-gradient-accent text-accent-foreground shrink-0 rounded-xl"
              onClick={handleSend}
              disabled={!draft.trim() || !sessionUser || !thread?.id || (!hasBoatContext && !isOwnerMode) || isSending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {!isOwnerMode && sessionUser && hasBoatContext ? (
            <div className="rounded-2xl border border-border/80 bg-card/80 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-aegean" />
                <p className="text-xs font-semibold text-foreground">{tl("Message ideas", "Ιδέες μηνυμάτων")}</p>
                <Sparkles className="h-3.5 w-3.5 text-turquoise" />
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestionIdeas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => applySuggestion(idea)}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-aegean/40 hover:bg-aegean/5 transition-colors"
                  >
                    {idea}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{tl("Tip: keep your message clear to get a faster response.", "Συμβουλή: γράψε καθαρό μήνυμα για πιο γρήγορη απάντηση.")}</span>
                <span>{draft.length}/{maxMessageLength}</span>
              </div>
            </div>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            {tl("Messages are stored in Supabase", "Τα μηνύματα αποθηκεύονται στο Supabase")}
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Chat;
