
const MODE = import.meta.env.VITE_MODE

export function initAnalytics() {
    if (MODE !== 'production') {
        console.log("[DEV] Not in Production - GA initialization skipped")
        return;
    }

    const gaId = import.meta.env.VITE_GA_ID;
    if (!gaId) return console.warn("GA ID missing");

    // Create gtag function immediately
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };

    // Load GA script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    script.onload = () => {
        window.gtag('js', new Date());
        if (MODE == 'production') {
            window.gtag('config', gaId);
        }
        else {
            console.log('[DEV] debug_mode on');
            window.gtag('config', gaId, { debug_mode: true });
        }
    };
    document.head.appendChild(script);
}

export function setGAUserId(userId) {
    if (typeof window.gtag === "function") {
        window.gtag('set', { user_id: userId });
    } else {
        console.warn("Tried to set user ID before GA initialized.");
    }
}


export function logEvent(name, params = {}) {
    if (MODE !== "production") {
        console.log(`[DEV] Event log skipped: ${name} - ${JSON.stringify(params)}`);
        return;
    }
    if (typeof window.gtag === "function") {
        window.gtag('event', name, params);
    } else {
        console.warn("logEvent called before GA initialized.");
    }
}

let lastScreen = null;

function sanitizePath(path) {
    // Replace any 24-character hex strings (Mongo IDs) with ":id"
    return path.replace(/\/[0-9a-fA-F]{24}(?=\/|$)/g, "/:id");
}

export function logScreenView(screenName) {
    // Only run in production
    if (MODE !== "production") {
        console.log(`[DEV] Screen view skipped: ${sanitizePath(screenName)}`);
        return;
    }

    const cleanName = sanitizePath(screenName);

    // Avoid duplicate logging
    if (lastScreen === cleanName) {
        return;
    }
    lastScreen = cleanName;

    if (typeof window.gtag === "function") {
        window.gtag("event", "screen_view", {
            app_name: "Split Free",
            screen_name: cleanName
        });
    } else {
        console.warn("Tried to log screen_view before GA initialized.");
    }
}

