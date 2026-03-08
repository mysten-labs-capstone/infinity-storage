import React from "react";
import { AlertCircle, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface InsufficientFundsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  requiredAmount: number;
  onAddFunds: () => void;
}

export function InsufficientFundsDialog({
  open,
  onOpenChange,
  currentBalance,
  requiredAmount,
  onAddFunds,
}: InsufficientFundsDialogProps) {
  const shortfall = requiredAmount - currentBalance;

  const handleAddFunds = () => {
    onOpenChange(false);
    onAddFunds();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            Insufficient Funds
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            You don't have enough balance to upload this file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm"></div>

        <DialogFooter className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 text-white h-11"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddFunds}
            className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-semibold shadow-lg shadow-emerald-500/25 h-11 transition-all"
          >
            {" "}
            Add Funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
