import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";

function downloadRecoveryTool(filename: string) {
  window.location.href = apiUrl(`/api/recovery-tools/${filename}`);
}

import {
  deriveKeysFromPassword,
  deriveKeysFromPasswordWithSalt,
  encryptMasterKey,
  decryptMasterKey,
} from "../services/keyDerivation";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Download,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Switch } from "../components/ui/switch";
import { getPasswordStrength } from "../lib/passwordStrength";
import "./css/Profile.css";

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const user = authService.getCurrentUser();

  const [privateKey, setPrivateKey] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Signup-like validation state
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [changeAttempted, setChangeAttempted] = useState(false);
  const [confirmPasswordMessage, setConfirmPasswordMessage] = useState("");

  // Inline current-password error (shown above Change Password, highlighted)
  const [currentPasswordMessage, setCurrentPasswordMessage] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState(false);

  // password strength (zxcvbn — single "strong" requirement)
  const passwordStrength = getPasswordStrength(
    newPassword,
    [user?.username ?? ""].filter(Boolean),
  );
  const isPasswordValid = passwordStrength.isStrong;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Encryption preference state
  const [encryptionEnabled, setEncryptionEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("walrus_encryption_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Save encryption preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(
      "walrus_encryption_enabled",
      JSON.stringify(encryptionEnabled),
    );
  }, [encryptionEnabled]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchPrivateKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const fetchPrivateKey = async () => {
    try {
      setLoading(true);
      setError("");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(
        apiUrl(`/api/auth/profile?userId=${user?.id}`),
        {
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load profile");
      }

      setPrivateKey(data.privateKey);
    } catch (err: any) {
      console.error("[Profile] Failed to load encryption key:", err);
      if (err.name === "AbortError") {
        setError("Request timed out. Please try again.");
      } else {
        setError("Failed to load profile");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch (err) {
      alert("Failed to copy to clipboard");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    // mark attempted so mismatch shows only after submit
    setChangeAttempted(true);
    setPasswordError("");
    setPasswordSuccess("");
    setConfirmPasswordError(false);
    setPasswordInvalidOnSubmit(false);
    setConfirmPasswordMessage("");

    // follow signup flow: check for empty password first
    if (!newPassword.trim()) {
      setPasswordError("Please enter a password");
      return;
    }

    // then check password requirements
    if (!isPasswordValid) {
      setPasswordInvalidOnSubmit(true);
      setPasswordError("Password is not strong enough");
      return;
    }

    // finally check mismatch and mirror signup messaging for confirm
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(true);
      if (!confirmPassword.trim()) {
        setConfirmPasswordMessage("Please confirm your password");
      } else {
        setConfirmPasswordMessage("");
      }
      return;
    }

    try {
      setChangingPassword(true);

      // Check if user has new auth system
      const saltResponse = await fetch(
        apiUrl(
          `/api/auth/get-salt?username=${encodeURIComponent(user?.username || "")}`,
        ),
      );
      const saltData = await saltResponse.json();
      const hasNewAuth = saltData.hasNewAuth;

      let requestBody: any = {
        userId: user?.id,
        oldPassword,
        newPassword,
      };

      // For new auth users, derive keys and re-encrypt master key
      if (hasNewAuth && saltData.salt) {
        try {
          // Derive keys from old password to verify and decrypt master key
          const oldKeys = await deriveKeysFromPasswordWithSalt(
            oldPassword,
            saltData.salt,
          );

          // Fetch encrypted master key from server
          const userResponse = await fetch(
            apiUrl(`/api/auth/get-user?userId=${user?.id}`),
          );

          if (!userResponse.ok) {
            throw new Error("Failed to fetch user data");
          }

          const userData = await userResponse.json();

          if (!userData.encryptedMasterKey) {
            throw new Error("No encrypted master key found");
          }

          // Decrypt master key with old encryption key (will fail if wrong password)
          const masterKey = await decryptMasterKey(
            userData.encryptedMasterKey,
            oldKeys.encKey,
          );

          // Derive new keys from new password
          const newKeys = await deriveKeysFromPassword(newPassword);

          // Re-encrypt master key with new encryption key
          const newEncryptedMasterKey = await encryptMasterKey(
            masterKey,
            newKeys.encKey,
          );

          // Send new auth data to server
          requestBody = {
            userId: user?.id,
            oldPassword,
            newPassword,
            newAuthKey: newKeys.authKey,
            newSalt: newKeys.salt,
            newEncryptedMasterKey,
          };
        } catch (err: any) {
          // If decryption fails, current password is incorrect
          if (err.message?.includes("decrypt")) {
            throw new Error("Current password is incorrect");
          }
          throw err;
        }
      }

      const response = await fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setPasswordSuccess("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[Profile] Password change failed:", err);
      const msg = err.message || "Failed to change password";
      // Map decryption or old-password failures to inline current-password message
      if (
        msg.includes("Current password is incorrect") ||
        msg.includes("Decryption failed")
      ) {
        setCurrentPasswordMessage("Incorrect password. Try again.");
        setCurrentPasswordError(true);
        setPasswordError("");
      } else {
        setPasswordError("Failed to change password");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <AppLayout showHeader={false}>
        <div className="profile-loading-content">
          <div className="text-center">
            <div className="profile-spinner"></div>
            <p className="profile-loading-text">Loading profile...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      <div className="profile-container">
        <div className="profile-content">
          <div className="profile-inner">
            {/* File Recovery Tool Downloads */}
            <div className="profile-header">
              <div className="flex items-center gap-3 mb-4">
                <Download className="w-6 h-6 text-teal-400" />
                <h2 className="text-2xl font-bold text-white">
                  File Recovery Tool
                </h2>
              </div>
              <p className="text-sm text-zinc-400 mb-5">
                Download the standalone recovery tool for your platform. Recover
                your encrypted files using only your 12-word recovery phrase.
              </p>
              <div className="recovery-grid">
                {/* macOS Apple Silicon */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadRecoveryTool("file-recovery-tool-macos-arm64.zip");
                  }}
                  className="recovery-card"
                >
                  <div className="recovery-icon-wrap apple">
                    <svg
                      viewBox="0 0 24 24"
                      className="recovery-icon"
                      fill="currentColor"
                    >
                      <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2a4.44 4.44 0 0 0-3 1.52 4.17 4.17 0 0 0-1 3.09 3.69 3.69 0 0 0 2.94-1.42zm2.52 7.44a4.51 4.51 0 0 1 2.16-3.81 4.66 4.66 0 0 0-3.66-2c-1.56-.16-3.12.95-3.93.95s-2.05-.93-3.37-.9a4.96 4.96 0 0 0-4.18 2.56c-1.8 3.1-.46 7.69 1.27 10.21.87 1.23 1.88 2.61 3.22 2.56 1.3-.05 1.79-.82 3.35-.82s2.01.82 3.37.79c1.39-.02 2.27-1.24 3.11-2.48a10.7 10.7 0 0 0 1.42-2.88 4.37 4.37 0 0 1-2.76-4.18z" />
                    </svg>
                  </div>
                  <div className="recovery-info">
                    <span className="recovery-platform">
                      macOS (Apple Silicon)
                    </span>
                    <span className="recovery-desc">
                      M1 / M2 / M3 / M4 Macs
                    </span>
                  </div>
                  <Download className="recovery-dl-icon" />
                </a>

                {/* macOS Intel */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadRecoveryTool("file-recovery-tool-macos-x64.zip");
                  }}
                  className="recovery-card"
                >
                  <div className="recovery-icon-wrap apple">
                    <svg
                      viewBox="0 0 24 24"
                      className="recovery-icon"
                      fill="currentColor"
                    >
                      <path d="M14.94 5.19A4.38 4.38 0 0 0 16 2a4.44 4.44 0 0 0-3 1.52 4.17 4.17 0 0 0-1 3.09 3.69 3.69 0 0 0 2.94-1.42zm2.52 7.44a4.51 4.51 0 0 1 2.16-3.81 4.66 4.66 0 0 0-3.66-2c-1.56-.16-3.12.95-3.93.95s-2.05-.93-3.37-.9a4.96 4.96 0 0 0-4.18 2.56c-1.8 3.1-.46 7.69 1.27 10.21.87 1.23 1.88 2.61 3.22 2.56 1.3-.05 1.79-.82 3.35-.82s2.01.82 3.37.79c1.39-.02 2.27-1.24 3.11-2.48a10.7 10.7 0 0 0 1.42-2.88 4.37 4.37 0 0 1-2.76-4.18z" />
                    </svg>
                  </div>
                  <div className="recovery-info">
                    <span className="recovery-platform">macOS (Intel)</span>
                    <span className="recovery-desc">
                      Older Intel-based Macs
                    </span>
                  </div>
                  <Download className="recovery-dl-icon" />
                </a>

                {/* Windows */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadRecoveryTool("file-recovery-tool-win-x64.zip");
                  }}
                  className="recovery-card"
                >
                  <div className="recovery-icon-wrap windows">
                    <svg
                      viewBox="0 0 24 24"
                      className="recovery-icon"
                      fill="currentColor"
                    >
                      <path d="M3 5.55l7.36-1v7.1H3V5.55zm0 12.9l7.36 1v-7.1H3v6.1zm8.64-13.84L21 3v8.65h-9.36V4.61zm0 15.08L21 21v-8.65h-9.36v7.34z" />
                    </svg>
                  </div>
                  <div className="recovery-info">
                    <span className="recovery-platform">Windows</span>
                    <span className="recovery-desc">
                      Windows 10 / 11 (64-bit)
                    </span>
                  </div>
                  <Download className="recovery-dl-icon" />
                </a>

                {/* Linux */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadRecoveryTool("file-recovery-tool-linux-x64.zip");
                  }}
                  className="recovery-card"
                >
                  <div className="recovery-icon-wrap linux">
                    <svg
                      viewBox="0 0 24 24"
                      className="recovery-icon"
                      fill="currentColor"
                    >
                      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 0 0-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.2-.868-.146-1.602-.107-2.302.018-.394.036-.774.023-1.14-.018-.354-.068-.866-.27-1.312-.202-.453-.618-.911-1.326-1.084-.489-.11-.633-.6-.897-1.203-.262-.598-.623-1.303-1.372-1.702a2.423 2.423 0 0 0-.317-.151c.017-.334-.025-.803-.09-1.218-.065-.415-.14-.8-.14-1.009-.139-1.534-.6-2.946-1.39-3.879-.4-.462-.9-.801-1.45-.944a2.149 2.149 0 0 0-.58-.081zm-.037.653c.142 0 .28.022.406.063.344.112.672.353.987.727.63.749 1.04 1.995 1.174 3.402v.002c-.002.065.002.156.015.391.019.268.034.51.028.654-.034.044-.07.084-.11.122-.05.056-.06.054-.127 0-.264-.218-.589-.23-.717-.157-.024.013-.057.035-.025.072.13.148.402.18.546.27.012.013-.07.138-.166.132-.097-.004-.23-.106-.323-.175-.248-.146-.522-.085-.607.029-.008.012.032.06.048.058.148-.03.3-.014.448.008.078.016.182.095.186.093.06-.012-.06-.16-.014-.076.045.078.143.186.215.222.107.065.119.044.034.003-.085-.04-.176-.112-.167-.15.005-.018.038-.032.004-.046-.035-.015-.07.002-.062-.012.003-.006.072-.063.068-.063-.07.003-.124.04-.188.07-.064-.03.18-.196.21-.282.007-.018-.06.01-.113.049-.104.078-.186.16-.247.174a.39.39 0 0 1-.118.003c.033-.045.233-.406.275-.466-.002-.003-.007 0-.012.004-.068.078-.27.367-.317.4a.2.2 0 0 1-.048.016 3.857 3.857 0 0 0 .158-.378c.003-.01-.007-.002-.014.005-.089.133-.193.301-.3.376-.023-.15-.003-.378.012-.463a.012.012 0 0 0-.014.002c-.062.128-.105.275-.113.444-.057-.093-.1-.197-.112-.3a.018.018 0 0 0-.014.004c-.025.069-.04.2-.038.308-.048-.065-.093-.263-.086-.338a.012.012 0 0 0-.013-.002c-.103.2-.115.38-.075.526-.17-.117-.323-.385-.38-.525-.002-.003-.007-.001-.009.003.006.147.045.31.096.456-.2-.135-.366-.401-.423-.562-.004-.009-.01-.004-.01.003.052.308.168.601.36.838a9.072 9.072 0 0 0-.127-.044c-.15-.393-.19-1.07-.15-1.71.067-1.121.065-3.009.4-4.215.157-.571.362-1.077.65-1.378.144-.15.322-.25.52-.299.196-.05.41-.054.656-.012.497.084.92.57 1.16.898zM8.22 6.828c.028.068.04.137.048.206-.02-.052-.039-.105-.056-.16a1.005 1.005 0 0 1 .008-.046zm.009.31a2.75 2.75 0 0 0 .06.602c-.17-.397-.285-.784-.345-1.082.02.176.117.336.285.48zM12 8c.285 0 .515.224.515.5 0 .276-.23.5-.515.5a.498.498 0 0 1-.515-.5c0-.276.23-.5.515-.5z" />
                    </svg>
                  </div>
                  <div className="recovery-info">
                    <span className="recovery-platform">Linux</span>
                    <span className="recovery-desc">
                      Ubuntu, Fedora (64-bit)
                    </span>
                  </div>
                  <Download className="recovery-dl-icon" />
                </a>
              </div>
            </div>

            {/* Encryption Settings Section */}
            <div className="password-section">
              <div className="password-section-header">
                {encryptionEnabled ? (
                  <Lock className="password-section-icon text-emerald-400" />
                ) : (
                  <LockOpen className="password-section-icon text-amber-400" />
                )}
                <h2 className="password-section-title">Encryption Settings</h2>
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base text-white mb-1">
                      {encryptionEnabled
                        ? "Encryption Enabled"
                        : "Encryption Disabled"}
                    </h3>
                    <p className="text-sm text-zinc-400">
                      {encryptionEnabled
                        ? "Files will be encrypted before upload for enhanced privacy"
                        : "Files will be uploaded without encryption (faster, but less secure)"}
                    </p>
                  </div>
                  <Switch
                    checked={encryptionEnabled}
                    onCheckedChange={setEncryptionEnabled}
                  />
                </div>
              </div>
            </div>

            {/* Change Password Section */}
            <div className="password-section">
              <div className="password-section-header">
                <Lock className="password-section-icon" />
                <h2 className="password-section-title">Change Password</h2>
              </div>

              {/* Top alert shown when not a current-password inline error */}
              {passwordError && !currentPasswordMessage && (
                <div className="alert-error">
                  <p className="alert-error-text">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="alert-success">
                  <p className="alert-success-text">{passwordSuccess}</p>
                </div>
              )}

              <form
                noValidate
                onSubmit={handlePasswordChange}
                className="password-form"
              >
                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showOldPassword ? "text" : "password"}
                      value={oldPassword}
                      onChange={(e) => {
                        setOldPassword(e.target.value);
                        setPasswordError("");
                        setCurrentPasswordMessage("");
                        setCurrentPasswordError(false);
                      }}
                      className={`form-input ${currentPasswordError ? "border-red-500" : ""}`}
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="input-toggle-button"
                    >
                      {showOldPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordInvalidOnSubmit(false);
                        setPasswordError("");
                        setChangeAttempted(false);
                        setConfirmPasswordError(false);
                      }}
                      className="form-input"
                      placeholder="Enter new password"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="input-toggle-button"
                    >
                      {showNewPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                  <div className="status-line status-neutral space-y-1">
                    <p className="flex items-baseline gap-1.5">
                      <span>Strength:</span>
                      <span className={passwordStrength.color}>
                        {passwordStrength.label}
                      </span>
                    </p>
                    {passwordStrength.warning && (
                      <p className="text-sm opacity-90">
                        {passwordStrength.warning}
                      </p>
                    )}
                    {passwordStrength.suggestion &&
                      !passwordStrength.isStrong && (
                        <p className="text-sm opacity-90">
                          {passwordStrength.suggestion}
                        </p>
                      )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(false);
                        setChangeAttempted(false);
                        setPasswordError("");
                        setConfirmPasswordMessage("");
                      }}
                      className={`form-input ${confirmPasswordError ? "border-red-500" : ""}`}
                      placeholder="Confirm new password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="input-toggle-button"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="input-toggle-icon" />
                      ) : (
                        <Eye className="input-toggle-icon" />
                      )}
                    </button>
                  </div>
                  {confirmPasswordMessage ? (
                    <p className="status-line status-red">
                      {confirmPasswordMessage}
                    </p>
                  ) : (
                    changeAttempted &&
                    confirmPassword.trim() !== "" &&
                    !passwordInvalidOnSubmit &&
                    newPassword !== confirmPassword && (
                      <p className="status-line status-red">
                        Passwords do not match
                      </p>
                    )
                  )}
                </div>

                {currentPasswordMessage && (
                  <p className="status-line status-red">
                    {currentPasswordMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={changingPassword || !isPasswordValid}
                  className="submit-button"
                >
                  {changingPassword
                    ? "Changing Password..."
                    : "Change Password"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
