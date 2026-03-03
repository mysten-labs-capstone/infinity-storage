import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Loader2,
  Clock,
  CalendarPlus,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import { getBalance, clearBalanceCache } from "../services/balanceService";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ExtendDurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blobId: string;
  fileName: string;
  fileSize: number;
  currentEpochs?: number;
  onSuccess: () => void;
}

interface ExtensionCostInfo {
  costUSD: number;
  costSUI: number;
  additionalDays: number;
  additionalEpochs: number;
}

export function ExtendDurationDialog({
  open,
  onOpenChange,
  blobId,
  fileName,
  fileSize,
  currentEpochs = 3,
  onSuccess,
}: ExtendDurationDialogProps) {
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<ExtensionCostInfo | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpochs, setSelectedEpochs] = useState<number>(3);
  const [tempEpochs, setTempEpochs] = useState<number>(3);
  const [tempDays, setTempDays] = useState<string>("0");
  const [isEditingDays, setIsEditingDays] = useState(false);
  const user = authService.getCurrentUser();
  const navigate = useNavigate();
  const daysPerEpoch = useDaysPerEpoch();
  const epochDays = daysPerEpoch || 14;
  const maxAdditionalEpochs = Math.max(0, 53 - currentEpochs);
  const maxAdditionalDays = maxAdditionalEpochs * epochDays;
  const extensionDisabled = maxAdditionalEpochs === 0;
  const tempDaysNum = Number(tempDays);
  const isValidDays =
    !extensionDisabled &&
    tempDays !== "" &&
    Number.isFinite(tempDaysNum) &&
    tempDaysNum >= 0 &&
    tempDaysNum <= maxAdditionalDays;

  // Check for insufficient balance
  const hasInsufficientFunds =
    !loadingCost && !loadingBalance && cost && balance < cost.costUSD;

  useEffect(() => {
    if (open) {
      if (maxAdditionalEpochs === 0) {
        setSelectedEpochs(0);
        setTempEpochs(0);
        setTempDays("0");
        return;
      }
      if (selectedEpochs > maxAdditionalEpochs) {
        setSelectedEpochs(maxAdditionalEpochs);
      }
      setTempEpochs(selectedEpochs);
      if (!isEditingDays) {
        setTempDays(String(selectedEpochs * epochDays));
      }
    }
  }, [open, selectedEpochs, maxAdditionalEpochs, epochDays, isEditingDays]);

  const fetchCost = async () => {
    if (!user) return;
    if (extensionDisabled) {
      setCost(null);
      return;
    }
    if (selectedEpochs <= 0) {
      setCost(null);
      return;
    }

    setLoadingCost(true);
    setError(null);

    try {
      // Call the cost preview endpoint
      const costResponse = await fetch(
        apiUrl("/api/payment/extend-duration-cost"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize,
            additionalEpochs: selectedEpochs,
          }),
        },
      );

      if (!costResponse.ok) {
        throw new Error("Failed to calculate cost");
      }

      const costData = await costResponse.json();

      setCost({
        costUSD: costData.costUSD,
        costSUI: costData.costSUI,
        additionalDays: selectedEpochs * daysPerEpoch,
        additionalEpochs: selectedEpochs,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load cost information");
    } finally {
      setLoadingCost(false);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;

    setLoadingBalance(true);
    setError(null);

    try {
      const balanceValue = await getBalance(user.id);
      setBalance(balanceValue || 0);
    } catch (err: any) {
      setError(err.message || "Failed to fetch balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      fetchBalance();
    }
  }, [open]);

  useEffect(() => {
    if (open && !extensionDisabled) {
      fetchCost();
    }
  }, [open, selectedEpochs, extensionDisabled]);

  const handleExtend = async () => {
    if (!user || !cost) return;

    // Check if user has sufficient balance
    if (balance < cost.costUSD) {
      setError("Insufficient balance. Please add funds to your account.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/payment/extend-duration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          blobId,
          additionalEpochs: selectedEpochs,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to extend storage duration");
      }

      const data = await response.json();

      // Update balance
      setBalance(data.newBalance);

      // Clear balance cache and refresh transactions after payment
      clearBalanceCache();
      window.dispatchEvent(new Event("transactions:updated"));

      // Call success callback
      onSuccess();

      // Close dialog
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to extend storage duration");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3 pb-2">
          <DialogTitle className="flex items-center gap-3 heading font-bold text-white">
            Extend Storage Duration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pb-6">
          {/* File Info - Simplified */}
          <div className="flex items-start gap-4 p-4 rounded-2xl border border-emerald-500/20">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <CalendarPlus className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{fileName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatBytes(fileSize)}
              </p>
            </div>
          </div>

          {/* Extension Duration with Custom Slider */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-white">Extension Duration</p>
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
                      width: `${((tempDaysNum || 0) / maxAdditionalDays) * 100}%`,
                    }}
                  />

                  {/* Styled range input */}
                  <input
                    type="range"
                    min="0"
                    max={maxAdditionalDays}
                    value={tempDaysNum || 0}
                    onChange={(e) => {
                      if (maxAdditionalEpochs === 0) {
                        return;
                      }
                      const value = e.target.value;
                      setTempDays(value);
                      const rawDays = Number(value);
                      const epochs =
                        rawDays <= 0
                          ? 0
                          : Math.min(
                              maxAdditionalEpochs,
                              Math.max(1, Math.ceil(rawDays / epochDays)),
                            );
                      setTempEpochs(epochs);
                      setSelectedEpochs(epochs);
                    }}
                    className="relative w-full h-2 bg-transparent appearance-none cursor-pointer z-10"
                    style={{
                      WebkitAppearance: "none",
                    }}
                    disabled={maxAdditionalEpochs === 0}
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
                    onFocus={() => setIsEditingDays(true)}
                    onChange={(e) => {
                      if (maxAdditionalEpochs === 0) {
                        return;
                      }
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
                      if (num >= 0 && num <= maxAdditionalDays) {
                        const epochs =
                          num <= 0
                            ? 0
                            : Math.min(
                                maxAdditionalEpochs,
                                Math.max(1, Math.ceil(num / epochDays)),
                              );
                        setTempEpochs(epochs);
                        setSelectedEpochs(epochs);
                      }
                    }}
                    onBlur={() => {
                      setIsEditingDays(false);
                      if (maxAdditionalEpochs === 0) {
                        return;
                      }
                      if (
                        tempDays === "" ||
                        tempDaysNum < 0 ||
                        tempDaysNum > maxAdditionalDays
                      ) {
                        const clampedDays = Math.min(
                          maxAdditionalDays,
                          Math.max(0, tempDaysNum || 0),
                        );
                        setTempDays(String(clampedDays));
                        const epochs =
                          clampedDays <= 0
                            ? 0
                            : Math.min(
                                maxAdditionalEpochs,
                                Math.max(1, Math.ceil(clampedDays / epochDays)),
                              );
                        setTempEpochs(epochs);
                        setSelectedEpochs(epochs);
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
                    min="0"
                    max={String(maxAdditionalDays)}
                    disabled={maxAdditionalEpochs === 0}
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

              {/* Max Storage Warning */}
              {maxAdditionalEpochs === 0 && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-400">
                      Maximum storage duration reached (53 epochs).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cost Breakdown - Modern Card */}
          <div className="rounded-2xl border border-emerald-500/20 p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Extension Cost</span>
                <div className="text-right min-h-[52px] flex flex-col justify-center">
                  {loadingCost ? (
                    <div className="flex items-center justify-end h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 leading-tight">
                        ${cost?.costUSD?.toFixed(2) ?? "0.00"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ≈ {cost?.costSUI?.toFixed(3) ?? "0.000"} SUI
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
                  {loadingBalance ? (
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
                  <span className="text-gray-400">After Extension</span>
                  <Wallet className="h-4 w-4 text-gray-500" />
                </div>
                <div className="min-w-[60px] text-right">
                  {loadingBalance || loadingCost ? (
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
          {error && !extensionDisabled && (
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
          {!loadingCost &&
            !loadingBalance &&
            cost &&
            balance < cost.costUSD && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-300">
                      Insufficient Balance
                    </p>
                    <p className="text-sm text-red-400 mt-1">
                      You need ${cost.costUSD.toFixed(2)} but only have $
                      {balance.toFixed(2)}.
                    </p>
                  </div>
                </div>
              </div>
            )}
        </div>

        <DialogFooter className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
            className="flex-1 border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-white h-11"
          >
            Cancel
          </Button>
          {hasInsufficientFunds ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate("/payment");
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-500/25 h-11 transition-all"
            >
              Add Funds
            </Button>
          ) : (
            <Button
              onClick={handleExtend}
              disabled={
                loadingCost ||
                loadingBalance ||
                processing ||
                extensionDisabled ||
                !isValidDays ||
                selectedEpochs === 0 ||
                !cost
              }
              className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-semibold shadow-lg shadow-emerald-500/25 h-11 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Extend Storage
                </span>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
