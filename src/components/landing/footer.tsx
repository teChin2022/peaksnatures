import { Instagram, Facebook, Twitter } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="bg-zinc-100 text-zinc-900 pt-24 pb-12 border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12 mb-24">
          <div className="col-span-2">
            <h2 className="text-3xl font-serif mb-6 text-zinc-900">
              Peaksnature
            </h2>
            <p className="text-zinc-600 max-w-sm mb-8">
              Curating extraordinary stays in the world&apos;s most breathtaking
              natural landscapes.
            </p>
            <div className="flex gap-6">
              <Instagram className="text-zinc-500 hover:text-zinc-900 cursor-pointer transition-colors" />
              <Facebook className="text-zinc-500 hover:text-zinc-900 cursor-pointer transition-colors" />
              <Twitter className="text-zinc-500 hover:text-zinc-900 cursor-pointer transition-colors" />
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-6">
              Explore
            </h4>
            <ul className="space-y-4 text-sm text-zinc-600">
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                All Homestays
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Experiences
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Sustainability
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Journal
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-6">
              Connect
            </h4>
            <ul className="space-y-4 text-sm text-zinc-600">
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Contact Us
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Partner with Us
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                Newsletter
              </li>
              <li className="hover:text-zinc-900 cursor-pointer transition-colors">
                FAQ
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-12 border-t border-zinc-200 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          <p>&copy; {new Date().getFullYear()} PEAKSNATURE. ALL RIGHTS RESERVED.</p>
          <div className="flex gap-8">
            <span className="hover:text-zinc-900 cursor-pointer transition-colors">
              Privacy Policy
            </span>
            <span className="hover:text-zinc-900 cursor-pointer transition-colors">
              Terms of Service
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
