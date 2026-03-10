import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";

interface RenameFolderDialogProps {
  open: boolean;
  onClose: () => void;
  folderId: string;
  currentName: string;
  onRenamed: (folderId: string, newName: string) => void;
}

export default function RenameFolderDialog({
  open,
  onClose,
  folderId,
  currentName,
  onRenamed,
}: RenameFolderDialogProps) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      document.body.style.pointerEvents = "none";
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
    };
  }, [open, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const user = authService.getCurrentUser();
    if (!user?.id) {
      setError("You must be logged in");
      return;
    }

    if (!name.trim()) {
      setError("Folder name is required");
      return;
    }

    if (name.trim() === currentName) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: name.trim() }),
      });

      if (res.ok) {
        onRenamed(folderId, name.trim());
        onClose();
      } else {
        let errorMessage = "Failed to rename folder";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
          } else {
            const text = await res.text();
            errorMessage = text || errorMessage;
          }
        } catch {
          errorMessage = `Failed to rename folder (${res.status} ${res.statusText})`;
        }
        setError(errorMessage);
      }
    } catch (err: any) {
      console.error("Failed to rename folder:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Network error: Unable to connect to server. Please check your connection.",
        );
      } else {
        setError(err.message || "Failed to rename folder");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: "auto" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onClose()}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden border border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <Pencil className="h-5 w-5 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Rename Folder
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-300" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Folder Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder Name"
              autoFocus
              className="w-full bg-zinc-800 border-zinc-700 text-white"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              disabled={loading || !name.trim()}
            >
              {loading ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
