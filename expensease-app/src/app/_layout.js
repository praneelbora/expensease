// app/_layout.js
import React, { useEffect } from "react";
import { View, Platform } from "react-native";
import { Slot, router, SplashScreen as RouterSplashScreen } from "expo-router"; // use expo-router's SplashScreen wrapper
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { AuthProvider, useAuth } from "context/AuthContext";
import { NotificationProvider } from "context/NotificationContext";
import { FetchProvider } from "context/FetchContext";
import { ThemeProvider, useTheme } from "context/ThemeProvider";
import "expo-dev-client";
import ThemedStatusBar from "components/themedStatusBar";

/* ------------------ Splash: prevent auto-hide early ------------------ */
/*
  IMPORTANT:
  - With expo-router, prefer using the router's SplashScreen wrapper (imported above)
  - Call preventAutoHideAsync() at module load or early so the OS splash doesn't auto-hide before we are ready.
*/
(async () => {
  try {
    // Using expo-router's SplashScreen helps avoid auto-hide issues when using file-based routing.
    // This returns a Promise; we don't await for app startup logic here but we want it called early.
    await RouterSplashScreen.preventAutoHideAsync();
  } catch (e) {
    console.warn("Could not prevent splash auto-hide:", e);
  }
})();

/* ------------------ Background notification task ------------------ */
/*
  - Must be defined in global/module scope (TaskManager requirement).
  - The task name used with registerTaskAsync should match.
*/
const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

try {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error, executionInfo }) => {
    // Minimal global-scope handler. Keep logic small and side-effect free if possible.
    console.log("📩 Background notification received (task):", { data, error, executionInfo });
    // For heavy work, consider scheduling a background fetch or using platform services.
  });

  // registerTaskAsync only works on real device / builds and primarily on Android.
  // Wrap in try/catch and allow silent failure in dev.
  (async () => {
    try {
      // Only register once; registerTaskAsync returns a Promise
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    } catch (e) {
      // Not fatal — registration can fail in Expo Go / dev builds.
      console.warn("Failed to register background notification task (likely dev/build limitation):", e);
    }
  })();
} catch (e) {
  console.warn("TaskManager.defineTask error:", e);
}

/* ------------------ InnerLayout ------------------ */
const InnerLayout = () => {
  const { theme } = useTheme();
  const { hydrated } = useAuth();

  useEffect(() => {
    // notification response deep-linking (when app is foreground or background)
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response?.notification?.request?.content?.data || {};
        const link = data.url || data.link;
        if (link && typeof link === "string") {
          // format the scheme to router path if you send expensease://some/path
          const formatted = link.replace(/^expensease:\/\//, "/");
          // push — in rare race conditions router might not be ready; we wrap in try/catch
          try {
            router.push(formatted);
          } catch (err) {
            console.warn("Router push failed for notification deep link:", formatted, err);
          }
        }
      } catch (err) {
        console.warn("Error handling notification response:", err);
      }
    });

    // If cold-started from a notification (app was launched by tapping a notification)
    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        const data = lastResponse?.notification?.request?.content?.data || {};
        const link = data.url || data.link;
        if (link && typeof link === "string") {
          const formatted = link.replace(/^expensease:\/\//, "/");
          try {
            router.push(formatted);
          } catch (err) {
            // If router isn't ready yet, we'll still try — in practice this is fine in most apps.
            console.warn("Router push failed for cold-start notification deep link:", formatted, err);
          }
        }
      } catch (e) {
        console.warn("Error while reading last notification response:", e);
      }
    })();

    return () => {
      try {
        sub.remove();
      } catch (e) {
        // ignoring removal error in dev
      }
    };
  }, []);

  useEffect(() => {
    // only hide the splash once auth bootstrap (hydration) finished
    if (!hydrated) return;

    (async () => {
      try {
        // Hide the splash using expo-router's SplashScreen helper
        await RouterSplashScreen.hideAsync();
      } catch (e) {
        // fallback: try hide from expo-splash-screen (if you ever import it directly)
        console.warn("Unable to hide router splash screen:", e);
      }
    })();
  }, [hydrated]);

  return (
    <>
      <ThemedStatusBar />
      <NotificationProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors?.background || "#fff" }}>
          <BottomSheetModalProvider>
            <Slot />
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </NotificationProvider>
    </>
  );
};

/* ------------------ Root layout ------------------ */
export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FetchProvider>
          <InnerLayout />
        </FetchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
