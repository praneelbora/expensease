// app/_layout.js
import React, { useEffect } from "react";
import { View } from "react-native";
import { Slot, SplashScreen, router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { AuthProvider, useAuth } from "context/AuthContext";
import { NotificationProvider } from "context/NotificationContext";
import { ThemeProvider, useTheme } from "context/ThemeProvider";
import "expo-dev-client";
import ThemedStatusBar from "components/themedStatusBar";

/* ---------- notification + background task (unchanged) ---------- */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error, executionInfo }) => {
  console.log("📩 Background notification:", { data, error, executionInfo });
});
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) =>
  console.warn("Failed to register background task", e)
);

/* ---------- Inner layout (reads theme + auth hydration) ---------- */
const InnerLayout = () => {
  const { theme } = useTheme();
  const { hydrated } = useAuth(); // <-- wait for this before hiding splash

  useEffect(() => {
    // notification response deep-linking
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const link =
        response?.notification?.request?.content?.data?.url ||
        response?.notification?.request?.content?.data?.link;
      if (link && typeof link === "string") {
        const formatted = link.replace("expensease://", "/");
        router.push(formatted);
      }
    });

    // if cold-started from a notification
    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        const link =
          lastResponse?.notification?.request?.content?.data?.url ||
          lastResponse?.notification?.request?.content?.data?.link;
        if (link && typeof link === "string") {
          const formatted = link.replace("expensease://", "/");
          router.push(formatted);
        }
      } catch (e) {
        console.warn("Error while reading last notification response", e);
      }
    })();

    return () => sub.remove();
  }, []);

  useEffect(() => {
    // only hide the splash once auth bootstrap (hydration) finished
    if (!hydrated) return;
    (async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (e) {
        // ignore
      }
    })();
  }, [hydrated]);

  return (
    <>
      <ThemedStatusBar />
      <NotificationProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <BottomSheetModalProvider>
            {/* AuthProvider has been moved above (in the exported layout) so useAuth works here */}
            <Slot />
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </NotificationProvider>
    </>
  );
};

/* ---------- Export root with ThemeProvider + AuthProvider at top ---------- */
export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InnerLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}
