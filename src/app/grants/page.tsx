import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GrantsIndexRedirect({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const params = new URLSearchParams({ lane: "grants" });
  if (searchParams.filter) params.set("filter", searchParams.filter);
  redirect(`/intel?${params.toString()}`);
}
