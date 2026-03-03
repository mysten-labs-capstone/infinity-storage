import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  AlertCircle,
  Loader2,
  Clock,
  Wallet,
  FileText,
  CalendarClock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import { getBalance } from "../services/balanceService";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface PaymentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File;
  onApprove: (costUSD: number, epochs: number) => void;
  onCancel: () => void;
  onEpochsChange?: (epochs: number) => void;
  epochs?: number;
}

interface CostInfo {
  costUSD: number;
  costSUI: number;
  sizeInMB: string;
  storageDays: number;
}

interface ExpirationInfo {
  expiresAt: string;
  formattedDate: string;
  daysUntilExpiration: number;
  epochs: number;
  epochDays: number;
}

export function PaymentApprovalDialog({
  open,
  onOpenChange,
  file,
  onApprove,
  onCancel,
  onEpochsChange,
  epochs = 3,
}: PaymentApprovalDialogProps) {
  console.log(
    "[PaymentApprovalDialog] Rendered with open:",
    open,
    "file:",
    file?.name,
  );
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<CostInfo | null>(null);
  const [expiration, setExpiration] = useState<ExpirationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(14);
  const [tempDays, setTempDays] = useState<string>("14");
  const [isInitialized, setIsInitialized] = useState(false);
  const daysPerEpoch = useDaysPerEpoch();
  const epochDays = expiration?.epochDays || daysPerEpoch || 14;
  const maxDays = Math.max(1, Math.floor(epochDays * 53));
  const lastFetchedRef = useRef<{ epochs: number; fileSize: number } | null>(
    null,
  );
  const user = authService.getCurrentUser();

  // Calculate epochs from days using the actual epoch duration from the network
  const calculateEpochs = (days: number): number => {
    const clampedDays = Math.max(1, Math.min(days, maxDays));
    return Math.min(53, Math.ceil(clampedDays / epochDays));
  };

  const selectedEpochs = calculateEpochs(selectedDays);
  const tempDaysNum = Number(tempDays) || 0;
  const tempEpochs = tempDaysNum > 0 ? calculateEpochs(tempDaysNum) : 0;
  const isValidDays = tempDaysNum >= 1 && tempDaysNum <= maxDays;
  
  // Check for insufficient balance
  const hasInsufficientFunds = !loading && cost && balance < cost.costUSD;
  const navigate = useNavigate();

  useEffect(() => {
    if (open && file && !isInitialized) {
      const initialEpochs = Math.min(epochs, 53);
      const initialDays = Math.min(initialEpochs * epochDays, maxDays);
      setSelectedDays(initialDays);
      setTempDays(String(initialDays));
      setIsInitialized(true);
      // Reset last fetched when dialog opens
      lastFetchedRef.current = null;
      // Fetch epoch info early to get the correct epoch duration
      fetchEpochInfo();
    } else if (!open) {
      setIsInitialized(false);
      lastFetchedRef.current = null;
    }
  }, [open, file, isInitialized, epochs, epochDays, maxDays]);

  useEffect(() => {
    if (selectedDays > maxDays) {
      setSelectedDays(maxDays);
      setTempDays(String(maxDays));
    }
  }, [maxDays, selectedDays]);

  useEffect(() => {
    if (open && file) {
      // Only fetch if we haven't fetched for this exact state
      if (
        !lastFetchedRef.current ||
        lastFetchedRef.current.epochs !== selectedEpochs ||
        lastFetchedRef.current.fileSize !== file.size
      ) {
        fetchCostAndBalance().then(() => {
          lastFetchedRef.current = {
            epochs: selectedEpochs,
            fileSize: file.size,
          };
        });
      } else {
        // We already have the cost for this state, don't show loading
        setLoading(false);
      }
    }
  }, [open, selectedEpochs, file?.size]);

  const fetchEpochInfo = async () => {
    try {
      console.log(
        "[PaymentDialog] Fetching epoch info from:",
        apiUrl("/api/payment/calculate-expiration"),
      );
      // Fetch epoch info to get the correct epoch duration for the network
      const expirationResponse = await fetch(
        apiUrl("/api/payment/calculate-expiration"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epochs: 1 }),
        },
      );

      if (expirationResponse.ok) {
        const expirationData = await expirationResponse.json();
        console.log("[PaymentDialog] Epoch info received:", expirationData);
        setExpiration(expirationData);
      } else {
        console.error(
          "[PaymentDialog] Failed to fetch epoch info, status:",
          expirationResponse.status,
        );
        const errorText = await expirationResponse.text();
        console.error("[PaymentDialog] Error response:", errorText);
        // Set fallback for testnet (1 day per epoch)
        setExpiration({
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          formattedDate: new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          daysUntilExpiration: 1,
          epochs: 1,
          epochDays: 1, // Testnet default
        });
      }
    } catch (err) {
      console.error("[PaymentDialog] Failed to fetch epoch info:", err);
      // Set fallback for testnet (1 day per epoch)
      setExpiration({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        formattedDate: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        daysUntilExpiration: 1,
        epochs: 1,
        epochDays: 1, // Testnet default
      });
    }
  };

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    setCost(null); // Clear old cost to prevent showing stale data

    try {
      // Fetch cost
      const costResponse = await fetch(apiUrl("/api/payment/get-cost"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileSize: file.size, epochs: selectedEpochs }),
      });

      const costData = await costResponse.json().catch(() => ({}));

      if (!costResponse.ok) {
        const message =
          typeof costData?.error === "string"
            ? costData.error
            : "Failed to calculate cost";
        throw new Error(message);
      }

      // Fetch expiration date for the selected epochs
      const expirationResponse = await fetch(
        apiUrl("/api/payment/calculate-expiration"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epochs: selectedEpochs }),
        },
      );

      let expirationData: ExpirationInfo | null = null;
      if (expirationResponse.ok) {
        expirationData = await expirationResponse.json();
      }

      // Fetch balance
      const balanceValue = await getBalance(user.id);

      setCost({
        costUSD: costData.costUSD,
        costSUI: costData.costSUI,
        sizeInMB: costData.sizeInMB,
        storageDays: costData.storageDays,
      });
      if (expirationData) {
        setExpiration(expirationData);
      }
      setBalance(balanceValue || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load payment information");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !cost || !isValidDays) return;

    // Notify parent of epoch selection
    if (onEpochsChange) {
      onEpochsChange(selectedEpochs);
    }

    // Don't deduct payment yet - just approve and proceed with upload
    // Payment will be deducted by the backend after successful upload
    onOpenChange(false);

    // Small delay to ensure dialog closes before upload starts
    setTimeout(() => {
      onApprove(cost.costUSD, selectedEpochs);
    }, 100);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const handleDialogOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Dialog is closing - treat as cancel
      handleCancel();
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3 pb-2">
          <DialogTitle className="flex items-center gap-3 heading font-bold text-white">
             Upload Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pb-6">
          {/* File Info - Simplified */}
          <div className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-500/20">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <FileText className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatBytes(file.size)}
              </p>
            </div>
          </div>

          {/* Storage Duration with Custom Slider */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-white">Storage Duration</p>
              </div>
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
                      width: `${((tempDaysNum || 1) / maxDays) * 100}%`,
                    }}
                  />

                  {/* Styled range input */}
                  <input
                    type="range"
                    min="1"
                    max={maxDays}
                    value={tempDaysNum || 1}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTempDays(value);
                      setSelectedDays(Number(value));
                    }}
                    className="relative w-full h-2 bg-transparent appearance-none cursor-pointer z-10"
                    style={{
                      WebkitAppearance: "none",
                    }}
                  />

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

                      if (inputValue === "") {
                        setTempDays("");
                        return;
                      }

                      const num = Number(inputValue);
                      if (num < 0) {
                        return;
                      }

                      setTempDays(inputValue);
                      if (num >= 1 && num <= maxDays) {
                        setSelectedDays(num);
                      }
                    }}
                    onBlur={() => {
                      if (
                        tempDays === "" ||
                        tempDaysNum < 1 ||
                        tempDaysNum > maxDays
                      ) {
                        setTempDays(String(selectedDays));
                      }
                    }}
                    onKeyDown={(e) => {
                      // Prevent minus key, 'e', 'E', '+', and '.'
                      if (["-", "e", "E", "+", "."].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className={`w-14 px-2 py-1.5 bg-slate-800/50 border rounded-lg text-center text-lg font-bold text-white focus:outline-none focus:ring-2 transition-all ${
                      isValidDays
                        ? "border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500/20"
                        : "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                    }`}
                    min="1"
                    max={String(maxDays)}
                  />
                  <span className="text-sm text-gray-400 font-medium whitespace-nowrap">
                    days
                  </span>
                </div>
              </div>
              
              {/* Testnet Info */}
              <div className="text-center mt-3">
                <p className="text-xs text-gray-500">
                  Testnet: 1 Epoch = 1 Day
                </p>
              </div>
            </div>
          </div>

          {/* Cost Breakdown - Modern Card */}
          <div className="rounded-2xl border border-emerald-500/20 p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Upload Cost</span>
                <div className="text-right min-h-[52px] flex flex-col justify-center">
                  {loading || !cost ? (
                    <div className="flex items-center justify-end h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 leading-tight">
                        ${cost.costUSD.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ≈ {cost.costSUI.toFixed(3)} SUI
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent -mt-2" />

              <div className="flex items-center justify-between text-sm min-h-[20px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Current Balance</span>
                </div>
                <div className="min-w-[60px] text-right">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400 inline-block" />
                  ) : (
                    <span className="font-semibold text-white">
                      ${balance.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm min-h-[20px]">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">After Upload</span>
                  <Wallet className="h-4 w-4 text-gray-500" />
                </div>
                <div className="min-w-[60px] text-right">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400 inline-block" />
                  ) : (
                    <span className="font-bold text-emerald-400">
                      ${Math.max(0, balance - (cost?.costUSD || 0)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {!loading && error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">Error</p>
                  <p className="text-sm text-red-400 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Insufficient Funds Warning */}
          {hasInsufficientFunds && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-300">Insufficient Balance</p>
                  <p className="text-sm text-red-400 mt-1">
                    You need ${cost.costUSD.toFixed(2)} but only have ${balance.toFixed(2)}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-white h-11"
          >
            Cancel
          </Button>
          {hasInsufficientFunds ? (
            <Button
              onClick={() => {
                onCancel();
                navigate("/payment");
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-500/25 h-11 transition-all"
            >
              Add Funds
            </Button>
          ) : (
            <Button
              onClick={handleApprove}
              disabled={loading || !cost || !isValidDays}
              className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-semibold shadow-lg shadow-emerald-500/25 h-11 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Approve & Upload"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
