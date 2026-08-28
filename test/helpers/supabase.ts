import { vi } from "vitest";

/** What a query resolves to. Mirrors the `{ data, error }` shape supabase-js returns. */
export interface QueryResponse {
  data?: unknown;
  error?: unknown;
  count?: number;
}

/** Every chainable filter/modifier supabase-js exposes that this codebase uses. */
const CHAIN_METHODS = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "or", "not",
  "like", "ilike", "contains", "containedBy", "overlaps", "match", "filter",
  "order", "limit", "range", "abortSignal", "returns", "csv", "explain",
] as const;

export interface QueryBuilderMock {
  [key: string]: unknown;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

const settle = (r: QueryResponse) => ({
  data: r.data ?? null,
  error: r.error ?? null,
  ...(r.count === undefined ? {} : { count: r.count }),
});

/**
 * A chainable stand-in for a PostgREST query. Every filter returns the builder,
 * so any call order works, and the builder is thenable so both
 * `await q.select().eq(...)` and `await q.select().eq(...).single()` resolve.
 */
export function createQueryBuilder(response: QueryResponse = {}): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(settle(response)));
  builder.maybeSingle = vi.fn(() => Promise.resolve(settle(response)));
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(settle(response)).then(onFulfilled, onRejected);
  return builder;
}

export interface StorageMockOptions {
  /** The signed URL createSignedUrl() hands back; null models a failure. */
  signedUrl?: string | null;
  uploadError?: unknown;
}

export interface SupabaseMockOptions {
  /**
   * Per-table response. Pass an array to return a different response for each
   * successive `.from(table)` call — useful for routes that read then write.
   */
  tables?: Record<string, QueryResponse | QueryResponse[]>;
  /** Per-RPC-name response. */
  rpc?: Record<string, QueryResponse>;
  /** What `auth.getUser()` resolves to. */
  user?: { id: string } | null;
  authError?: unknown;
  storage?: StorageMockOptions;
  /** What `auth.admin.deleteUser()` reports. */
  deleteUserError?: unknown;
}

export interface SupabaseMock {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    admin: { deleteUser: ReturnType<typeof vi.fn> };
  };
  storage: {
    from: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    createSignedUrl: ReturnType<typeof vi.fn>;
  };
  /** Every `.from()` call in order, for asserting what was queried and written. */
  calls: Array<{ table: string; builder: QueryBuilderMock }>;
  /** The builder for the nth call to `.from(table)` (0-indexed). */
  builderFor: (table: string, index?: number) => QueryBuilderMock;
}

export function createSupabaseMock(options: SupabaseMockOptions = {}): SupabaseMock {
  const {
    tables = {},
    rpc = {},
    user = null,
    authError = null,
    storage = {},
    deleteUserError = null,
  } = options;
  const { signedUrl = "https://storage.test/signed-slip", uploadError = null } = storage;
  const queues = new Map<string, QueryResponse[]>();
  for (const [table, response] of Object.entries(tables)) {
    if (Array.isArray(response)) queues.set(table, [...response]);
  }

  const calls: SupabaseMock["calls"] = [];

  const from = vi.fn((table: string) => {
    const queued = queues.get(table);
    const response = queued ? (queued.shift() ?? {}) : ((tables[table] as QueryResponse) ?? {});
    const builder = createQueryBuilder(response);
    calls.push({ table, builder });
    return builder;
  });

  const upload = vi.fn(() => Promise.resolve({ data: uploadError ? null : { path: "uploaded" }, error: uploadError }));
  const createSignedUrl = vi.fn(() =>
    Promise.resolve({ data: signedUrl === null ? null : { signedUrl }, error: null }),
  );

  return {
    from,
    storage: { from: vi.fn(() => ({ upload, createSignedUrl })), upload, createSignedUrl },
    rpc: vi.fn((name: string) => Promise.resolve(settle(rpc[name] ?? {}))),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user }, error: authError })),
      admin: {
        deleteUser: vi.fn(() => Promise.resolve({ data: null, error: deleteUserError })),
      },
    },
    calls,
    builderFor: (table, index = 0) => {
      const matches = calls.filter((c) => c.table === table);
      const match = matches[index];
      if (!match) throw new Error(`No .from("${table}") call at index ${index} (saw ${matches.length})`);
      return match.builder;
    },
  };
}
