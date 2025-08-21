import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "whatsnew.lastSeenISO";

export function useWhatsNewUnread() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const lastSeenISO = localStorage.getItem(STORAGE_KEY) || null;
    const lastSeen = lastSeenISO ? Date.parse(lastSeenISO) : 0;

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch("/whats-new.json", { cache: "no-store" });
                const data = await res.json();
                const list = Array.isArray(data?.entries) ? data.entries : [];
                list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
                if (alive) setEntries(list);
            } catch (e) {
                console.error("whats-new fetch failed:", e);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const newestDate = useMemo(
        () => entries.reduce((m, e) => Math.max(m, Date.parse(e.date || 0)), 0),
        [entries]
    );

    const unreadCount = useMemo(
        () => entries.filter(e => Date.parse(e.date || 0) > lastSeen).length,
        [entries, lastSeen]
    );

    const markAllRead = () => {
        if (newestDate) {
            localStorage.setItem(STORAGE_KEY, new Date(newestDate).toISOString());
        }
    };

    return { entries, loading, unreadCount, markAllRead };
}
