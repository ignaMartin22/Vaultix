/**
 * Server-side environment (specs/01-arquitectura.md §7), validated once on
 * first use so a misconfigured deploy fails loudly instead of per request.
 * Variables owned by later tasks are optional here and checked with `need()`.
 */
export interface ServerEnv {
  privyAppId: string;
  privyAppSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  sponsorDailyLimit: number;
  criptoyaExchange: string;
  feePayerSecretKey?: string;
  heliusWebhookAuth?: string;
  cronSecret?: string;
  resendApiKey?: string;
  mailFrom?: string;
  arbiterEmail?: string;
}

const REQUIRED = [
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Source = Record<string, string | undefined>;

function optional(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

/** Pure parser, exported for tests. Throws listing every problem at once. */
export function parseServerEnv(source: Source): ServerEnv {
  const problems: string[] = REQUIRED.filter((name) => !optional(source, name)).map(
    (name) => `${name} is missing`,
  );

  const limitRaw = optional(source, "SPONSOR_DAILY_LIMIT") ?? "20";
  const sponsorDailyLimit = Number(limitRaw);
  if (!Number.isInteger(sponsorDailyLimit) || sponsorDailyLimit <= 0) {
    problems.push(`SPONSOR_DAILY_LIMIT must be a positive integer, got "${limitRaw}"`);
  }

  const supabaseUrl = optional(source, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl && !/^https?:\/\//.test(supabaseUrl)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must be an http(s) URL");
  }

  if (problems.length > 0) {
    throw new Error(`Invalid server environment:\n- ${problems.join("\n- ")}`);
  }

  return {
    privyAppId: optional(source, "NEXT_PUBLIC_PRIVY_APP_ID")!,
    privyAppSecret: optional(source, "PRIVY_APP_SECRET")!,
    supabaseUrl: supabaseUrl!,
    supabaseServiceRoleKey: optional(source, "SUPABASE_SERVICE_ROLE_KEY")!,
    sponsorDailyLimit,
    criptoyaExchange: optional(source, "CRIPTOYA_EXCHANGE") ?? "lemoncash",
    feePayerSecretKey: optional(source, "FEE_PAYER_SECRET_KEY"),
    heliusWebhookAuth: optional(source, "HELIUS_WEBHOOK_AUTH"),
    cronSecret: optional(source, "CRON_SECRET"),
    resendApiKey: optional(source, "RESEND_API_KEY"),
    mailFrom: optional(source, "MAIL_FROM"),
    arbiterEmail: optional(source, "ARBITER_EMAIL"),
  };
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** For variables optional at boot but required by a given feature. */
export function need<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined) throw new Error(`Server env "${String(key)}" is required here`);
  return value as NonNullable<ServerEnv[K]>;
}
