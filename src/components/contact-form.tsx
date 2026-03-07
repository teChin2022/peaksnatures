"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ContactForm() {
  const t = useTranslations("home");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          subject: formData.get("subject"),
          message: formData.get("message"),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      toast.success(t("contactFormSuccess"));
      form.reset();
    } catch {
      toast.error(t("contactFormError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">{t("contactFormName")}</Label>
          <Input
            id="contact-name"
            name="name"
            required
            placeholder={t("contactFormName")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">{t("contactFormEmail")}</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            placeholder={t("contactFormEmail")}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-subject">{t("contactFormSubject")}</Label>
        <Input
          id="contact-subject"
          name="subject"
          required
          placeholder={t("contactFormSubject")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">{t("contactFormMessage")}</Label>
        <Textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          placeholder={t("contactFormMessage")}
        />
      </div>
      <Button
        type="submit"
        disabled={sending}
        className="bg-green-600 hover:bg-green-700"
      >
        {sending ? (
          t("contactFormSending")
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            {t("contactFormSend")}
          </>
        )}
      </Button>
    </form>
  );
}
