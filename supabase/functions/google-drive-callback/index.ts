import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = "463347043107-54jf3pf1gm3oqq8h393ratk6jji8rprn.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let appUrl = "";
  let redirectPath = "/cai-dat";

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const callbackUrl = `${supabaseUrl}/functions/v1/google-drive-callback`;
    let userToken = "";

    if (state) {
      try {
        const decoded = JSON.parse(atob(state));
        redirectPath = decoded.redirect || "/cai-dat";
        userToken = decoded.token || "";
        appUrl = decoded.origin || "";
      } catch (e) {
        console.error("State decode error:", e);
      }
    }

    console.log("callback: appUrl=", appUrl, "hasCode=", !!code, "hasToken=", !!userToken, "error=", errorParam);

    if (errorParam || !code) {
      return Response.redirect(`${appUrl}${redirectPath}?drive_error=access_denied`, 302);
    }

    if (!userToken) {
      console.error("No user token in state");
      return Response.redirect(`${appUrl}${redirectPath}?drive_error=no_token`, 302);
    }

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResp.json();
    console.log("token exchange status:", tokenResp.status, "has_access_token:", !!tokenData.access_token, "error:", tokenData.error);

    if (!tokenData.access_token) {
      return Response.redirect(
        `${appUrl}${redirectPath}?drive_error=token_failed&detail=${encodeURIComponent(tokenData.error || "")}`,
        302
      );
    }

    // Get Google user email
    const profileResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResp.json();
    console.log("profile email:", profile.email);

    // Verify JWT with anon key
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(userToken);
    console.log("getUser: userId=", user?.id, "error=", userErr?.message);

    if (userErr || !user) {
      return Response.redirect(`${appUrl}${redirectPath}?drive_error=auth_failed`, 302);
    }

    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const expiryDate = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const { error: upsertErr } = await adminClient.from("google_drive_tokens").upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      token_expiry: expiryDate,
      google_email: profile.email || "",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    console.log("upsert error:", upsertErr?.message);

    if (upsertErr) {
      return Response.redirect(`${appUrl}${redirectPath}?drive_error=save_failed`, 302);
    }

    return Response.redirect(`${appUrl}${redirectPath}?drive_connected=1`, 302);
  } catch (err: any) {
    console.error("google-drive-callback error:", err);
    return Response.redirect(`${appUrl}${redirectPath}?drive_error=server_error`, 302);
  }
});
