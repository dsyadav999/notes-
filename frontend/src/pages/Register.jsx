import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import {
  auth,
  checkAuthorNameAvailability,
  formatAuthError,
  googleProvider,
  normalizeAuthorName,
  syncUserAccount,
} from "../firebase";
import AuthLayout from "../components/AuthLayout.jsx";

export default function Register({
  setUser,
  showToast,
  setAuthFlowActive,
  onNeedsAuthorName,
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [checkingName, setCheckingName] = useState(false);
  const [submitting, setSubmitting] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const clean = normalizeAuthorName(form.name);
    if (clean.length < 2) {
      setAvailability(null);
      setCheckingName(false);
      return;
    }

    let cancelled = false;
    setCheckingName(true);
    const timer = setTimeout(async () => {
      try {
        const res = await checkAuthorNameAvailability(clean);
        if (!cancelled) {
          setAvailability(res);
        }
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setCheckingName(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.name]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError("");
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const name = normalizeAuthorName(form.name);
    const email = form.email.trim();
    const password = form.password;

    if (!name || !email || !password) {
      setError("Complete all fields to create your account.");
      return;
    }
    if (name.length < 2) {
      setError("Author name must be at least 2 characters long.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setError("");
    setSubmitting("email");
    try {
      const check = await checkAuthorNameAvailability(name);
      if (!check.valid || !check.available) {
        setAvailability(check);
        setError(
          check.message ||
            `Author name "${name}" is already taken. Only one author can use this name.`
        );
        setSubmitting("");
        return;
      }
    } catch {
      setError("Could not verify author name availability. Please try again.");
      setSubmitting("");
      return;
    }

    setAuthFlowActive?.(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      const syncResult = await syncUserAccount(result.user, name);

      if (syncResult.needsAuthorName) {
        onNeedsAuthorName?.(syncResult);
        setSubmitting("");
        return;
      }

      showToast?.({
        type: "success",
        title: "Account created successfully",
        detail: `Welcome to Note World, ${syncResult.user.name}.`,
      });
      setUser(syncResult.user);
    } catch (err) {
      setError(formatAuthError(err));
      setSubmitting("");
    } finally {
      setAuthFlowActive?.(false);
    }
  };

  const handleGoogleRegister = async () => {
    if (submitting) return;
    setError("");
    setSubmitting("google");
    setAuthFlowActive?.(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const syncResult = await syncUserAccount(result.user);

      if (syncResult.needsAuthorName) {
        onNeedsAuthorName?.(syncResult);
        setSubmitting("");
        return;
      }

      showToast?.({
        type: "success",
        title: syncResult.isNewAccount
          ? "Account created successfully"
          : "Signed in successfully",
        detail: syncResult.isNewAccount
          ? `Welcome to Note World, ${syncResult.user.name}.`
          : `Welcome back, ${syncResult.user.name}.`,
      });
      setUser(syncResult.user);
    } catch (err) {
      setError(formatAuthError(err));
      setSubmitting("");
    } finally {
      setAuthFlowActive?.(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Create your account</h2>
      <p className="sub">Sign up with Gmail and password, or continue with Google.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleEmailRegister}>
        <div className="field">
          <label htmlFor="name">Author name</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            maxLength={100}
            placeholder="Alex Morgan"
            value={form.name}
            onChange={handleChange}
            disabled={Boolean(submitting)}
            required
          />
          <span
            className={`field-hint${
              availability && !availability.available ? " field-hint-warn" : ""
            }`}
          >
            {checkingName
              ? "Checking author name availability..."
              : availability
                ? availability.message
                : "Unique public name shown when you publish World Notes."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="email">Email (Gmail)</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@gmail.com"
            value={form.email}
            onChange={handleChange}
            disabled={Boolean(submitting)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="input-with-action">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={6}
              placeholder="At least 6 characters"
              value={form.password}
              onChange={handleChange}
              disabled={Boolean(submitting)}
              required
            />
            <button
              type="button"
              className="input-action"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <span className="field-hint">Use at least 6 characters.</span>
        </div>
        <button
          type="submit"
          className="btn"
          disabled={Boolean(submitting) || (availability && !availability.available)}
        >
          {submitting === "email" ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="auth-divider" role="separator" aria-label="or">
        <span>or</span>
      </div>

      <button
        type="button"
        className="btn btn-quiet google-btn"
        onClick={handleGoogleRegister}
        disabled={Boolean(submitting)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
            fill="currentColor"
          />
          <path
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
            fill="currentColor"
          />
          <path
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
            fill="currentColor"
          />
          <path
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
            fill="currentColor"
          />
        </svg>
        {submitting === "google" ? "Connecting with Google..." : "Continue with Google"}
      </button>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
