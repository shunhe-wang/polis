import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { readLegalDocument } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Polis",
};

export default async function PrivacyPage() {
  const content = await readLegalDocument("privacy-policy.md");

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-200">
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
        </div>
        <LegalDocument content={content} />
      </div>
    </main>
  );
}
