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
import { useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  className = "",
}: RichTextEditorProps) {
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
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[120px] px-3 py-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:ml-0 [&_p]:my-2",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== undefined && value !== null) {
      const currentContent = editor.getHTML();
      if (value !== currentContent) {
        editor.commands.setContent(value || "");
      }
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`rounded-md border border-gray-200 ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("bold") ? "bg-gray-200" : ""
          }`}
          title="Bold"
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
            editor.isActive("italic") ? "bg-gray-200" : ""
          }`}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-gray-300" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBulletList().run();
          }}
          className={`h-8 w-8 p-0 ${
            editor.isActive("bulletList") ? "bg-gray-200" : ""
          }`}
          title="Bullet List"
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
            editor.isActive("orderedList") ? "bg-gray-200" : ""
          }`}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-gray-300" />
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
          title="Undo"
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
          title="Redo"
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
