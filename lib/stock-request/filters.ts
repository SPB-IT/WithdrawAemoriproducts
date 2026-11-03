import { STATUS_ORDER } from './constants';
import type { BillStatus } from './types';
import { bangkokDayBoundary, parseBranchId } from './validation';

export function parseBillFilters(params: URLSearchParams) {
  const statuses = (params.get('status') ?? '')
    .split(',')
    .filter((status): status is BillStatus => (STATUS_ORDER as string[]).includes(status));
  return {
    statuses,
    branchId: parseBranchId(params.get('branch')),
    query: (params.get('q') ?? '').trim().toLowerCase(),
    from: bangkokDayBoundary(params.get('from'), false),
    to: bangkokDayBoundary(params.get('to'), true),
  };
}
