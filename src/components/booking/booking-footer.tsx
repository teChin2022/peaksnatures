import Image from "next/image";
import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

interface SocialLinks {
  facebook_url?: string | null;
  tiktok_url?: string | null;
  instagram_url?: string | null;
  line_id?: string | null;
}

interface BookingFooterProps {
  homestayName: string;
  logoUrl?: string | null;
  location: string;
  hostName: string;
  socialLinks?: SocialLinks;
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function LineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.864c.35 0 .633.282.633.633 0 .35-.283.633-.633.633H17.91v1.456h1.455c.35 0 .633.283.633.633 0 .35-.283.633-.633.633h-2.089a.634.634 0 01-.633-.633V8.543c0-.35.283-.633.633-.633h2.089c.35 0 .633.283.633.633 0 .35-.283.633-.633.633H17.91v.688h1.455zm-4.625 3.355a.634.634 0 01-.633.633.634.634 0 01-.541-.306l-2.004-2.727v2.4a.634.634 0 01-.633.633.634.634 0 01-.633-.633V8.543a.634.634 0 01.633-.633c.222 0 .42.116.541.306l2.004 2.727v-2.4a.634.634 0 01.633-.633c.35 0 .633.283.633.633v4.676zm-5.975.633a.634.634 0 01-.633-.633V8.543a.634.634 0 011.266 0v4.676c0 .35-.283.633-.633.633zm-2.013 0H4.663a.634.634 0 01-.633-.633V8.543c0-.35.283-.633.633-.633.35 0 .633.283.633.633v4.043h1.456c.35 0 .633.283.633.633 0 .35-.283.633-.633.633zM24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.77.038 1.074l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314z" />
    </svg>
  );
}

const SOCIAL_ICON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full bg-earth-800/60 text-earth-400 transition-all duration-200 hover:bg-brand hover:text-white hover:scale-110";

export function BookingFooter({
  homestayName,
  logoUrl,
  location,
  hostName,
  socialLinks,
}: BookingFooterProps) {
  const tc = useTranslations("common");

  const hasSocials = socialLinks && (
    socialLinks.facebook_url || socialLinks.instagram_url ||
    socialLinks.tiktok_url || socialLinks.line_id
  );

  return (
    <footer className="bg-earth-900">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-earth-600 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Brand + Social cluster */}
        <div className="flex flex-col items-center gap-4 mb-6">
          {/* Logo + Name */}
          <div className="flex flex-col items-center gap-2.5">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={homestayName}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-earth-700"
              />
            )}
            <div className="text-center">
              <h3 className="font-semibold text-earth-50 text-base tracking-wide">
                {homestayName}
              </h3>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-earth-500">
                <MapPin className="h-3 w-3" />
                {location}
              </div>
            </div>
          </div>

          {/* Social icons — tucked right under brand */}
          {hasSocials && (
            <div className="flex items-center gap-2">
              {socialLinks.facebook_url && (
                <a
                  href={socialLinks.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ICON_CLASS}
                  aria-label="Facebook"
                >
                  <FacebookIcon className="h-3.5 w-3.5" />
                </a>
              )}
              {socialLinks.instagram_url && (
                <a
                  href={socialLinks.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ICON_CLASS}
                  aria-label="Instagram"
                >
                  <InstagramIcon className="h-3.5 w-3.5" />
                </a>
              )}
              {socialLinks.tiktok_url && (
                <a
                  href={socialLinks.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ICON_CLASS}
                  aria-label="TikTok"
                >
                  <TikTokIcon className="h-3.5 w-3.5" />
                </a>
              )}
              {socialLinks.line_id && (
                <a
                  href={`https://line.me/R/ti/p/${socialLinks.line_id.replace("@", "%40")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SOCIAL_ICON_CLASS}
                  aria-label="LINE"
                >
                  <LineIcon className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-earth-800 mb-5" />

        {/* Bottom bar: copyright + legal */}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-earth-600">
            {`\u00A9 ${new Date().getFullYear()} ${tc("copyright")}`}
          </p>
          <div className="flex items-center gap-3">
            <a
              href="/legal#privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-earth-500 hover:text-earth-300 transition-colors"
            >
              {tc("privacy")}
            </a>
            <span className="text-xs text-earth-700">|</span>
            <a
              href="/legal#terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-earth-500 hover:text-earth-300 transition-colors"
            >
              {tc("terms")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
