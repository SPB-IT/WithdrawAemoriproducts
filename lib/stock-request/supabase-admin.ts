import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';

// Service-role client for the stock_request schema. Server only — never import from client code.
let cached: SupabaseClient<any, 'stock_request'> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

export function getServiceClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ApiError(503, 'SR_NOT_CONFIGURED', 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached = createClient<any, 'stock_request'>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'stock_request' },
  });
  return cached;
}
