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
    <div className="grid min-h-dvh place-items-center bg-[#0a0a0a] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/liwip-logo.png" alt="" className="size-8 object-contain" />
            <span className="text-[22px] leading-none font-extrabold tracking-tight text-[#f3ece4]">
              Liwip
            </span>
          </div>
          <p className="pl-[42px] text-[9px] font-medium tracking-[0.28em] text-[#c4b4a4] uppercase">
            Live With Pride.
          </p>
        </div>

        <div className="mt-8 rounded-3xl bg-[#141414] p-7 ring-1 ring-[#2a2a2a]">
          <h1 className="text-[18px] font-medium tracking-tight text-white">
            {MASTER_FOLDER_NAME}
          </h1>
          <p className="mt-1.5 text-[13px] leading-6 text-[#9a9a9a]">
            We will email you a six digit code to open the image library.
          </p>

          {message && (
            <div className="mt-5 rounded-2xl bg-[#2a1212] px-4 py-2.5 text-[13px] leading-6 text-[#f0b4b4]">
              {message}
            </div>
          )}

          {!accessConfigured && (
            <div className="mt-5 rounded-2xl bg-[#2a1212] px-4 py-2.5 text-[13px] leading-6 text-[#f0b4b4]">
              No access list is configured, so nobody can sign in. Set
              AUTH_ALLOWED_EMAILS or AUTH_ALLOWED_DOMAINS on the server.
            </div>
          )}

          <div className="mt-6">
            <LoginForm callbackUrl={callbackUrl || "/"} />
          </div>
        </div>

        <p className="mt-5 px-1 text-[12px] leading-5 text-[#6f6f6f]">
          Access is limited to approved Liwip accounts.
        </p>
      </div>
    </div>
  );
}
