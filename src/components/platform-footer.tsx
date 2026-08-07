import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function PlatformFooter() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");

  return (
    <footer className="border-t bg-section-alt">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-12">
          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("company")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/about" className="text-sm text-gray-500 hover:text-brand">
                  {t("about")}
                </Link>
              </li>
              <li>
                <Link href="/trust-safety" className="text-sm text-gray-500 hover:text-brand">
                  {t("trustSafety")}
                </Link>
              </li>
              <li>
                <Link href="/legal" className="text-sm text-gray-500 hover:text-brand">
                  {t("legalPolicies")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Hosts */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("hosts")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/register" className="text-sm text-gray-500 hover:text-brand">
                  {t("becomeHost")}
                </Link>
              </li>
              <li>
                <Link href="/host-guidelines" className="text-sm text-gray-500 hover:text-brand">
                  {t("hostGuidelines")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("support")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/#contact" className="text-sm text-gray-500 hover:text-brand">
                  {t("contact")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 border-t pt-6">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between">
            <span className="text-sm text-gray-500">
              {`\u00A9 ${new Date().getFullYear()} ${tc("brand")}.com ${tc("copyright")}`}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
