import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write",
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatAuthError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled yet in Firebase Console. Enable Email/Password under Authentication > Sign-in method, or use Continue with Google.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please check your credentials and try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters long.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/popup-closed-by-user":
      return "Google sign-in popup was closed before completing.";
    case "auth/popup-blocked":
      return "Popups are blocked by your browser. Allow popups to use Google sign-in.";
    default:
      return err?.message || "Authentication failed. Please try again.";
  }
}

export function normalizeAuthorName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function toAuthorKey(name) {
  const normalized = normalizeAuthorName(name).toLowerCase();
  if (!normalized) return "";
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  if (slug.length >= 2) return slug;
  const bytes = new TextEncoder().encode(normalized);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `u_${hex}`.slice(0, 128);
}

export async function checkAuthorNameAvailability(name, excludeUid = null) {
  const normalizedName = normalizeAuthorName(name);
  const authorKey = toAuthorKey(normalizedName);

  if (normalizedName.length < 2 || !authorKey) {
    return {
      valid: false,
      available: false,
      normalizedName,
      authorKey,
      message: "Author name must be at least 2 characters.",
    };
  }

  const authorPath = `authors/${authorKey}`;
  try {
    const snap = await getDoc(doc(db, "authors", authorKey));
    if (!snap.exists()) {
      return {
        valid: true,
        available: true,
        normalizedName,
        authorKey,
        message: "Author name is available.",
      };
    }
    const existing = snap.data();
    const ownedBySelf = Boolean(excludeUid && existing?.uid === excludeUid);
    return {
      valid: true,
      available: ownedBySelf,
      normalizedName,
      authorKey,
      existingName: existing?.authorName || normalizedName,
      message: ownedBySelf
        ? "This is your current author name."
        : `The author name "${existing?.authorName || normalizedName}" is already taken.`,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, authorPath);
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

testConnection();

const inFlightSyncs = new Map();

export async function syncUserAccount(firebaseUser, preferredName) {
  if (!firebaseUser) return { isNewAccount: false };

  const uid = firebaseUser.uid;
  const syncKey = preferredName ? `${uid}:${normalizeAuthorName(preferredName)}` : uid;
  if (inFlightSyncs.has(syncKey)) {
    return inFlightSyncs.get(syncKey);
  }

  const task = (async () => {
    const email = (firebaseUser.email || "").trim().slice(0, 254);
    const providerId = (firebaseUser.providerData?.[0]?.providerId || "password").slice(0, 64);

    const userPath = `users/${uid}`;
    const privatePath = `users/${uid}/private/info`;
    const userRef = doc(db, "users", uid);
    const privateRef = doc(db, "users", uid, "private", "info");

    try {
      return await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const privateSnap = email ? await transaction.get(privateRef) : null;

        // Case 1: Returning user who already has a claimed unique authorKey
        if (userSnap.exists() && userSnap.data()?.authorKey) {
          const existingData = userSnap.data();
          const existingAuthorKey = existingData.authorKey;
          const existingAuthorRef = doc(db, "authors", existingAuthorKey);
          const existingAuthorSnap = await transaction.get(existingAuthorRef);

          if (existingAuthorSnap.exists() && existingAuthorSnap.data()?.uid === uid) {
            const canonicalName = existingAuthorSnap.data().authorName || existingData.displayName;
            transaction.update(userRef, {
              lastLoginAt: serverTimestamp(),
            });

            if (email) {
              if (!privateSnap?.exists()) {
                transaction.set(privateRef, {
                  uid,
                  email,
                  providerId,
                  createdAt: serverTimestamp(),
                  lastLoginAt: serverTimestamp(),
                });
              } else {
                transaction.update(privateRef, {
                  email,
                  providerId,
                  lastLoginAt: serverTimestamp(),
                });
              }
            }

            return {
              isNewAccount: false,
              needsAuthorName: false,
              user: {
                uid,
                name: canonicalName,
                authorKey: existingAuthorKey,
                email,
              },
            };
          }
        }

        // Case 2: Brand-new user or legacy user claiming a unique authorKey
        const fallbackCandidate = normalizeAuthorName(
          preferredName ||
            userSnap.data()?.displayName ||
            firebaseUser.displayName ||
            firebaseUser.email?.split("@")[0] ||
            ""
        );
        const candidateKey = toAuthorKey(fallbackCandidate);

        if (fallbackCandidate.length < 2 || !candidateKey) {
          return {
            isNewAccount: !userSnap.exists(),
            needsAuthorName: true,
            reason: "invalid",
            takenName: fallbackCandidate,
            firebaseUser,
          };
        }

        const authorRef = doc(db, "authors", candidateKey);
        const authorSnap = await transaction.get(authorRef);

        if (authorSnap.exists() && authorSnap.data()?.uid !== uid) {
          return {
            isNewAccount: !userSnap.exists(),
            needsAuthorName: true,
            reason: "taken",
            takenName: fallbackCandidate,
            firebaseUser,
          };
        }

        const finalName = authorSnap.exists()
          ? authorSnap.data().authorName
          : fallbackCandidate;

        if (!authorSnap.exists()) {
          transaction.set(authorRef, {
            authorKey: candidateKey,
            uid,
            authorName: finalName,
            createdAt: serverTimestamp(),
          });
        }

        if (!userSnap.exists()) {
          transaction.set(userRef, {
            uid,
            displayName: finalName,
            authorKey: candidateKey,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });
        } else {
          transaction.update(userRef, {
            displayName: finalName,
            authorKey: candidateKey,
            lastLoginAt: serverTimestamp(),
          });
        }

        if (email) {
          if (!privateSnap?.exists()) {
            transaction.set(privateRef, {
              uid,
              email,
              providerId,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });
          } else {
            transaction.update(privateRef, {
              email,
              providerId,
              lastLoginAt: serverTimestamp(),
            });
          }
        }

        return {
          isNewAccount: !userSnap.exists(),
          needsAuthorName: false,
          user: {
            uid,
            name: finalName,
            authorKey: candidateKey,
            email,
          },
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${userPath} | ${privatePath}`);
    }
  })().finally(() => {
    inFlightSyncs.delete(syncKey);
  });

  inFlightSyncs.set(syncKey, task);
  return task;
}
