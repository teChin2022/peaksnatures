import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env vars are missing, fail closed in production — block protected routes
  if (!supabaseUrl || !supabaseAnonKey) {
    if (request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/admin")) {
      return new NextResponse("Service unavailable — authentication not configured", { status: 503 });
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) {
      user = data.user;
    }
  } catch {
    // If Supabase is unreachable, treat as unauthenticated
    user = null;
  }

  // Protect /admin/* (except /admin/login) — redirect to /admin/login if not authenticated
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isAdminLogin = request.nextUrl.pathname === "/admin/login";

  if (isAdminRoute && !isAdminLogin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from /admin/login
  if (isAdminLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  // Protect /dashboard — redirect to /login if not authenticated
  if (request.nextUrl.pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect pending hosts to /dashboard/pending, and approved hosts away from it
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isPendingPage = request.nextUrl.pathname === "/dashboard/pending";

  if (isDashboard && user) {
    const HOST_STATUS_COOKIE = "x-host-status";
    const HOST_STATUS_MAX_AGE = 300; // 5 minutes
    // The cached value is "<userId>:<status>": owner and staff often share the
    // front-desk computer, and one login's status must not carry over to the next.
    const cached = request.cookies.get(HOST_STATUS_COOKIE)?.value;
    const cachedStatus = cached?.startsWith(`${user.id}:`) ? cached.slice(user.id.length + 1) : undefined;

    let status: string | undefined = cachedStatus;
    const setStatusCookie = (res: NextResponse, value: string) =>
      res.cookies.set(HOST_STATUS_COOKIE, `${user.id}:${value}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: HOST_STATUS_MAX_AGE,
        path: "/dashboard",
      });

    // Only query DB if no cached status
    if (!cachedStatus) {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey && supabaseUrl) {
        try {
          const sc = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { data: host } = await sc
            .from("hosts")
            .select("status")
            .eq("user_id", user.id)
            .single();
          status = (host as { status: string } | null)?.status;

          // A staff login (migration 081) has no hosts row of its own.
          if (!status) {
            const { data: staff } = await sc
              .from("host_staff")
              .select("id")
              .eq("user_id", user.id)
              .maybeSingle();
            if (staff) status = "staff";
          }

          // Cache the status on the response cookie
          if (status) setStatusCookie(supabaseResponse, status);
        } catch {
          // If check fails, allow through — don't block approved hosts
        }
      }
    }

    // Team, billing, wallet and the owner's profile are the owner's. Their routes
    // and RLS refuse staff anyway; this just keeps staff off pages that cannot load.
    const path = request.nextUrl.pathname;
    const ownerOnly = ["/dashboard/team", "/dashboard/billing", "/dashboard/wallet", "/dashboard/profile"].some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
    if (status === "staff" && ownerOnly) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const redirect = NextResponse.redirect(url);
      setStatusCookie(redirect, status);
      return redirect;
    }

    if (status === "pending" && !isPendingPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/pending";
      const redirect = NextResponse.redirect(url);
      setStatusCookie(redirect, "pending");
      return redirect;
    }
    if (status && status !== "pending" && isPendingPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const redirect = NextResponse.redirect(url);
      setStatusCookie(redirect, status);
      return redirect;
    }
  }

  // Redirect authenticated users away from /login and /register (but not admin users)
  if (
    user &&
    !isAdminRoute &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/register")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register", "/forgot-password", "/reset-password"],
};
