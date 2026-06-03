"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { isValidEmail } from "@/lib/utils";

export function ContactForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [sending, setSending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const emailValue = String(formData.get("email") ?? "");
    if (!isValidEmail(emailValue)) {
      toast.error(t("errorInvalidEmail"));
      return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          subject: formData.get("subject"),
          message: formData.get("message"),
          turnstileToken: turnstileToken || "",
        }),
      });

      if (res.status === 429) {
        toast.error(tc("errorTooManyRequests"));
        return;
      }

      if (res.status === 403) {
        toast.error(tc("errorCaptcha"));
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      toast.success(t("contactFormSuccess"));
      form.reset();
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      onSuccess?.();
    } catch {
      toast.error(t("contactFormError"));
    } finally {
      setSending(false);
    }
  }

  const submitDisabled =
    sending || (!!turnstileSiteKey && !turnstileToken && !turnstileError);

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
      {turnstileSiteKey && (
        <div className="flex justify-start">
          <Turnstile
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            onSuccess={(token) => {
              setTurnstileToken(token);
              setTurnstileError(false);
            }}
            onExpire={() => setTurnstileToken(null)}
            onError={() => {
              setTurnstileToken(null);
              setTurnstileError(true);
            }}
            options={{ theme: "light", size: "normal" }}
          />
        </div>
      )}
      <Button
        type="submit"
        disabled={submitDisabled}
        className="bg-brand hover:bg-brand-hover"
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
