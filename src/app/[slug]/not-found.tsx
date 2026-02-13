import Link from "next/link";
import { Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <Mountain className="h-12 w-12 text-gray-300" />
      <h1 className="text-2xl font-bold text-gray-900">Homestay Not Found</h1>
      <p className="text-gray-500">
        The homestay you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <Button asChild className="mt-2 bg-green-600 hover:bg-green-700">
        <Link href="/">Browse All Homestays</Link>
      </Button>
    </div>
  );
}
