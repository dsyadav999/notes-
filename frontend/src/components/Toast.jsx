export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      className={`toast ${isError ? "toast-error" : "toast-success"}`}
      role={isError ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="toast-icon" aria-hidden="true">
        {isError ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.75v3.75M8 11.25h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5.25 8.25 7 10l3.75-3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="toast-body">
        <p className="toast-title">{toast.title}</p>
        {toast.detail && <p className="toast-detail">{toast.detail}</p>}
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
