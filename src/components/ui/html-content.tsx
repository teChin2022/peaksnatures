import DOMPurify from "isomorphic-dompurify";

interface HTMLContentProps {
  content: string;
  className?: string;
}

const ALLOWED_TAGS = ["p", "strong", "em", "ul", "ol", "li", "br"];
const ALLOWED_ATTR: string[] = [];

export function HTMLContent({ content, className = "" }: HTMLContentProps) {
  if (!content) return null;

  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });

  return (
    <div
      className={`[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_strong]:font-semibold [&_em]:italic [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
