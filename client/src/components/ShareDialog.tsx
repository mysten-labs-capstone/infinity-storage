import { useState } from "react";
import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Calendar,
  Copy,
  Check,
  Link as LinkIcon,
  Clock,
  Share2,
} from "lucide-react";
import { apiUrl } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { authService } from "../services/authService";
import { exportFileKeyForShare } from "../services/crypto";
import { downloadBlob } from "../services/walrusApi";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  blobId: string;
  filename: string;
  encrypted: boolean;
  uploadedAt?: string;
  expiresAt?: string | null;
  epochs?: number;
  onShareCreated?: () => void;
};

export function ShareDialog({
  open,
  onClose,
  blobId,
  filename,
  encrypted,
  uploadedAt,
  expiresAt,
  epochs,
  onShareCreated,
}: ShareDialogProps) {
  const { privateKey } = useAuth();
  const [shareLink, setShareLink] = useState<string>("");
  const [shareKey, setShareKey] = useState<string | null>(null); // base64url file key (if encrypted)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  // QR is always shown after creating a share; default payload is key-only for safety

  // Share options
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [tempDays, setTempDays] = useState<string>("1");
  const daysPerEpoch = useDaysPerEpoch();

  // Compute remaining lifetime for the file (days). Epochs are network-dependent.
  const calculateExpiryInfo = (
    uploadedAt: string | undefined,
    explicitExpiresAt: string | null | undefined,
    epochs: number | undefined,
  ) => {
    if (explicitExpiresAt) {
      const expiryDate = new Date(explicitExpiresAt);
      const now = new Date();
      const daysRemaining = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      return { expiryDate, daysRemaining: Math.max(0, daysRemaining) };
    }

    if (!uploadedAt)
      return { expiryDate: null as Date | null, daysRemaining: Infinity };
    const uploadDate = new Date(uploadedAt);
    const totalDays = (epochs ?? 3) * daysPerEpoch;
    const expiryDate = new Date(
      uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    const daysRemaining = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    return { expiryDate, daysRemaining: Math.max(0, daysRemaining) };
  };

  const { daysRemaining } = calculateExpiryInfo(uploadedAt, expiresAt, epochs);

  // Sync tempDays when dialog opens or state changes
  useEffect(() => {
    if (open) {
      setTempDays(String(expiresInDays || 1));
    }
  }, [open, expiresInDays]);

  const handleCreateShare = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      setError("You must be logged in to share files");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Validate expiration days
      if (expiresInDays !== "" && Number(expiresInDays) < 1) {
        setError("Expiration must be 1 day or greater");
        setLoading(false);
        return;
      }

      // Ensure we don't create a share longer than the file's remaining lifetime
      if (Number.isFinite(daysRemaining) && daysRemaining <= 0) {
        setError("This file has expired on Walrus and cannot be shared");
        setLoading(false);
        return;
      }

      // Create share record on server (NO KEY SENT)
      if (
        expiresInDays !== "" &&
        Number.isFinite(daysRemaining) &&
        Number(expiresInDays) > daysRemaining
      ) {
        setError(
          `Expiration cannot exceed file lifetime (${daysRemaining} days)`,
        );
        setLoading(false);
        return;
      }
      const expiresAt =
        expiresInDays === ""
          ? null
          : new Date(
              Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000,
            ).toISOString();

      const response = await fetch(apiUrl("/api/shares"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobId,
          userId: user.id,
          expiresAt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create share");
      }

      const { shareId } = await response.json();
      const baseUrl = window.location.origin;

      // Notify parent that share was created
      onShareCreated?.();

      // If file is encrypted, download blob, derive key, and append as fragment
      if (encrypted) {
        if (!privateKey)
          throw new Error(
            "Private key required to export file key for encrypted file",
          );

        // Download the encrypted blob to extract fileId and derive key
        const user = authService.getCurrentUser();
        const blobResponse = await downloadBlob(
          blobId,
          privateKey,
          filename,
          user?.id,
          { preferPresignedUrl: false },
        );
        if (!(blobResponse instanceof Response)) {
          throw new Error(
            "Could not prepare encrypted share key from presigned download",
          );
        }
        if (!blobResponse.ok) {
          throw new Error("Failed to download blob for key derivation");
        }
        const blobData = await blobResponse.blob();

        // Export file key from blob using HKDF
        const fileKeyBase64url = await exportFileKeyForShare(
          blobData,
          privateKey,
        );
        const link = `${baseUrl}/s/${shareId}#k=${fileKeyBase64url}`;
        setShareLink(link);
        setShareKey(fileKeyBase64url);

        // Store the file key for later use (when copying link from shared files view)
        try {
          localStorage.setItem(`walrus_share_key:${shareId}`, fileKeyBase64url);
          sessionStorage.setItem(
            `walrus_share_key:${shareId}`,
            fileKeyBase64url,
          );
        } catch (err) {
          console.warn("[ShareDialog] Failed to store share key:", err);
        }

        // Auto-copy to clipboard for smoother UX
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn("[ShareDialog] Auto-copy failed", err);
        }
      } else {
        // Unencrypted file: share link contains no embedded key
        const link = `${baseUrl}/s/${shareId}`;
        setShareLink(link);
        setShareKey(null);
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn("[ShareDialog] Auto-copy failed", err);
        }
      }
    } catch (err: any) {
      console.error("[ShareDialog] Error creating share:", err);
      setError(err.message || "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Generate QR image data URL client-side when possible; fall back to remote QR API
  useEffect(() => {
    let cancelled = false;
    // Prefer the full share link when available so QR scans to the exact link shown to the user.
    const payload = shareLink || (shareKey ? `k=${shareKey}` : "");
    if (!payload) {
      setQrDataUrl(null);
      return;
    }
    const remoteSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      payload,
    )}`;
    // Clear prior data while generating
    setQrDataUrl(null);

    (async () => {
      try {
        const qrcodeMod = await import("qrcode");
        const toDataURL = qrcodeMod.toDataURL || qrcodeMod.default?.toDataURL;
        if (!toDataURL) throw new Error("qrcode.toDataURL not available");
        const dataUrl = await toDataURL(payload, { width: 220, margin: 1 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        if (!cancelled) setQrDataUrl(remoteSrc);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareKey, shareLink]);

  const handleClose = () => {
    setShareLink("");
    setError("");
    setCopied(false);
    setExpiresInDays("");
    setTempDays("1");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3 pb-2">
          <DialogTitle className="flex items-center gap-3 heading font-bold text-white">
            Share File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pb-6">
          {/* File Info Box */}
          <div className="flex items-start gap-4 p-4 rounded-2xl border border-emerald-500/20">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <Share2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{filename}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {Number.isFinite(daysRemaining)
                  ? `Expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`
                  : "No expiration"}
              </p>
            </div>
          </div>

          {!shareLink ? (
            <div className="space-y-4">
              {/* Expiration */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-medium text-white">
                    Link expires in
                  </span>
                </div>

                {/* Custom Themed Slider */}
                <div className="space-y-3 px-1">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative py-2">
                      {/* Background track */}
                      <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded-full bg-slate-800/50" />

                      {/* Progress fill */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-lg shadow-emerald-500/20 pointer-events-none"
                        style={{
                          width: `${(() => {
                            const max = Number.isFinite(daysRemaining)
                              ? daysRemaining
                              : 365;
                            const val = Number(tempDays) || 1;
                            return max <= 1
                              ? 100
                              : ((val - 1) / (max - 1)) * 100;
                          })()}%`,
                        }}
                      />

                      {/* Styled range input */}
                      {Number.isFinite(daysRemaining) && daysRemaining <= 1 ? (
                        /* Static thumb pinned to the right when only 1 day remains */
                        <div className="relative w-full h-2 z-10 flex items-center justify-end">
                          <div
                            style={{
                              width: "20px",
                              height: "20px",
                              minWidth: "20px",
                              minHeight: "20px",
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, #34d399 0%, #14b8a6 100%)",
                              border: "3px solid #0f172a",
                              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)",
                            }}
                          />
                        </div>
                      ) : (
                        <input
                          type="range"
                          min="1"
                          max={
                            Number.isFinite(daysRemaining) ? daysRemaining : 365
                          }
                          value={Number(tempDays) || 1}
                          onChange={(e) => {
                            const value = Math.max(1, Number(e.target.value));
                            setTempDays(String(value));
                            setExpiresInDays(value);
                          }}
                          className="relative w-full h-2 bg-transparent appearance-none cursor-pointer z-10"
                          style={{
                            WebkitAppearance: "none",
                          }}
                        />
                      )}

                      <style>{`
                      input[type="range"]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #34d399 0%, #14b8a6 100%);
                        border: 3px solid #0f172a;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                        cursor: pointer;
                        transition: all 0.15s ease;
                      }
                      
                      input[type="range"]::-webkit-slider-thumb:hover {
                        transform: scale(1.15);
                        box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
                      }
                      
                      input[type="range"]::-webkit-slider-thumb:active {
                        transform: scale(1.05);
                      }
                      
                      input[type="range"]::-moz-range-thumb {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #34d399 0%, #14b8a6 100%);
                        border: 3px solid #0f172a;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                        cursor: pointer;
                        transition: all 0.15s ease;
                      }
                      
                      input[type="range"]::-moz-range-thumb:hover {
                        transform: scale(1.15);
                        box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
                      }
                      
                      input[type="range"]::-moz-range-thumb:active {
                        transform: scale(1.05);
                      }
                      
                      input[type="range"]:focus {
                        outline: none;
                      }
                      
                      /* Hide number input spinner arrows */
                      input[type="number"]::-webkit-inner-spin-button,
                      input[type="number"]::-webkit-outer-spin-button {
                        -webkit-appearance: none;
                        margin: 0;
                      }
                      
                      input[type="number"] {
                        -moz-appearance: textfield;
                      }
                    `}</style>
                    </div>

                    {/* Days input inline with slider */}
                    <div className="flex items-baseline gap-2">
                      <input
                        type="number"
                        value={tempDays}
                        onChange={(e) => {
                          const inputValue = e.target.value;

                          // Prevent negative numbers and dash
                          if (inputValue.includes("-")) {
                            return;
                          }

                          // Allow empty string for deletion
                          if (inputValue === "") {
                            setTempDays("");
                            return;
                          }

                          const num = Number(inputValue);
                          if (num < 0) {
                            return;
                          }

                          setTempDays(inputValue);

                          // Update expiresInDays if valid
                          const maxDays = Number.isFinite(daysRemaining)
                            ? daysRemaining
                            : 365;
                          if (num >= 1 && num <= maxDays) {
                            setExpiresInDays(num);
                          }
                        }}
                        onBlur={() => {
                          // If empty or invalid, default to 1
                          const num = Number(tempDays);
                          const maxDays = Number.isFinite(daysRemaining)
                            ? daysRemaining
                            : 365;

                          if (tempDays === "" || num < 1) {
                            setTempDays("1");
                            setExpiresInDays(1);
                          } else if (num > maxDays) {
                            setTempDays(String(maxDays));
                            setExpiresInDays(maxDays);
                          }
                        }}
                        onKeyDown={(e) => {
                          // Prevent minus key, 'e', 'E', '+', and '.'
                          if (["-", "e", "E", "+", "."].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        className="w-14 px-2 py-1.5 bg-slate-800/50 border border-emerald-500/30 rounded-lg text-center text-lg font-bold text-white focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                        min="1"
                        max={
                          Number.isFinite(daysRemaining)
                            ? String(daysRemaining)
                            : "365"
                        }
                      />
                      <span className="text-sm text-gray-400 font-medium whitespace-nowrap">
                        days
                      </span>
                    </div>
                  </div>
                </div>

                {!Number.isFinite(daysRemaining) || daysRemaining > 0 ? null : (
                  <p className="text-xs text-destructive mt-2">
                    This file has expired on Walrus and cannot be shared.
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="shareLink"
                    className="flex items-center gap-2 text-sm font-medium text-white"
                  >
                    <LinkIcon className="h-4 w-4 text-emerald-400" />
                    Share Link
                  </label>
                  <span className="text-xs text-gray-400">Does not expire</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="shareLink"
                    value={shareLink}
                    readOnly
                    className="font-mono text-xs bg-zinc-800 border-zinc-700 text-white"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyLink}
                    disabled={copied}
                    className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-white shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-300" />
                    )}
                  </Button>
                </div>
                {/* Fixed height container for copy message to prevent layout shift */}
                <div className="min-h-[20px]">
                  {copied && (
                    <p className="text-xs text-emerald-400">
                      Link copied to clipboard
                    </p>
                  )}
                </div>
                {/* QR preview - centered */}
                <div className="flex justify-center mt-6">
                  {(() => {
                    // Use the full share link when present so a scan produces the same URL
                    const qrPayload =
                      shareLink || (shareKey ? `k=${shareKey}` : "");
                    const remoteSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      qrPayload || "",
                    )}`;
                    const imgSrc = qrDataUrl ?? remoteSrc;
                    return (
                      <img
                        src={imgSrc}
                        alt="Share QR"
                        className="w-36 h-36 rounded-md border border-zinc-700 bg-zinc-900 p-2"
                      />
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-3">
          {!shareLink ? (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={
                  loading ||
                  (Number.isFinite(daysRemaining) && daysRemaining <= 0)
                }
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Share Link"}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleClose}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
