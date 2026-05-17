import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FellowshipsIndexRedirect({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const params = new URLSearchParams({ lane: "fellowships" });
  if (searchParams.filter) params.set("filter", searchParams.filter);
  redirect(`/intel?${params.toString()}`);
}
