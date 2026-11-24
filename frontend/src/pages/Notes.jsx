import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  auth,
  db,
  handleFirestoreError,
  normalizeAuthorName,
  OperationType,
  toAuthorKey,
} from "../firebase";
import CategoryPicker from "../components/CategoryPicker.jsx";
import PublisherFilter from "../components/PublisherFilter.jsx";

const DEFAULT_CAT = "General";
const PRESET_CATS = [
  "General",
  "Work",
  "Personal",
  "Ideas",
  "Study",
  "To-Do",
  "Health",
  "Finance",
  "Travel",
  "Shopping",
  "Recipes",
  "Meetings",
];

const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  const parsed = new Date(ts).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const fmt = (ts) => {
  const ms = toMillis(ts);
  if (!ms) return "Just now";
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const catOf = (n) => n.category || DEFAULT_CAT;
const visOf = (n) => (n.visibility === "world" ? "world" : "private");

const countWords = (text) => {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const matchesPublisher = (note, selectedPublisher, publisherQuery) => {
  const noteName = normalizeAuthorName(note.authorName || "");
  const noteKey = note.authorKey || toAuthorKey(noteName);
  if (selectedPublisher) {
    if (selectedPublisher.authorKey && noteKey) {
      return noteKey === selectedPublisher.authorKey;
    }
    if (selectedPublisher.userId && note.userId) {
      return note.userId === selectedPublisher.userId;
    }
    return noteName.toLowerCase() === selectedPublisher.nameLower;
  }
  const pq = publisherQuery.trim().toLowerCase();
  if (!pq) return true;
  return noteName.toLowerCase().includes(pq);
};

const NoteListItem = memo(function NoteListItem({
  note,
  active,
  showAuthor,
  currentUid,
  onSelect,
}) {
  const isMine = note.userId === currentUid;
  return (
    <li>
      <button
        type="button"
        className={`note-item${active ? " active" : ""}`}
        onClick={() => onSelect(note)}
      >
        <span className="t">{note.title}</span>
        <span className="s">{note.content || "No text yet"}</span>
        <span className="d">
          {showAuthor && (
            <>
              <span>{isMine ? `${note.authorName || "You"} (You)` : note.authorName || "Member"}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{catOf(note)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{fmt(note.updatedAt)}</span>
        </span>
      </button>
    </li>
  );
});

export default function Notes({ user, showToast }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = searchParams.get("scope") === "world" ? "world" : "private";

  const [myNotes, setMyNotes] = useState([]);
  const [worldNotes, setWorldNotes] = useState([]);
  const [loadingMy, setLoadingMy] = useState(true);
  const [loadingWorld, setLoadingWorld] = useState(true);
  const [scope, setScope] = useState(initialScope); // "private" | "world"
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: DEFAULT_CAT,
    visibility: initialScope,
  });
  const [activeCat, setActiveCat] = useState("All");
  const [queryText, setQueryText] = useState("");
  const [publisherQuery, setPublisherQuery] = useState("");
  const [selectedPublisher, setSelectedPublisher] = useState(null);
  const deferredQuery = useDeferredValue(queryText);
  const deferredPublisherQuery = useDeferredValue(publisherQuery);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (searchParams.get("scope")) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user?.uid) return;

    const myQuery = query(collection(db, "notes"), where("userId", "==", user.uid));
    const unsubMy = onSnapshot(
      myQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            _id: docSnap.id,
            ...docSnap.data({ serverTimestamps: "estimate" }),
          }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setMyNotes(items);
        setLoadingMy(false);
      },
      (err) => {
        setLoadingMy(false);
        setError("Could not load your private notes.");
        handleFirestoreError(err, OperationType.LIST, "notes");
      }
    );

    const worldQuery = query(collection(db, "notes"), where("visibility", "==", "world"));
    const unsubWorld = onSnapshot(
      worldQuery,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            _id: docSnap.id,
            ...docSnap.data({ serverTimestamps: "estimate" }),
          }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setWorldNotes(items);
        setLoadingWorld(false);
      },
      (err) => {
        setLoadingWorld(false);
        setError("Could not load world notes.");
        handleFirestoreError(err, OperationType.LIST, "notes");
      }
    );

    return () => {
      unsubMy();
      unsubWorld();
    };
  }, [user?.uid]);

  const privateNotes = useMemo(
    () => myNotes.filter((n) => visOf(n) === "private"),
    [myNotes]
  );

  const publishers = useMemo(() => {
    const map = new Map();
    worldNotes.forEach((n) => {
      const name = normalizeAuthorName(n.authorName || "Member");
      const id = n.authorKey || toAuthorKey(name) || n.userId;
      const current = map.get(id);
      if (current) {
        current.count += 1;
      } else {
        map.set(id, {
          id,
          name,
          authorKey: n.authorKey || toAuthorKey(name),
          userId: n.userId || null,
          nameLower: name.toLowerCase(),
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [worldNotes]);

  const scopedNotes = useMemo(() => {
    if (scope !== "world") return privateNotes;
    if (!selectedPublisher && !deferredPublisherQuery.trim()) return worldNotes;
    return worldNotes.filter((n) =>
      matchesPublisher(n, selectedPublisher, deferredPublisherQuery)
    );
  }, [scope, privateNotes, worldNotes, selectedPublisher, deferredPublisherQuery]);

  const loadingNotes = scope === "world" ? loadingWorld : loadingMy;

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      myNotes.find((n) => n._id === selectedId) ||
      worldNotes.find((n) => n._id === selectedId) ||
      null
    );
  }, [myNotes, worldNotes, selectedId]);

  const isReadOnly = Boolean(selected && selected.userId !== user.uid);

  const isDirty = useMemo(() => {
    if (isReadOnly) return false;
    if (!selected) {
      return Boolean(
        form.title.trim() ||
          form.content.trim() ||
          form.category !== DEFAULT_CAT ||
          form.visibility !== scope
      );
    }
    return (
      form.title !== selected.title ||
      form.content !== (selected.content || "") ||
      (form.category.trim() || DEFAULT_CAT) !== catOf(selected) ||
      form.visibility !== visOf(selected)
    );
  }, [selected, isReadOnly, form, scope]);

  const categories = useMemo(() => {
    const counts = {};
    scopedNotes.forEach((n) => {
      const c = catOf(n);
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedNotes]);

  useEffect(() => {
    if (activeCat !== "All" && !categories.some(([c]) => c === activeCat)) {
      setActiveCat("All");
    }
  }, [categories, activeCat]);

  const categoryOptions = useMemo(() => {
    const custom = categories
      .map(([c]) => c)
      .filter((c) => !PRESET_CATS.includes(c))
      .sort();
    const set = new Set([...PRESET_CATS, ...custom]);
    if (form.category) set.add(form.category);
    return [...set];
  }, [categories, form.category]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return scopedNotes.filter((n) => {
      if (activeCat !== "All" && catOf(n) !== activeCat) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q) ||
        (n.authorName || "").toLowerCase().includes(q) ||
        catOf(n).toLowerCase().includes(q)
      );
    });
  }, [scopedNotes, deferredQuery, activeCat]);

  const openNote = useCallback((note) => {
    setSelectedId(note._id);
    setForm({
      title: note.title,
      content: note.content || "",
      category: catOf(note),
      visibility: visOf(note),
    });
    setConfirmDelete(false);
    setError("");
    setStatus("");
  }, []);

  const startNewNote = useCallback(
    (targetScope = scope) => {
      setSelectedId(null);
      setForm({
        title: "",
        content: "",
        category: activeCat !== "All" ? activeCat : DEFAULT_CAT,
        visibility: targetScope,
      });
      setConfirmDelete(false);
      setError("");
      setStatus("");
    },
    [activeCat, scope]
  );

  const clearPublisherFilter = useCallback(() => {
    setSelectedPublisher(null);
    setPublisherQuery("");
  }, []);

  const handleFilterByAuthor = useCallback(
    (note) => {
      const name = normalizeAuthorName(note.authorName || "Member");
      const key = note.authorKey || toAuthorKey(name);
      const found = publishers.find(
        (p) => (key && p.authorKey === key) || (note.userId && p.userId === note.userId)
      );
      setScope("world");
      setSelectedPublisher(
        found || {
          id: key || note.userId,
          name,
          authorKey: key,
          userId: note.userId || null,
          nameLower: name.toLowerCase(),
          count: 1,
        }
      );
      setPublisherQuery(name);
      setActiveCat("All");
    },
    [publishers]
  );

  const handleScopeSwitch = (nextScope) => {
    if (nextScope === scope) return;
    setScope(nextScope);
    setActiveCat("All");
    setQueryText("");
    clearPublisherFilter();
    setConfirmDelete(false);
    setError("");
    setStatus("");
    if (!selectedId) {
      setForm((prev) => ({ ...prev, visibility: nextScope }));
    } else {
      const nextList = nextScope === "world" ? worldNotes : privateNotes;
      if (nextList.length > 0) {
        openNote(nextList[0]);
      } else {
        setSelectedId(null);
        setForm({
          title: "",
          content: "",
          category: DEFAULT_CAT,
          visibility: nextScope,
        });
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setStatus("");
    if (error) setError("");
  };

  const handleCategoryChange = (nextCategory) => {
    setForm((prev) => ({ ...prev, category: nextCategory }));
    setStatus("");
    if (error) setError("");
  };

  const handleVisibilityChange = (nextVisibility) => {
    setForm((prev) => ({ ...prev, visibility: nextVisibility }));
    setStatus("");
    if (error) setError("");
  };

  const saveCurrentNote = useCallback(async () => {
    if (saving || isReadOnly || !user?.uid) return;
    setError("");
    const trimmedTitle = form.title.trim().slice(0, 200);
    if (!trimmedTitle) {
      setError("Add a title before saving.");
      return;
    }
    const sanitizedContent = String(form.content || "").slice(0, 100000);
    const sanitizedCategory = (form.category.trim() || DEFAULT_CAT).slice(0, 30);
    const sanitizedVisibility = form.visibility === "world" ? "world" : "private";
    const authorName = normalizeAuthorName(user.name || "Member");
    const authorKey = user.authorKey || toAuthorKey(authorName);

    setSaving(true);
    try {
      if (selectedId) {
        const notePath = `notes/${selectedId}`;
        try {
          await updateDoc(doc(db, "notes", selectedId), {
            title: trimmedTitle,
            content: sanitizedContent,
            category: sanitizedCategory,
            visibility: sanitizedVisibility,
            authorName,
            authorKey,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, notePath);
        }
        setStatus("Saved");
      } else {
        const noteRef = doc(collection(db, "notes"));
        const notePath = `notes/${noteRef.id}`;
        try {
          await setDoc(noteRef, {
            userId: user.uid,
            authorName,
            authorKey,
            title: trimmedTitle,
            content: sanitizedContent,
            category: sanitizedCategory,
            visibility: sanitizedVisibility,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, notePath);
        }
        setSelectedId(noteRef.id);
        setStatus("Saved");
        showToast?.({
          type: "success",
          title:
            sanitizedVisibility === "world"
              ? "World note published"
              : "Private note saved",
          detail: `"${trimmedTitle}" saved under ${sanitizedCategory}.`,
        });
      }

      if (scope !== sanitizedVisibility) {
        setScope(sanitizedVisibility);
      }

      setForm({
        title: trimmedTitle,
        content: sanitizedContent,
        category: sanitizedCategory,
        visibility: sanitizedVisibility,
      });
    } catch {
      setError("Could not save the note. Please verify your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [saving, isReadOnly, user, form, selectedId, scope, showToast]);

  const handleSave = (e) => {
    e.preventDefault();
    saveCurrentNote();
  };

  const handleCopyToPrivate = async () => {
    if (!selected || saving || !user?.uid) return;
    setSaving(true);
    try {
      const noteRef = doc(collection(db, "notes"));
      const notePath = `notes/${noteRef.id}`;
      const authorName = normalizeAuthorName(user.name || "Member");
      const authorKey = user.authorKey || toAuthorKey(authorName);
      const copiedTitle = selected.title.slice(0, 200);
      const copiedContent = String(selected.content || "").slice(0, 100000);
      const copiedCategory = catOf(selected).slice(0, 30);

      try {
        await setDoc(noteRef, {
          userId: user.uid,
          authorName,
          authorKey,
          title: copiedTitle,
          content: copiedContent,
          category: copiedCategory,
          visibility: "private",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, notePath);
      }

      setScope("private");
      setSelectedId(noteRef.id);
      setForm({
        title: copiedTitle,
        content: copiedContent,
        category: copiedCategory,
        visibility: "private",
      });
      showToast?.({
        type: "success",
        title: "Saved to Private Notes",
        detail: `"${copiedTitle}" was copied to your private workspace.`,
      });
    } catch {
      setError("Could not copy note to private notes.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrentNote();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveCurrentNote]);

  const handleDelete = async () => {
    if (!selectedId || deleting || isReadOnly) return;
    setDeleting(true);
    try {
      const deletedTitle = selected?.title || "Note";
      const notePath = `notes/${selectedId}`;
      try {
        await deleteDoc(doc(db, "notes", selectedId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, notePath);
      }
      startNewNote(scope);
      showToast?.({
        type: "success",
        title: "Note deleted",
        detail: `"${deletedTitle}" was removed from your database.`,
      });
    } catch {
      setError("Could not delete the note. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    showToast?.({
      type: "success",
      title: "Signed out successfully",
      detail: "Your session has ended.",
    });
  };

  const words = useMemo(() => countWords(form.content), [form.content]);
  const chars = form.content.length;
  const hasPublisherFilter = Boolean(selectedPublisher || publisherQuery.trim());

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">Note World</div>

        <nav className="scope-switch" aria-label="Notes visibility scope">
          <button
            type="button"
            className={`scope-tab${scope === "private" ? " active" : ""}`}
            aria-pressed={scope === "private"}
            onClick={() => handleScopeSwitch("private")}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.25 7V5a2.75 2.75 0 1 1 5.5 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>Private</span>
            <span className="scope-count tabular-nums">{privateNotes.length}</span>
          </button>
          <button
            type="button"
            className={`scope-tab${scope === "world" ? " active" : ""}`}
            aria-pressed={scope === "world"}
            onClick={() => handleScopeSwitch("world")}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2.5 8h11M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span>World</span>
            <span className="scope-count tabular-nums">{worldNotes.length}</span>
          </button>
        </nav>

        <div className="who">
          <span className="user-name" title="Unique author name">
            {user.name}
          </span>
          <button type="button" className="signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <button
              type="button"
              className="btn"
              onClick={() => startNewNote(scope)}
            >
              {scope === "world" ? "New world note" : "New private note"}
            </button>

            {scope === "world" && (
              <PublisherFilter
                publishers={publishers}
                query={publisherQuery}
                selectedPublisher={selectedPublisher}
                onQueryChange={setPublisherQuery}
                onSelectPublisher={setSelectedPublisher}
                onClear={clearPublisherFilter}
              />
            )}

            <div className="search-wrap">
              <input
                className="search"
                type="search"
                placeholder={
                  scope === "world"
                    ? "Search world note title or text"
                    : "Search private notes"
                }
                aria-label="Search notes"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
              />
              {queryText && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setQueryText("")}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="cats" role="group" aria-label="Filter by category">
              <button
                type="button"
                className={`cat${activeCat === "All" ? " on" : ""}`}
                aria-pressed={activeCat === "All"}
                onClick={() => setActiveCat("All")}
              >
                All <span className="n tabular-nums">{scopedNotes.length}</span>
              </button>
              {categories.map(([c, count]) => (
                <button
                  type="button"
                  key={c}
                  className={`cat${activeCat === c ? " on" : ""}`}
                  aria-pressed={activeCat === c}
                  onClick={() => setActiveCat(c)}
                >
                  {c} <span className="n tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="note-list">
            {loadingNotes && (
              <li className="skeleton-list" aria-label="Loading notes">
                <div className="skeleton-item" />
                <div className="skeleton-item" />
                <div className="skeleton-item" />
              </li>
            )}

            {!loadingNotes && filtered.length === 0 && (
              <li className="empty-list">
                <p>
                  {scope === "world" && hasPublisherFilter
                    ? `No public notes found for publisher "${selectedPublisher ? selectedPublisher.name : publisherQuery}".`
                    : scopedNotes.length === 0
                      ? scope === "world"
                        ? "No world notes yet. Publish a note anyone can read."
                        : "No private notes yet. Only you can see notes stored here."
                      : "No notes match your current search or category filter."}
                </p>
                {scope === "private" && privateNotes.length === 0 && worldNotes.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-quiet empty-action"
                    onClick={() => handleScopeSwitch("world")}
                  >
                    Browse World notes ({worldNotes.length})
                  </button>
                )}
                {(queryText || activeCat !== "All" || hasPublisherFilter) && (
                  <button
                    type="button"
                    className="btn btn-quiet empty-action"
                    onClick={() => {
                      setQueryText("");
                      setActiveCat("All");
                      clearPublisherFilter();
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </li>
            )}

            {!loadingNotes &&
              filtered.map((n) => (
                <NoteListItem
                  key={n._id}
                  note={n}
                  active={n._id === selectedId}
                  showAuthor={scope === "world"}
                  currentUid={user.uid}
                  onSelect={openNote}
                />
              ))}
          </ul>
        </aside>

        <section className="editor-wrap">
          {isReadOnly && selected ? (
            <article className="reader">
              <div className="reader-top">
                <h1 className="reader-title">{selected.title}</h1>
                <div className="reader-byline">
                  <span>
                    By{" "}
                    <button
                      type="button"
                      className="byline-author"
                      onClick={() => handleFilterByAuthor(selected)}
                      title={`View all public notes by ${selected.authorName || "Member"}`}
                    >
                      {selected.authorName || "Member"}
                    </button>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{catOf(selected)}</span>
                  <span aria-hidden="true">·</span>
                  <span>World Note</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{fmt(selected.updatedAt)}</span>
                </div>
              </div>
              <div className="reader-body">
                {selected.content ? (
                  selected.content
                ) : (
                  <span className="reader-empty">This note has no body text.</span>
                )}
              </div>
              <div className="editor-foot">
                <span className="meta">Read-only public note</span>
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleCopyToPrivate}
                    disabled={saving}
                  >
                    {saving ? "Copying..." : "Save copy to Private"}
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <form className="editor" onSubmit={handleSave}>
              <input
                className="title-input"
                name="title"
                maxLength={200}
                placeholder="Untitled note"
                aria-label="Note title"
                value={form.title}
                onChange={handleChange}
              />

              <div className="editor-toolbar">
                <div className="toolbar-group">
                  <label htmlFor="category">Category</label>
                  <CategoryPicker
                    value={form.category}
                    options={categoryOptions}
                    onChange={handleCategoryChange}
                  />
                </div>

                <div className="toolbar-group">
                  <span className="toolbar-label" id="visibility-label">
                    Visibility
                  </span>
                  <div
                    className="vis-switch"
                    role="group"
                    aria-labelledby="visibility-label"
                  >
                    <button
                      type="button"
                      className={`vis-btn${form.visibility === "private" ? " active" : ""}`}
                      aria-pressed={form.visibility === "private"}
                      onClick={() => handleVisibilityChange("private")}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5.25 7V5a2.75 2.75 0 1 1 5.5 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                      Private
                    </button>
                    <button
                      type="button"
                      className={`vis-btn${form.visibility === "world" ? " active" : ""}`}
                      aria-pressed={form.visibility === "world"}
                      onClick={() => handleVisibilityChange("world")}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M2.5 8h11M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      World
                    </button>
                  </div>
                  <span className="vis-hint">
                    {form.visibility === "world"
                      ? "Anyone can read"
                      : "Only you can see"}
                  </span>
                </div>
              </div>

              <textarea
                className="body-input"
                name="content"
                maxLength={100000}
                placeholder="Start writing..."
                aria-label="Note text"
                value={form.content}
                onChange={handleChange}
              />

              <div className="editor-foot">
                <div className="meta" role="status">
                  {error ? (
                    <span className="confirm">{error}</span>
                  ) : (
                    <span className="meta-status">
                      <span>
                        {status ||
                          (isDirty
                            ? "Unsaved changes"
                            : selected
                              ? `Last edited ${fmt(selected.updatedAt)}`
                              : "New note")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {words} {words === 1 ? "word" : "words"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{chars} chars</span>
                    </span>
                  )}
                </div>
                <div className="actions">
                  {selectedId && !confirmDelete && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete
                    </button>
                  )}
                  {confirmDelete && (
                    <>
                      <span className="confirm">Delete this note?</span>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-solid"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting..." : "Delete"}
                      </button>
                    </>
                  )}
                  {!confirmDelete && (
                    <button type="submit" className="btn" disabled={saving}>
                      {saving
                        ? "Saving..."
                        : form.visibility === "world"
                          ? selectedId
                            ? "Update world note"
                            : "Publish world note"
                          : "Save private note"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
