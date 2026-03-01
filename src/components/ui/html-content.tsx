interface HTMLContentProps {
  content: string;
  className?: string;
}

export function HTMLContent({ content, className = "" }: HTMLContentProps) {
  if (!content) return null;

  return (
    <div
      className={`prose prose-sm max-w-none prose-ul:list-disc prose-ol:list-decimal prose-li:ml-4 prose-strong:font-semibold prose-em:italic ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
