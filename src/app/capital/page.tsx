import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CapitalIndexRedirect({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const params = new URLSearchParams({ lane: "capital" });
  if (searchParams.filter) params.set("filter", searchParams.filter);
  redirect(`/intel?${params.toString()}`);
}
