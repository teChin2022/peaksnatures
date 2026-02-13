import Link from "next/link";
import { Mountain, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white px-4 text-center">
      <Mountain className="h-16 w-16 text-green-300" />
      <h1 className="mt-6 text-4xl font-bold text-gray-900">404</h1>
      <p className="mt-2 text-lg text-gray-600">
        This page doesn&apos;t exist or has been moved.
      </p>
      <Button asChild className="mt-6 bg-green-600 hover:bg-green-700">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>
      </Button>
    </div>
  );
}
