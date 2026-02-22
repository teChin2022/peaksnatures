"use client";

import { useState, useRef, useCallback } from "react";
import { Search, CalendarDays, Clock, CheckCircle2, XCircle, Loader2, Star, MessageSquare, LogIn, LogOut, Upload, CreditCard, ImageIcon, Camera, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { fmtDateStr } from "@/lib/format-date";
import generatePayload from "promptpay-qr";
import { QRCodeSVG } from "qrcode.react";

interface SearchResult {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  total_price: number;
  amount_paid: number;
  payment_type: string;
  status: string;
  room_name: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  has_review: boolean;
}

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  pending: { color: "bg-yellow-100 text-yellow-700", icon: Clock },
  verified: { color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  confirmed: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { color: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { color: "bg-gray-100 text-gray-500", icon: XCircle },
  completed: { color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
};

interface BookingSearchDialogProps {
  homestayId: string;
  themeColor: string;
  promptpayId?: string;
  hostName?: string;
}

export function BookingSearchDialog({ homestayId, themeColor, promptpayId, hostName }: BookingSearchDialogProps) {
  const t = useTranslations("bookingSearch");
  const tr = useTranslations("reviews");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [payingBalanceId, setPayingBalanceId] = useState<string | null>(null);
  const [balanceSlipFile, setBalanceSlipFile] = useState<File | null>(null);
  const [balanceSlipPreview, setBalanceSlipPreview] = useState<string | null>(null);
  const [submittingBalance, setSubmittingBalance] = useState(false);
  const balanceFileRef = useRef<HTMLInputElement>(null);

  const handleCheckin = async (bookingId: string, guestEmail: string, action: "checkin" | "checkout") => {
    setCheckingIn(bookingId);
    try {
      const res = await fetch("/api/bookings/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, guest_email: guestEmail, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "BALANCE_DUE") {
          // Show pay-remaining flow instead of error
          setPayingBalanceId(bookingId);
          toast.error(t("balanceDueCheckout", { amount: data.balance_due.toLocaleString() }));
        } else {
          toast.error(data.message || data.error || t("noResults"));
        }
      } else {
        if (action === "checkin") {
          toast.success(t("checkedIn"));
          setResults((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, checked_in_at: new Date().toISOString() } : b))
          );
        } else {
          toast.success(t("checkedOut"));
          setResults((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, checked_out_at: new Date().toISOString(), status: "completed" } : b))
          );
        }
      }
    } catch {
      toast.error(t("noResults"));
    } finally {
      setCheckingIn(null);
    }
  };

  const handlePayBalance = async (booking: SearchResult) => {
    if (!balanceSlipFile || !promptpayId) return;
    setSubmittingBalance(true);
    try {
      const balanceDue = booking.total_price - (booking.amount_paid || 0);

      // 1. Verify slip
      const verifyForm = new FormData();
      verifyForm.append("file", balanceSlipFile);
      verifyForm.append("expected_amount", balanceDue.toString());
      verifyForm.append("expected_receiver", promptpayId);

      const verifyRes = await fetch("/api/verify-slip", {
        method: "POST",
        body: verifyForm,
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.status === 409 && verifyData.duplicate) {
        toast.error("This slip has already been used.");
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        setSubmittingBalance(false);
        return;
      }

      if (!verifyData.verified) {
        toast.error(verifyData.message || "Slip verification failed.");
        setBalanceSlipFile(null);
        setBalanceSlipPreview(null);
        setSubmittingBalance(false);
        return;
      }

      // 2. Pay balance
      const payRes = await fetch("/api/bookings/pay-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: booking.id,
          guest_email: booking.guest_email,
          slip_hash: verifyData.slip_hash,
          slip_trans_ref: verifyData.slip_trans_ref || null,
          payment_slip_url: verifyData.payment_slip_url || null,
          easyslip_response: verifyData.easyslip_response || null,
        }),
      });

      if (!payRes.ok) {
        const payData = await payRes.json();
        toast.error(payData.error || "Payment failed.");
        setSubmittingBalance(false);
        return;
      }

      toast.success(t("balancePaid"));
      // Update local state
      setResults((prev) =>
        prev.map((b) =>
          b.id === booking.id
            ? { ...b, amount_paid: b.total_price, payment_type: "full" }
            : b
        )
      );
      setPayingBalanceId(null);
      setBalanceSlipFile(null);
      setBalanceSlipPreview(null);
    } catch {
      toast.error("Payment failed.");
    } finally {
      setSubmittingBalance(false);
    }
  };

  const handleSubmitReview = async (bookingId: string, guestEmail: string) => {
    if (reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
          guest_email: guestEmail,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error(tr("errorAlreadyReviewed"));
      } else if (res.status === 400 && data.error === "BOOKING_NOT_COMPLETED") {
        toast.error(tr("errorBookingNotCompleted"));
      } else if (!res.ok) {
        toast.error(tr("errorSubmit"));
      } else {
        toast.success(tr("reviewSubmitted"));
        // Mark as reviewed in results
        setResults((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, has_review: true } : b))
        );
      }
    } catch {
      toast.error(tr("errorSubmit"));
    } finally {
      setSubmittingReview(false);
      setReviewingBookingId(null);
      setReviewRating(0);
      setReviewHover(0);
      setReviewComment("");
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/bookings/search?query=${encodeURIComponent(query.trim())}&homestay_id=${homestayId}`);
      const data = await res.json();
      setResults(data.bookings || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setSearched(false);
      setReviewingBookingId(null);
      setReviewRating(0);
      setReviewHover(0);
      setReviewComment("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full shadow-sm"
        >
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("searchBooking")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder={t("placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="hover:brightness-90 text-white"
              style={{ backgroundColor: themeColor }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("search")}
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">{t("noResults")}</p>
              </div>
            )}

            {!loading && results.map((booking) => {
              const config = statusConfig[booking.status] || statusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <div
                  key={booking.id}
                  className="rounded-lg border bg-gray-50 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm">
                      {booking.guest_name}
                    </span>
                    <Badge variant="secondary" className={config.color}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {t(`status.${booking.status}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {fmtDateStr(booking.check_in, "d MMM yyyy", locale)} → {fmtDateStr(booking.check_out, "d MMM yyyy", locale)}
                    </span>
                    <span>{booking.room_name}</span>
                    <span className="font-medium" style={{ color: themeColor }}>
                      ฿{booking.total_price.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 break-all">
                    ID: {booking.id}
                  </p>

                  {/* Check-in button: confirmed + not checked in yet */}
                  {booking.status === "confirmed" && !booking.checked_in_at && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <Button
                        size="sm"
                        className="w-full text-white hover:brightness-90"
                        style={{ backgroundColor: themeColor }}
                        onClick={() => handleCheckin(booking.id, booking.guest_email, "checkin")}
                        disabled={checkingIn === booking.id}
                      >
                        {checkingIn === booking.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t("checkIn")}
                      </Button>
                    </div>
                  )}

                  {/* Check-out button: confirmed + checked in + not checked out yet */}
                  {booking.status === "confirmed" && booking.checked_in_at && !booking.checked_out_at && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 mb-2">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {t("checkedIn")}
                      </Badge>

                      {/* Show balance due warning if deposit booking */}
                      {booking.total_price - (booking.amount_paid || 0) > 0 && (
                        <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t("balanceDueCheckout", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                          </div>

                          {/* Pay remaining flow */}
                          {payingBalanceId === booking.id && promptpayId ? (
                            <div className="space-y-2 mt-2">
                              <div className="flex justify-center">
                                <div className="rounded-lg border bg-white p-2">
                                  <QRCodeSVG
                                    value={generatePayload(promptpayId, { amount: booking.total_price - (booking.amount_paid || 0) })}
                                    size={120}
                                    level="M"
                                  />
                                </div>
                              </div>
                              <p className="text-center text-sm font-bold" style={{ color: themeColor }}>
                                ฿{(booking.total_price - (booking.amount_paid || 0)).toLocaleString()}
                              </p>
                              <input
                                ref={balanceFileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  setBalanceSlipFile(f);
                                  setBalanceSlipPreview(f ? URL.createObjectURL(f) : null);
                                }}
                              />
                              {balanceSlipPreview ? (
                                <div className="text-center">
                                  <img src={balanceSlipPreview} alt="Slip" className="mx-auto max-h-32 rounded-lg" />
                                  <Button
                                    size="sm"
                                    className="mt-2 w-full text-white hover:brightness-90"
                                    style={{ backgroundColor: themeColor }}
                                    onClick={() => handlePayBalance(booking)}
                                    disabled={submittingBalance}
                                  >
                                    {submittingBalance ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {t("payRemaining", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => balanceFileRef.current?.click()}
                                >
                                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                                  Upload Transfer Slip
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="w-full text-white hover:brightness-90 mt-1"
                              style={{ backgroundColor: themeColor }}
                              onClick={() => setPayingBalanceId(booking.id)}
                            >
                              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                              {t("payRemaining", { amount: (booking.total_price - (booking.amount_paid || 0)).toLocaleString() })}
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Checkout button — only if fully paid */}
                      {booking.total_price - (booking.amount_paid || 0) <= 0 && (
                        <Button
                          size="sm"
                          className="w-full text-white hover:brightness-90"
                          style={{ backgroundColor: themeColor }}
                          onClick={() => handleCheckin(booking.id, booking.guest_email, "checkout")}
                          disabled={checkingIn === booking.id}
                        >
                          {checkingIn === booking.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogOut className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {t("checkOut")}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Review section for completed bookings */}
                  {booking.status === "completed" && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {booking.has_review ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {tr("reviewed")}
                        </Badge>
                      ) : reviewingBookingId === booking.id ? (
                        <div className="space-y-2">
                          {/* Star rating */}
                          <div>
                            <p className="text-xs font-medium text-gray-700 mb-1">{tr("ratingLabel")}</p>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  className="p-0.5 transition-transform hover:scale-110"
                                  onClick={() => setReviewRating(star)}
                                  onMouseEnter={() => setReviewHover(star)}
                                  onMouseLeave={() => setReviewHover(0)}
                                >
                                  <Star
                                    className="h-5 w-5"
                                    style={{
                                      fill: star <= (reviewHover || reviewRating) ? themeColor : "transparent",
                                      color: star <= (reviewHover || reviewRating) ? themeColor : "#d1d5db",
                                    }}
                                  />
                                </button>
                              ))}
                              {reviewRating === 0 && (
                                <span className="ml-2 text-xs text-gray-400">{tr("tapToRate")}</span>
                              )}
                            </div>
                          </div>
                          {/* Comment */}
                          <Textarea
                            placeholder={tr("commentPlaceholder")}
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setReviewingBookingId(null);
                                setReviewRating(0);
                                setReviewHover(0);
                                setReviewComment("");
                              }}
                            >
                              {t("status.cancelled") || "Cancel"}
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 text-white hover:brightness-90"
                              style={{ backgroundColor: themeColor }}
                              onClick={() => handleSubmitReview(booking.id, booking.guest_email)}
                              disabled={reviewRating === 0 || submittingReview}
                            >
                              {submittingReview ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                tr("submitReview")
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => setReviewingBookingId(booking.id)}
                        >
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                          {tr("writeReview")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
