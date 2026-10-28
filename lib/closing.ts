/**
 * Closing statement math. Pure, so the screen and the server agree.
 *
 * Net wire = total loan amount
 *          - construction holdback (kept back, released later as draws)
 *          - lender points (charged on the acquisition only)
 *          - construction reserves
 */

export interface Reserve { label: string; amount: number }

export interface ClosingInput {
  loan_amount: number | string;
  acquisition: number | string;
  construction: number | string;
  lender_points_pct: number | string;
  reserves: Reserve[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function closingFigures(c: ClosingInput) {
  const loanAmount = Number(c.loan_amount) || 0;
  const acquisition = Number(c.acquisition) || 0;
  const construction = Number(c.construction) || 0;
  const pointsPct = Number(c.lender_points_pct) || 0;
  const points = cents(acquisition * pointsPct / 100);
  const reserves = (c.reserves ?? []).map(r => ({ label: r.label, amount: cents(Number(r.amount) || 0) }));
  const reservesTotal = cents(reserves.reduce((s, r) => s + r.amount, 0));
  const netWire = cents(loanAmount - construction - points - reservesTotal);
  return { loanAmount, acquisition, construction, pointsPct, points, reserves, reservesTotal, netWire };
}

/** Keep only reserve rows that say something; amounts as numbers. */
export function cleanReserves(raw: unknown): Reserve[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ label: String(r?.label ?? '').trim(), amount: cents(Number(r?.amount) || 0) }))
    .filter(r => r.label || r.amount);
}
