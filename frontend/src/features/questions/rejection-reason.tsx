/** One wording whether a Reviewer refused it, its Author withdrew it or it was returned from
 * the bank, because all three leave it Rejected and the Question does not say which (ADR-0013). */
export function RejectionReason({ reason }: { reason: string }) {
  return (
    <div className="bg-muted/60 flex flex-col gap-1 rounded-md border px-3 py-2 text-sm">
      <p className="font-medium">Why it was Rejected</p>
      <p className="whitespace-pre-line">{reason}</p>
    </div>
  );
}
