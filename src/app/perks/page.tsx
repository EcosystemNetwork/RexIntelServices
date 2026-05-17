import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PerksIndexRedirect({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const params = new URLSearchParams({ lane: "perks" });
  if (searchParams.filter) params.set("filter", searchParams.filter);
  redirect(`/intel?${params.toString()}`);
}
