interface HTMLContentProps {
  content: string;
  className?: string;
}

export function HTMLContent({ content, className = "" }: HTMLContentProps) {
  if (!content) return null;

  return (
    <div
      className={`[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_strong]:font-semibold [&_em]:italic [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
