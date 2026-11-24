import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  db,
  handleFirestoreError,
  normalizeAuthorName,
  OperationType,
  toAuthorKey,
} from "../firebase";
import PublisherFilter from "../components/PublisherFilter.jsx";

const DEFAULT_CAT = "General";

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

export default function WorldFeed() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [activeCat, setActiveCat] = useState("All");
  const [queryText, setQueryText] = useState("");
  const [publisherQuery, setPublisherQuery] = useState("");
  const [selectedPublisher, setSelectedPublisher] = useState(null);
  const deferredQuery = useDeferredValue(queryText);
  const deferredPublisherQuery = useDeferredValue(publisherQuery);

  useEffect(() => {
    const q = query(collection(db, "notes"), where("visibility", "==", "world"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs
          .map((docSnap) => ({
            _id: docSnap.id,
            ...docSnap.data({ serverTimestamps: "estimate" }),
          }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setNotes(items);
        setSelectedId((prev) => prev || items[0]?._id || null);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, "notes");
      }
    );

    return () => unsubscribe();
  }, []);

  const publishers = useMemo(() => {
    const map = new Map();
    notes.forEach((n) => {
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
  }, [notes]);

  const publisherScopedNotes = useMemo(() => {
    if (!selectedPublisher && !deferredPublisherQuery.trim()) return notes;
    return notes.filter((n) =>
      matchesPublisher(n, selectedPublisher, deferredPublisherQuery)
    );
  }, [notes, selectedPublisher, deferredPublisherQuery]);

  const categories = useMemo(() => {
    const counts = {};
    publisherScopedNotes.forEach((n) => {
      const c = catOf(n);
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [publisherScopedNotes]);

  useEffect(() => {
    if (activeCat !== "All" && !categories.some(([c]) => c === activeCat)) {
      setActiveCat("All");
    }
  }, [categories, activeCat]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return publisherScopedNotes.filter((n) => {
      if (activeCat !== "All" && catOf(n) !== activeCat) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.content || "").toLowerCase().includes(q) ||
        (n.authorName || "").toLowerCase().includes(q) ||
        catOf(n).toLowerCase().includes(q)
      );
    });
  }, [publisherScopedNotes, deferredQuery, activeCat]);

  const selected = useMemo(
    () =>
      filtered.find((n) => n._id === selectedId) ||
      filtered[0] ||
      null,
    [filtered, selectedId]
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

  const hasPublisherFilter = Boolean(selectedPublisher || publisherQuery.trim());

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">Note World</div>
        <div className="topbar-meta">
          <span>World Notes</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {notes.length} {notes.length === 1 ? "public note" : "public notes"}
          </span>
        </div>
        <div className="who">
          <Link to="/login" className="signout topbar-link">
            Sign in
          </Link>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <PublisherFilter
              publishers={publishers}
              query={publisherQuery}
              selectedPublisher={selectedPublisher}
              onQueryChange={setPublisherQuery}
              onSelectPublisher={setSelectedPublisher}
              onClear={clearPublisherFilter}
            />

            <div className="search-wrap">
              <input
                className="search"
                type="search"
                placeholder="Search world note title or text"
                aria-label="Search world notes"
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
                All <span className="n tabular-nums">{publisherScopedNotes.length}</span>
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
            {loading && (
              <li className="skeleton-list" aria-label="Loading world notes">
                <div className="skeleton-item" />
                <div className="skeleton-item" />
                <div className="skeleton-item" />
              </li>
            )}

            {!loading && filtered.length === 0 && (
              <li className="empty-list">
                <p>
                  {hasPublisherFilter
                    ? `No public notes found for publisher "${selectedPublisher ? selectedPublisher.name : publisherQuery}".`
                    : notes.length === 0
                      ? "No world notes have been published yet. Sign in to publish the first one."
                      : "No public notes match your current search."}
                </p>
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

            {!loading &&
              filtered.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    className={`note-item${selected?._id === n._id ? " active" : ""}`}
                    onClick={() => setSelectedId(n._id)}
                  >
                    <span className="t">{n.title}</span>
                    <span className="s">{n.content || "No text"}</span>
                    <span className="d">
                      <span>{n.authorName || "Member"}</span>
                      <span aria-hidden="true">·</span>
                      <span>{catOf(n)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{fmt(n.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>

        <section className="editor-wrap">
          {selected ? (
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
            </article>
          ) : (
            <div className="reader-placeholder">
              <h2>World Notes</h2>
              <p>
                {hasPublisherFilter
                  ? "No public notes match this publisher filter. Clear the filter to browse all World Notes."
                  : "Public notes shared by Note World members appear here. Sign in to publish a world note or keep private notes for yourself."}
              </p>
              <Link to="/login" className="btn">
                Sign in to write
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
