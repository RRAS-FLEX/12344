import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Bug, MessageCircle, Minus, Send, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface SupportMessage {
  id: string;
  sender: "support" | "user";
  text: string;
  createdAt: string;
}

const SUPPORT_NAME = "Nautiplex Support";
const MAX_LENGTH = 280;

const supportReplies = (userText: string): string => {
  const t = userText.toLowerCase();
  if (t.includes("booking") || t.includes("κράτηση"))
    return "For booking questions, head to your History page or open the booking page where you'll find the full details. Need anything else?";
  if (t.includes("cancel") || t.includes("ακύρωση"))
    return "Cancellation policies vary per boat owner. Please check the Refund Policy page or contact the boat owner directly via Chat.";
  if (t.includes("payment") || t.includes("πληρωμή") || t.includes("pay"))
    return "We support Stripe, card, Apple Pay, Google Pay and manual harbour payment. Visit the booking flow to pick your preferred method.";
  if (t.includes("owner") || t.includes("ιδιοκτήτης"))
    return "To become an owner, visit the 'Become an Owner' page. We'll guide you through the onboarding and approval process.";
  if (t.includes("map") || t.includes("location") || t.includes("χάρτης"))
    return "You can find meeting-point maps on the individual boat and booking pages. Open directions straight to Google Maps from there.";
  if (t.includes("review") || t.includes("αξιολόγηση"))
    return "Reviews become available once your trip date has passed. You'll see a 'Leave a review' button on your History page.";
  if (t.includes("hello") || t.includes("hi") || t.includes("hey") || t.includes("γεια"))
    return "Hey! How can Nautiplex Support help you today?";
  if (t.includes("thank") || t.includes("ευχαριστώ"))
    return "Happy to help! Enjoy your journey with Nautiplex 🌊";
  return "I'll look into that for you! If it's urgent, you can also email us at support@nautiplex.com. Is there anything else I can help with?";
};

const SupportAvatar = () => (
  <Avatar className="h-8 w-8 shrink-0 border border-border">
    <AvatarFallback className="bg-aegean/10 text-aegean font-semibold text-xs">NS</AvatarFallback>
  </Avatar>
);

const UserAvatar = ({ initials }: { initials: string }) => (
  <Avatar className="h-8 w-8 shrink-0 border border-border">
    <AvatarFallback className="bg-turquoise/10 text-turquoise font-semibold text-xs">{initials || "ME"}</AvatarFallback>
  </Avatar>
);

const Bubble = ({ msg, userInitials }: { msg: SupportMessage; userInitials: string }) => {
  const isSupport = msg.sender === "support";
  return (
    <div className={`flex gap-2 items-end ${isSupport ? "flex-row" : "flex-row-reverse"}`}>
      {isSupport ? <SupportAvatar /> : <UserAvatar initials={userInitials} />}
      <div className={`max-w-[82%] space-y-1 flex flex-col ${isSupport ? "items-start" : "items-end"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isSupport ? "rounded-bl-sm bg-muted text-foreground" : "rounded-br-sm bg-aegean text-primary-foreground"
          }`}
        >
          {msg.text}
        </div>
        <p className={`text-[10px] text-muted-foreground/60 px-1 ${isSupport ? "text-left" : "text-right"}`}>
          {format(new Date(msg.createdAt), "HH:mm")}
        </p>
      </div>
    </div>
  );
};

const TypingIndicator = () => (
  <div className="flex gap-2 items-end">
    <SupportAvatar />
    <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3 flex gap-1 items-center">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
    </div>
  </div>
);

const greetingMessage = (): SupportMessage => ({
  id: "greeting",
  sender: "support",
  text: "Hi! I'm Nautiplex Support 👋 Ask me anything about bookings, payments, maps, or how the platform works.",
  createdAt: new Date().toISOString(),
});

export const SupportChat = () => {
  const { tl } = useLanguage();
  const { user } = useCurrentUser();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([greetingMessage()]);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<number | null>(null);

  const userInitials = (user?.name ?? "")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ME";

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    if (isOpen && !isMinimised) {
      scrollToBottom();
      setHasUnread(false);
    }
  }, [messages, isTyping, isOpen, isMinimised]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    };
  }, []);

  const open = () => {
    setIsOpen(true);
    setIsMinimised(false);
    setHasUnread(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    const userMsg: SupportMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setIsTyping(true);

    typingTimerRef.current = window.setTimeout(() => {
      const reply: SupportMessage = {
        id: `s-${Date.now()}`,
        sender: "support",
        text: supportReplies(text),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      setIsTyping(false);
      if (isMinimised || !isOpen) {
        setHasUnread(true);
      }
    }, 900 + Math.random() * 600);
  }, [draft, isMinimised, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label={tl("Open customer support chat", "Άνοιγμα υποστήριξης")}
        onClick={open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-aegean text-primary-foreground shadow-lg hover:bg-aegean/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegean focus-visible:ring-offset-2"
      >
        <MessageCircle className="h-6 w-6" />
        {hasUnread && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
            !
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-[clamp(320px,90vw,380px)] rounded-2xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
        isMinimised ? "h-14" : "h-[480px] max-h-[80dvh]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-aegean text-primary-foreground shrink-0">
        <SupportAvatar />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-none">{SUPPORT_NAME}</p>
          <p className="text-[11px] opacity-70 mt-0.5">{tl("Typically replies instantly", "Απαντά άμεσα")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={isMinimised ? tl("Expand", "Ανάπτυξη") : tl("Minimise", "Σμίκρυνση")}
            onClick={() => setIsMinimised((v) => !v)}
            className="rounded p-1 hover:bg-white/10 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={tl("Close support chat", "Κλείσιμο υποστήριξης")}
            onClick={() => setIsOpen(false)}
            className="rounded p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimised && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-4">
              {messages.map((msg) => (
                <Bubble key={msg.id} msg={msg} userInitials={userInitials} />
              ))}
              {isTyping && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="px-3 pb-1">
            <Link
              to={`/report?type=website&pageUrl=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-aegean transition-colors"
            >
              <Bug className="h-3.5 w-3.5" />
              {tl("Report a website malfunction", "Αναφορά δυσλειτουργίας ιστοσελίδας")}
            </Link>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border px-3 py-2.5 flex items-center gap-2 bg-background">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder={tl("Type a message…", "Γράψε μήνυμα…")}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              aria-label={tl("Support message input", "Εισαγωγή μηνύματος υποστήριξης")}
            />
            <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
              {draft.length}/{MAX_LENGTH}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={!draft.trim() || isTyping}
              onClick={handleSend}
              className="h-8 w-8 shrink-0 text-aegean hover:text-aegean hover:bg-aegean/10"
              aria-label={tl("Send message", "Αποστολή μηνύματος")}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default SupportChat;

