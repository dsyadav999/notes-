import { useEffect, useState } from "react";
import { signOut, updateProfile } from "firebase/auth";
import {
  auth,
  checkAuthorNameAvailability,
  normalizeAuthorName,
  syncUserAccount,
} from "../firebase";
import AuthLayout from "./AuthLayout.jsx";

export default function CompleteProfile({
  pending,
  onComplete,
  onCancel,
  showToast,
}) {
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = normalizeAuthorName(name);
    if (trimmed.length < 2) {
      setAvailability(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkAuthorNameAvailability(trimmed, pending?.firebaseUser?.uid);
        if (!cancelled) {
          setAvailability(res);
        }
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, pending?.firebaseUser?.uid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !pending?.firebaseUser) return;

    const cleanName = normalizeAuthorName(name);
    if (cleanName.length < 2) {
      setError("Author name must be at least 2 characters.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const check = await checkAuthorNameAvailability(cleanName, pending.firebaseUser.uid);
      if (!check.valid || !check.available) {
        setError(check.message || "This author name is already taken. Choose another name.");
        setAvailability(check);
        setSubmitting(false);
        return;
      }

      await updateProfile(pending.firebaseUser, { displayName: cleanName });
      const syncResult = await syncUserAccount(pending.firebaseUser, cleanName);

      if (syncResult.needsAuthorName) {
        setError(
          `The author name "${cleanName}" was just claimed by another account. Please pick a different name.`
        );
        setSubmitting(false);
        return;
      }

      showToast?.({
        type: "success",
        title: syncResult.isNewAccount
          ? "Account created successfully"
          : "Signed in successfully",
        detail: `Your unique author name is ${syncResult.user.name}.`,
      });
      onComplete(syncResult.user);
    } catch {
      setError("Could not save your author name. Please try again.");
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOut(auth);
    onCancel();
  };

  return (
    <AuthLayout>
      <h2>Choose your author name</h2>
      <p className="sub">
        {pending?.reason === "taken" && pending?.takenName
          ? `"${pending.takenName}" is already claimed by another author. Each author name must be unique.`
          : "Pick a unique public author name for publishing World Notes."}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="unique-author-name">Unique author name</label>
          <input
            id="unique-author-name"
            name="authorName"
            autoComplete="nickname"
            maxLength={100}
            placeholder="e.g. Alex Morgan 24"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            disabled={submitting}
            autoFocus
            required
          />
          <span
            className={`field-hint${
              availability && !availability.available ? " field-hint-warn" : ""
            }`}
          >
            {checking
              ? "Checking availability..."
              : availability
                ? availability.message
                : "Only one account can claim a given author name."}
          </span>
        </div>

        <button
          type="submit"
          className="btn"
          disabled={submitting || (availability && !availability.available)}
        >
          {submitting ? "Saving author name..." : "Continue to workspace"}
        </button>
      </form>

      <p className="auth-switch">
        Want to use a different account?{" "}
        <button type="button" className="text-link-btn" onClick={handleSwitchAccount}>
          Sign out
        </button>
      </p>
    </AuthLayout>
  );
}
