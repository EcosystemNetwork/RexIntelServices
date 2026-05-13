import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Old standalone /accelerators index — folded into the Intel hub on
// 2026-05-13. Preserve the `filter` query param so existing seed links and
// CTAs continue to land on the right intake view.
export default function AcceleratorsIndexRedirect({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const params = new URLSearchParams({ lane: "accelerators" });
  if (searchParams.filter) params.set("filter", searchParams.filter);
  redirect(`/intel?${params.toString()}`);
}
