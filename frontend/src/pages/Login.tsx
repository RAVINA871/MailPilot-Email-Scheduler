import { btn, Card } from "../ui";
const errors: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  access_denied: "Google sign-in was cancelled.", invalid_state: "Sign-in session expired or was invalid. Please try again.",
  token_exchange_failed: "Google rejected the sign-in. Check the OAuth client credentials and redirect URI.", profile_failed: "Could not read your Google profile (is your email verified?).", server_error: "Something went wrong during sign-in.",
};
export default function Login() {
  const code = new URLSearchParams(location.search).get("error");
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-emerald-700">MailPilot</h1>
        <p className="mt-1 text-sm text-slate-500">Precision Scheduling. Reliable Delivery.</p>
        {code && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors[code] ?? "Sign-in failed."}</p>}
        <a href="/auth/google" className={`${btn} mt-6 w-full`}>Continue with Google</a>
      </Card>
    </div>
  );
}
