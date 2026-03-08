import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

export async function PlatformFooter() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");

  return (
    <footer className="border-t bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-12">
          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t("company")}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/about" className="text-sm text-gray-500 hover:text-green-700">
                  {t("about")}
                </Link>
              </li>
              <li>
                <Link href="/trust-safety" className="text-sm text-gray-500 hover:text-green-700">
                  {t("trustSafety")}
                </Link>
              </li>
              <li>
                <Link href="/legal" className="text-sm text-gray-500 hover:text-green-700">
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
                <Link href="/register" className="text-sm text-gray-500 hover:text-green-700">
                  {t("becomeHost")}
                </Link>
              </li>
              <li>
                <Link href="/host-guidelines" className="text-sm text-gray-500 hover:text-green-700">
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
                <Link href="/#contact" className="text-sm text-gray-500 hover:text-green-700">
                  {t("contact")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 border-t pt-6">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Peaksnature" width={20} height={20} className="h-5 w-5 rounded" />
              <span className="text-sm text-gray-500">
                {`Copyright \u00A9 ${new Date().getFullYear()} ${tc("brand")}. ${tc("copyright")}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
