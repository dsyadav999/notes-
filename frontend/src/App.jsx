import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, syncUserAccount } from "./firebase";
import Toast from "./components/Toast.jsx";
import CompleteProfile from "./components/CompleteProfile.jsx";

const Register = lazy(() => import("./pages/Register.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Notes = lazy(() => import("./pages/Notes.jsx"));
const WorldFeed = lazy(() => import("./pages/WorldFeed.jsx"));

export default function App() {
  const [user, setUser] = useState(null);
  const [pendingAuthor, setPendingAuthor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const authFlowActiveRef = useRef(false);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(({ type = "success", title, detail }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ type, title, detail, id: Date.now() });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 4500);
  }, []);

  const setAuthFlowActive = useCallback((active) => {
    authFlowActiveRef.current = active;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setPendingAuthor(null);
        setLoading(false);
        return;
      }

      if (authFlowActiveRef.current) {
        return;
      }

      try {
        const synced = await syncUserAccount(firebaseUser);
        if (synced?.needsAuthorName) {
          setUser(null);
          setPendingAuthor(synced);
        } else {
          setPendingAuthor(null);
          setUser(synced.user || null);
        }
      } catch (err) {
        console.error("Failed to sync user profile:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="app-loading" role="status" aria-label="Loading workspace">
        <div className="app-loading-wordmark">Note World</div>
        <p className="app-loading-text">Connecting to your database...</p>
      </div>
    );
  }

  if (pendingAuthor) {
    return (
      <>
        <Toast toast={toast} onDismiss={dismissToast} />
        <CompleteProfile
          pending={pendingAuthor}
          showToast={showToast}
          onComplete={(completedUser) => {
            setPendingAuthor(null);
            setUser(completedUser);
          }}
          onCancel={() => {
            setPendingAuthor(null);
            setUser(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Toast toast={toast} onDismiss={dismissToast} />
      <Suspense
        fallback={
          <div className="app-loading" role="status" aria-label="Loading view">
            <div className="app-loading-wordmark">Note World</div>
          </div>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Notes user={user} showToast={showToast} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <Login
                  setUser={setUser}
                  showToast={showToast}
                  setAuthFlowActive={setAuthFlowActive}
                  onNeedsAuthorName={setPendingAuthor}
                />
              )
            }
          />
          <Route
            path="/register"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <Register
                  setUser={setUser}
                  showToast={showToast}
                  setAuthFlowActive={setAuthFlowActive}
                  onNeedsAuthorName={setPendingAuthor}
                />
              )
            }
          />
          <Route
            path="/world"
            element={user ? <Navigate to="/?scope=world" replace /> : <WorldFeed />}
          />
        </Routes>
      </Suspense>
    </>
  );
}
