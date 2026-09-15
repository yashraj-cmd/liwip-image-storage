import { redirect } from "next/navigation";
import { accessConfigured, auth, isAllowed } from "@/auth";
import { LoginForm } from "@/components/login/LoginForm";
import { MASTER_FOLDER_NAME } from "@/lib/storage";

const ERRORS: Record<string, string> = {
  AccessDenied: "That address is not on the access list for this library.",
  Configuration: "Sign-in is not configured yet. Check the server settings.",
  Verification: "That code has expired. Ask for a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (isAllowed(session?.user?.email)) redirect("/");

  const { error, callbackUrl } = await searchParams;
  const message = error ? (ERRORS[error] ?? "Could not sign you in. Try again.") : null;

  return (
    <div className="bg-background grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-96">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/liwip-logo.png" alt="" className="size-5 object-contain" />
          <span className="text-[14px] font-medium tracking-tight">Liwip</span>
          <span className="text-muted-foreground ml-auto text-[10px] tracking-[0.18em] uppercase">
            SKU
          </span>
        </div>

        <div className="bg-card ring-foreground/10 mt-4 p-4 ring-1">
          <h1 className="text-[14px] font-medium tracking-tight">
            {MASTER_FOLDER_NAME}
          </h1>
          <p className="text-muted-foreground mt-1 text-[12px] leading-5">
            We will email you a six digit code to open the image library.
          </p>

          {message && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mt-3 border px-3 py-2 text-[12px] leading-5">
              {message}
            </div>
          )}

          {!accessConfigured && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mt-3 border px-3 py-2 text-[12px] leading-5">
              No access list is configured, so nobody can sign in. Set
              AUTH_ALLOWED_EMAILS or AUTH_ALLOWED_DOMAINS on the server.
            </div>
          )}

          <div className="mt-4">
            <LoginForm callbackUrl={callbackUrl || "/"} />
          </div>
        </div>

        <p className="text-muted-foreground mt-3 text-[12px]">
          Access is limited to approved Liwip accounts.
        </p>
      </div>
    </div>
  );
}
