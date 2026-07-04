import { FormEvent, useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/lib/auth-hybrid";
import type { AuthUser } from "@/lib/auth-hybrid";
import { getRememberMePreference, setRememberMePreference } from "@/lib/auth-session";
import { isGoogleClientIdUsable, sanitizeGoogleClientId } from "@/lib/google-oauth";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthenticated: (user: AuthUser) => void;
}

const AuthDialog = ({ open, onOpenChange, onAuthenticated }: AuthDialogProps) => {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [errorMessage, setErrorMessage] = useState("");
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isSignInSubmitting, setIsSignInSubmitting] = useState(false);
  const [isSignUpSubmitting, setIsSignUpSubmitting] = useState(false);

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpPasswordConfirm, setSignUpPasswordConfirm] = useState("");
  const [rememberMe, setRememberMe] = useState(getRememberMePreference());

  const googleClientId = sanitizeGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const hasUsableGoogleClientId = isGoogleClientIdUsable(googleClientId);
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "your deployed domain";
  const isBusy = isGoogleSubmitting || isSignInSubmitting || isSignUpSubmitting;

  useEffect(() => {
    if (!open) {
      setErrorMessage("");
      setTab("signin");
      setIsGoogleSubmitting(false);
      setIsSignInSubmitting(false);
      setIsSignUpSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (errorMessage) {
      setErrorMessage("");
    }
    // Only clear the error when the tab changes, not whenever errorMessage itself is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onAuthSuccess = (user: AuthUser) => {
    setErrorMessage("");
    onAuthenticated(user);
    onOpenChange(false);
  };

  const handleGoogleSignIn = async () => {
    if (isBusy) return;

    setErrorMessage("");
    setIsGoogleSubmitting(true);

    try {
      await signInWithGoogle(window.location.href, { rememberMe });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to complete Google login.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;

    setErrorMessage("");
    setRememberMePreference(rememberMe);
    setIsSignInSubmitting(true);

    const email = signInEmail.trim().toLowerCase();

    try {
      const user = await signInWithEmail(email, signInPassword, { rememberMe });
      onAuthSuccess(user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to log in.");
    } finally {
      setIsSignInSubmitting(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;

    setErrorMessage("");

    const trimmedName = signUpName.trim();
    const email = signUpEmail.trim().toLowerCase();

    if (!trimmedName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (signUpPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (signUpPassword !== signUpPasswordConfirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setRememberMePreference(rememberMe);
    setIsSignUpSubmitting(true);

    try {
      const user = await signUpWithEmail(trimmedName, email, signUpPassword, { rememberMe });
      onAuthSuccess(user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSignUpSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden border-aegean/30 p-0">
        <DialogHeader className="space-y-2 border-b border-border/60 bg-gradient-to-br from-aegean/15 via-background to-coral/10 px-6 py-5">
          <DialogTitle className="text-2xl font-semibold tracking-tight">Welcome to Nautiplex</DialogTitle>
          <DialogDescription className="max-w-prose text-sm leading-relaxed">
            Fast login with Google or continue with email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
        <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
          <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted p-1">
            <TabsTrigger value="signin" disabled={isBusy}>Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            {hasUsableGoogleClientId ? (
              <div className="w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={isBusy}
                >
                  {isGoogleSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    "Continue with Google"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button type="button" variant="outline" className="w-full" disabled>
                  Google Sign-In not configured
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Set a valid <strong>VITE_GOOGLE_CLIENT_ID</strong> in .env and add <strong>{currentOrigin}</strong> to Authorized JavaScript origins in Google Cloud.
                </p>
              </div>
            )}
          </div>

          <TabsContent value="signin" className="mt-4">
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="captain@nautiplex.com"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  disabled={isSignInSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  disabled={isSignInSubmitting}
                  required
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                  className="mt-0.5"
                  disabled={isBusy}
                />
                <div className="space-y-1">
                  <Label htmlFor="remember-me" className="cursor-pointer text-sm font-medium">
                    Remember me for 30 days
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Keep this device signed in by storing the refresh token locally.
                  </p>
                </div>
              </div>

              {errorMessage && <p className="text-sm text-destructive" aria-live="polite">{errorMessage}</p>}

              <Button type="submit" className="w-full gap-2 bg-gradient-accent text-accent-foreground" disabled={isBusy}>
                {isSignInSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Login with Email
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form className="space-y-4" onSubmit={handleSignUp}>
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Captain Marina"
                  value={signUpName}
                  onChange={(event) => setSignUpName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="captain@nautiplex.com"
                  value={signUpEmail}
                  onChange={(event) => setSignUpEmail(event.target.value)}
                  disabled={isSignUpSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={signUpPassword}
                  onChange={(event) => setSignUpPassword(event.target.value)}
                  minLength={8}
                  disabled={isSignUpSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password-confirm">Confirm Password</Label>
                <Input
                  id="signup-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={signUpPasswordConfirm}
                  onChange={(event) => setSignUpPasswordConfirm(event.target.value)}
                  minLength={8}
                  disabled={isSignUpSubmitting}
                  required
                />
              </div>

              {errorMessage && <p className="text-sm text-destructive" aria-live="polite">{errorMessage}</p>}

              <Button type="submit" className="w-full gap-2 bg-gradient-accent text-accent-foreground" disabled={isBusy}>
                {isSignUpSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Create Email Account
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;