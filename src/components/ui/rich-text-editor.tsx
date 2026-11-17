"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Undo,
  Redo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** id of the visible label: the editable area has no accessible name otherwise. */
  ariaLabelledBy?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  className = "",
  ariaLabelledBy,
}: RichTextEditorProps) {
  const t = useTranslations("common");
  const lastEmittedRef = useRef<string>(value || "");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {}),
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:ml-0 [&_p]:my-2",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value || "";
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`rounded-md border border-input focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-earth-200 bg-earth-50 p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("bold") ? "bg-earth-200" : ""
          }`}
          title={t("editorBold")}
          aria-label={t("editorBold")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("italic") ? "bg-earth-200" : ""
          }`}
          title={t("editorItalic")}
          aria-label={t("editorItalic")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-earth-300" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBulletList().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("bulletList") ? "bg-earth-200" : ""
          }`}
          title={t("editorBullets")}
          aria-label={t("editorBullets")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleOrderedList().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("orderedList") ? "bg-earth-200" : ""
          }`}
          title={t("editorNumbered")}
          aria-label={t("editorNumbered")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-earth-300" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().undo().run();
          }}
          disabled={!editor.can().undo()}
          className="h-8 w-8 p-0"
          title={t("editorUndo")}
          aria-label={t("editorUndo")}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().redo().run();
          }}
          disabled={!editor.can().redo()}
          className="h-8 w-8 p-0"
          title={t("editorRedo")}
          aria-label={t("editorRedo")}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      <div 
        className="cursor-text"
        onClick={() => editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
