import type { Metadata } from "next";
import SubmitForm from "./submit-form";

export const metadata: Metadata = {
  title: "Drop Intel — Rex Intel Services",
  description:
    "Submit a tip, leak, or event to Rex Intel Services. Anonymous submissions accepted. Reviewed by analysts before publication.",
  openGraph: {
    title: "Drop Intel — Rex Intel Services",
    description:
      "Submit a tip, leak, or event to Rex Intel Services. Anonymous submissions accepted.",
    type: "website",
  },
};

export default function SubmitPage() {
  return <SubmitForm />;
}
