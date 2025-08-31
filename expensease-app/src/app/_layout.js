import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Slot, SplashScreen, router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { AuthProvider } from "context/AuthContext";
import { NotificationProvider } from "context/NotificationContext";
import "expo-dev-client";

// Configure how notifications behave in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // show alert while app is open
    shouldPlaySound: true,   // play sound if included
    shouldSetBadge: false,   // no badge count update
  }),
});

// Background task for handling push notifications
const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";
TaskManager.defineTask(
  BACKGROUND_NOTIFICATION_TASK,
  ({ data, error, executionInfo }) => {
    console.log("📩 Background notification:", { data, error, executionInfo });
    // You can handle background notification payload here if needed
  }
);
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

// Prevent splash screen auto-hide (you can manually hide after auth init)
SplashScreen.preventAutoHideAsync().catch(() => {});

const Layout = () => {
  useEffect(() => {
    // Handle deep linking when user taps a notification
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const link = response?.notification?.request?.content?.data?.url || 
                     response?.notification?.request?.content?.data?.link;
        if (link && typeof link === "string") {
          const formatted = link.replace("expensease://", "/");
          router.push(formatted);
        }
      }
    );

    // Handle deep link if app was cold-started from a notification
    (async () => {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const link =
        lastResponse?.notification?.request?.content?.data?.url ||
        lastResponse?.notification?.request?.content?.data?.link;
      if (link && typeof link === "string") {
        const formatted = link.replace("expensease://", "/");
        router.push(formatted);
      }
    })();

    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <NotificationProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121212" }}>
          <BottomSheetModalProvider>
            <AuthProvider>
              <Slot />
            </AuthProvider>
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </NotificationProvider>
    </>
  );
};

export default Layout;
