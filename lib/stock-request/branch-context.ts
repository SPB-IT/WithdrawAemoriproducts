import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { SR_BRANCH_COOKIE } from './constants';
import { ApiError } from './errors';
import { getBranch } from './queries';
import { parseBranchId } from './validation';
import type { Branch } from './types';

// การเลือกสาขาเป็น "บริบทการใช้งาน" ไม่ใช่การยืนยันตัวตน (ตามสเปก) — ทุก API ตรวจว่าสาขามีอยู่จริง
// และอ่าน/เขียนเฉพาะข้อมูลของสาขานั้นเท่านั้น

const ONE_YEAR = 60 * 60 * 24 * 365;

export function readBranchId(request: NextRequest): number | null {
  return parseBranchId(request.cookies.get(SR_BRANCH_COOKIE)?.value);
}

export async function requireBranchContext(request: NextRequest): Promise<Branch> {
  const branchId = readBranchId(request);
  if (!branchId) throw new ApiError(401, 'SR_NO_BRANCH', 'กรุณาเลือกสาขาก่อนใช้งาน');
  const branch = await getBranch(branchId);
  if (!branch) throw new ApiError(404, 'SR_BRANCH_NOT_FOUND', 'ไม่พบสาขาที่เลือก กรุณาเลือกสาขาใหม่');
  return branch;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: ONE_YEAR,
};

export function setBranchCookie(response: NextResponse, branchId: number) {
  response.cookies.set(SR_BRANCH_COOKIE, String(branchId), cookieOptions);
}

export function clearBranchCookies(response: NextResponse) {
  response.cookies.set(SR_BRANCH_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}
