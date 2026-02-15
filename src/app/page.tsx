import Link from "next/link";
import {
  Mountain,
  TreePine,
  Waves,
  MapPin,
  Users,
  Search,
  Shield,
  FileText,
  Mail,
  Clock,
  MessageCircle,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/language-switcher";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay } from "@/types/database";

export default async function Home() {
  const supabase = createServiceRoleClient();
  const { data: homestayRows } = await supabase
    .from("homestays")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const HOMESTAYS = (homestayRows as unknown as Homestay[]) || [];

  const t = await getTranslations("home");
  const tc = await getTranslations("common");

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mountain className="h-6 w-6 text-green-600" />
            <span className="text-xl font-bold text-green-800">
              {tc("brand")}
            </span>
          </Link>
          <nav className="flex items-center gap-4 md:gap-6">
            <Link
              href="#homestays"
              className="hidden text-sm font-medium text-gray-600 hover:text-green-700 md:block"
            >
              {t("featured")}
            </Link>
            <Link
              href="#about"
              className="hidden text-sm font-medium text-gray-600 hover:text-green-700 md:block"
            >
              {t("whyTitle")}
            </Link>
            <LanguageSwitcher />
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">{tc("hostLogin")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="secondary"
              className="mb-4 bg-green-100 text-green-700"
            >
              <TreePine className="mr-1 h-3 w-3" /> {t("badge")}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
              {t("title")}{" "}
              <span className="text-green-600">{t("titleHighlight")}</span>
            </h1>
            <p className="mt-4 text-lg text-gray-600 sm:text-xl">
              {t("subtitle")}
            </p>

            {/* Search Bar */}
            <div className="mt-8 flex items-center gap-2 rounded-full border bg-white p-2 shadow-lg sm:mx-auto sm:max-w-lg">
              <Search className="ml-3 h-5 w-5 shrink-0 text-gray-400" />
              <Input
                placeholder={t("searchPlaceholder")}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button className="rounded-full bg-green-600 hover:bg-green-700">
                {tc("search")}
              </Button>
            </div>
          </div>
        </div>

        {/* Decorative */}
        <div className="absolute -bottom-1 left-0 right-0">
          <svg viewBox="0 0 1440 60" className="w-full text-white">
            <path
              fill="currentColor"
              d="M0,32L80,37.3C160,43,320,53,480,53.3C640,53,800,43,960,37.3C1120,32,1280,32,1360,32L1440,32L1440,64L1360,64C1280,64,1120,64,960,64C800,64,640,64,480,64C320,64,160,64,80,64L0,64Z"
            />
          </svg>
        </div>
      </section>

      {/* Features */}
      <section className="py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:grid-cols-3 sm:px-6">
          {[
            {
              icon: Mountain,
              title: t("featureMountain"),
              desc: t("featureMountainDesc"),
            },
            {
              icon: Waves,
              title: t("featureRiver"),
              desc: t("featureRiverDesc"),
            },
            {
              icon: TreePine,
              title: t("featureForest"),
              desc: t("featureForestDesc"),
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-4 rounded-xl border p-5"
            >
              <div className="rounded-lg bg-green-100 p-2.5">
                <f.icon className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Homestay Grid */}
      <section id="homestays" className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {t("featured")}
          </h2>
          <p className="mt-2 text-gray-600">
            {t("featuredSub")}
          </p>

          {HOMESTAYS.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {HOMESTAYS.map((h) => (
                <Link key={h.slug} href={`/${h.slug}`}>
                  <Card className="group overflow-hidden border transition-shadow hover:shadow-lg">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={h.hero_image_url || "/placeholder.svg"}
                        alt={h.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute right-3 top-3">
                        <Badge className="bg-white/90 text-gray-900 backdrop-blur-sm">
                          ฿{h.price_per_night.toLocaleString()}{tc("perNight")}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-gray-900">{h.name}</h3>
                      <p className="mt-0.5 text-sm italic text-gray-500">
                        {h.tagline}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {h.location}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-end">
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Users className="h-3.5 w-3.5" />
                          {t("upTo")} {h.max_guests}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {h.amenities.slice(0, 3).map((a) => (
                          <Badge
                            key={a}
                            variant="secondary"
                            className="text-xs"
                          >
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
              <Mountain className="h-12 w-12 text-gray-300" />
              <p className="mt-4 text-lg font-medium text-gray-500">
                No homestays listed yet
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Check back soon — new properties are being added.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section
        id="about"
        className="border-t bg-gradient-to-b from-green-50 to-white py-16"
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {t("whyTitle")}
          </h2>
          <p className="mt-4 text-gray-600">
            {t("whyText")}
          </p>
        </div>
      </section>

      {/* Privacy Policy */}
      <section id="privacy" className="border-t py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2.5">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{t("policyTitle")}</h2>
          </div>
          <p className="mt-4 text-gray-600">{t("policyIntro")}</p>
          <ul className="mt-4 space-y-3">
            {[t("policy1"), t("policy2"), t("policy3"), t("policy4")].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{i + 1}</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Terms & Conditions */}
      <section id="terms" className="border-t bg-gray-50 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2.5">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{t("termsTitle")}</h2>
          </div>
          <p className="mt-4 text-gray-600">{t("termsIntro")}</p>
          <ul className="mt-4 space-y-3">
            {[t("terms1"), t("terms2"), t("terms3"), t("terms4"), t("terms5")].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{i + 1}</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="border-t py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2.5">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{t("contactTitle")}</h2>
          </div>
          <p className="mt-4 text-gray-600">{t("contactIntro")}</p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{t("contactEmail")}</p>
                  <p className="text-sm text-gray-500">{t("contactEmailValue")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{t("contactLine")}</p>
                  <p className="text-sm text-gray-500">{t("contactLineValue")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{t("contactHours")}</p>
                  <p className="text-sm text-gray-500">{t("contactHoursValue")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center text-sm text-gray-500 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Mountain className="h-4 w-4 text-green-600" />
            <span>{tc("copyright")}</span>
          </div>
          <div className="flex gap-4">
            <Link href="#privacy" className="hover:text-green-700">
              {tc("privacy")}
            </Link>
            <Link href="#terms" className="hover:text-green-700">
              {tc("terms")}
            </Link>
            <Link href="#contact" className="hover:text-green-700">
              {tc("contact")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
