import { notFound } from 'next/navigation';
import LoanDetail from '@/components/LoanDetail';
import { loadLenderData } from '@/lib/lender-data';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * One loan in the lender portal: the staff loan page in its read-only lender
 * mode. Only loans the lender functions return can be opened; any other id is
 * "not found", whoever asks.
 */
export default async function LenderLoanPage({ params }: { params: { id: string } }) {
  const { loans, draws, payments, allocations } = await loadLenderData();
  const loan = loans.find(l => l.loan_id === params.id);
  if (!loan) notFound();

  return (
    <LoanDetail
      lenderView
      canEdit={false}
      canSend={false}
      summary={{ ...loan, borrower_id: '' }}
      draws={draws.filter(d => d.loan_id === loan.loan_id).map(d => ({ ...d, interest_accrued: null }))}
      payments={payments.filter(p => p.loan_id === loan.loan_id)}
      allocations={allocations.filter(a => a.loan_id === loan.loan_id)}
      fallbackOrder={loans.map(l => ({ id: l.loan_id, label: `${l.loan_number} · ${l.borrower_name}` }))}
      drawRequests={[]}
    />
  );
}
