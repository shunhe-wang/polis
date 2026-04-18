import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LegalDocumentProps {
  content: string;
}

export function LegalDocument({ content }: LegalDocumentProps) {
  return (
    <div className="legal-markdown rounded-[1.75rem] border border-black/5 bg-white/72 p-6 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
