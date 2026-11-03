import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  SR_VERSION_CONFLICT: 409,
  SR_ALREADY_BILLED: 409,
  SR_ALREADY_RECEIVED: 409,
  SR_BILL_BUSY: 409,
  SR_ADMIN_FORBIDDEN: 403,
  SR_BILL_NOT_FOUND: 404,
  SR_ITEM_NOT_FOUND: 404,
  SR_ITEM_LOCKED: 409,
  SR_BRANCH_NOT_FOUND: 404,
};

interface PostgrestLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}

/** Convert a Supabase/PostgREST error into ApiError. Errors raised by stock_request.fail() carry an SR_ code. */
export function fromDbError(error: PostgrestLikeError): ApiError {
  const code = error.message ?? '';
  if (code.startsWith('SR_')) {
    return new ApiError(STATUS_BY_CODE[code] ?? 400, code, error.details || 'ข้อมูลไม่ถูกต้อง');
  }
  // PostgrestError fields are not always enumerable, so log them explicitly
  console.error('[stock-request] database error', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  return new ApiError(500, 'SR_DB_ERROR', 'เกิดข้อผิดพลาดกับฐานข้อมูล กรุณาลองใหม่');
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('[stock-request] unexpected error', error);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่', code: 'SR_UNEXPECTED' }, { status: 500 });
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
