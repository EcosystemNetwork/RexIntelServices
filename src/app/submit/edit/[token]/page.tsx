import { Suspense } from "react";
import EditForm from "./edit-form";

export const dynamic = "force-dynamic";

/**
 * Tokenized edit page. The actual form is a client component since it
 * fetches the current submission, runs controlled inputs, and submits
 * updates. Wrapping in Suspense to satisfy Next's CSR-bailout rule
 * (consistent with /submit's own wrapping pattern).
 */
export default function EditSubmissionPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <Suspense fallback={null}>
      <EditForm token={params.token} />
    </Suspense>
  );
}
