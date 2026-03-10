import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { apiUrl } from "../config/api";
import "../pages/css/Login.css";

interface RecoveryPhraseBackupProps {
  phrase: string;
  onConfirmed: () => void;
  onBack?: () => void;
}

const PLATFORMS = [
  { id: "macos-arm64", label: "macOS (Apple Silicon)" },
  { id: "macos-x64", label: "macOS (Intel)" },
  { id: "win-x64", label: "Windows" },
  { id: "linux-x64", label: "Linux" },
] as const;

async function downloadRecoveryKit(phrase: string, platformId: string) {
  const phraseText = [
    "SovereignGuard Recovery Phrase",
    "================================",
    "",
    phrase,
    "",
    "Keep this file safe. Anyone with this phrase can recover your files.",
  ].join("\n");

  const res = await fetch(
    apiUrl(`/api/recovery-tools/file-recovery-tool-${platformId}.zip`),
  );
  const toolZipData = await res.arrayBuffer();

  const toolZip = await JSZip.loadAsync(toolZipData);
  const kit = new JSZip();

  // Copy every entry from the tool zip, preserving directory structure
  for (const [path, entry] of Object.entries(toolZip.files)) {
    if (entry.dir) {
      kit.folder(path);
    } else {
      const data = await entry.async("uint8array");
      // Preserve unix permissions (rwxr-xr-x for executables)
      kit.file(path, data, {
        unixPermissions: entry.unixPermissions || undefined,
      });
    }
  }

  kit.file("recovery-phrase.txt", phraseText);

  const blob = await kit.generateAsync({
    type: "blob",
    platform: "UNIX",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recovery-kit-${platformId}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RecoveryPhraseBackup({
  phrase,
  onConfirmed,
  onBack,
}: RecoveryPhraseBackupProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [verificationWords, setVerificationWords] = useState<number[]>([]);
  const [userInputs, setUserInputs] = useState<Record<number, string>>({});
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        toolMenuRef.current &&
        !toolMenuRef.current.contains(e.target as Node)
      ) {
        setToolMenuOpen(false);
      }
    }
    if (toolMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [toolMenuOpen]);

  const words = phrase.split(" ");

  const startVerification = () => {
    // Pick 3 random words to verify
    const indices = new Set<number>();
    while (indices.size < 3) {
      indices.add(Math.floor(Math.random() * words.length));
    }
    setVerificationWords(Array.from(indices).sort((a, b) => a - b));
    setConfirmed(true);
  };

  const handleVerification = () => {
    const correct = verificationWords.every(
      (idx) => userInputs[idx]?.toLowerCase().trim() === words[idx],
    );

    if (correct) {
      setIsCreating(true);
      onConfirmed();
    } else {
      setVerificationFailed(true);
    }
  };

  if (confirmed && verificationWords.length > 0) {
    return (
      <div className="space-y-4">
        <div className="info-box mb-3">
          <p className="text-sm text-gray-300">
            Enter the following words from your recovery phrase to confirm you
            saved it correctly.
          </p>
        </div>

        {verificationWords.map((wordIndex) => (
          <div key={wordIndex} className="form-group">
            <label className="label">Word #{wordIndex + 1}</label>
            <input
              type="text"
              value={userInputs[wordIndex] || ""}
              onChange={(e) =>
                setUserInputs({ ...userInputs, [wordIndex]: e.target.value })
              }
              className="input"
              placeholder=""
              autoComplete="off"
            />
          </div>
        ))}

        {verificationFailed && (
          <p className="status-line status-red">
            The words don't match. Please try again.
          </p>
        )}

        <button
          onClick={handleVerification}
          className="btn btn-gradient liquid-btn w-full"
          disabled={isCreating}
        >
          {isCreating ? "Creating Account..." : "Create Account"}
        </button>

        <div className="link-center back-link-wrapper">
          <button
            type="button"
            onClick={() => {
              setConfirmed(false);
              setUserInputs({});
              setVerificationFailed(false);
            }}
            className="back-link"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="info-box mb-3">
        <div className="text-xs text-gray-300">
          <p className="mb-2" style={{ color: "#d1d5db" }}>
            Save this 12-word phrase — it's the only way to recover files with
            our tool.
          </p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Store it securely and never share it with anyone</li>
            <li>If you lose it, your encrypted files cannot be recovered</li>
          </ul>
        </div>
      </div>

      <div
        className="recovery-phrase-grid"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {words.map((word, idx) => (
          <div key={idx} className="recovery-word-item">
            <span className="recovery-word-number">{idx + 1}.</span>
            <span
              className="recovery-word-input"
              style={{ color: "#e5e7eb", fontFamily: "monospace" }}
            >
              {word}
            </span>
          </div>
        ))}
      </div>

      <div
        ref={toolMenuRef}
        style={{ position: "relative", marginBottom: "0.5rem" }}
      >
        <button
          onClick={() => setToolMenuOpen((o) => !o)}
          className="btn btn-navy liquid-btn w-full"
          disabled={downloading !== null}
        >
          {downloading ? "Preparing Kit…" : "Recovery Kit ▾"}
        </button>
        {toolMenuOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "rgb(17, 24, 39)",
              border: "1px solid rgb(55, 65, 81)",
              borderRadius: "0.5rem",
              overflow: "hidden",
              zIndex: 50,
            }}
          >
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={async () => {
                  setToolMenuOpen(false);
                  setDownloading(p.id);
                  try {
                    await downloadRecoveryKit(phrase, p.id);
                  } finally {
                    setDownloading(null);
                  }
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  color: "#e5e7eb",
                  fontSize: "0.8rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgb(55, 65, 81)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={startVerification}
        className="btn btn-gradient liquid-btn w-full"
      >
        Continue
      </button>

      {onBack && (
        <div className="link-center back-link-wrapper">
          <button type="button" onClick={onBack} className="back-link">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
