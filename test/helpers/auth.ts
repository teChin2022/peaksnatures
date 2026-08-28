import { vi } from "vitest";
import { createSupabaseMock, type SupabaseMockOptions } from "./supabase";

type Mocked = ReturnType<typeof vi.fn>;

export interface RouteAuthMocks {
  createServerSupabaseClient: Mocked;
  createServiceRoleClient: Mocked;
  isAdmin?: Mocked;
}

/**
 * Wire the identity client (cookie-scoped) and the data client (service role)
 * that ~36 routes use, and say who is calling.
 *
 * Returns the service-role mock so a test can assert what was queried.
 */
export function signIn(
  mocks: RouteAuthMocks,
  options: SupabaseMockOptions & { userId?: string | null; admin?: boolean } = {},
) {
  const { userId = "user-1", admin = true, ...serviceOptions } = options;

  mocks.createServerSupabaseClient.mockResolvedValue(
    createSupabaseMock({ user: userId === null ? null : { id: userId } }),
  );
  mocks.isAdmin?.mockResolvedValue(admin);

  const service = createSupabaseMock(serviceOptions);
  mocks.createServiceRoleClient.mockReturnValue(service);
  return service;
}

/** Nobody is signed in. */
export function signOut(mocks: RouteAuthMocks) {
  mocks.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
  mocks.isAdmin?.mockResolvedValue(false);
}

/** The session lookup itself failed. */
export function sessionError(mocks: RouteAuthMocks) {
  mocks.createServerSupabaseClient.mockResolvedValue(
    createSupabaseMock({ user: null, authError: { message: "session expired" } }),
  );
}
