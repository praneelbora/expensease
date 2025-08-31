import React, { createContext, useState, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { registerForPushNotificationsAsync } from "utils/registerForPushNotificationsAsync";
import { savePushToken } from "services/UserService";
import { Platform } from "react-native";

export const NotificationContext = createContext();

export const NotificationProvider = ({ children, userToken }) => {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState(null);

  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync().then(
      async (token) => {
        setExpoPushToken(token);

        try {
          await savePushToken(token, Platform.OS, userToken);
          console.log("✅ Push token saved:", token);
        } catch (err) {
          console.error("❌ Failed saving push token:", err);
        }
      },
      (err) => setError(err)
    );

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notif) => {
        setNotification(notif);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("🔔 Notification tap:", response);
        // Optional: deep link based on response.notification.request.content.data
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [userToken]);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification, error }}>
      {children}
    </NotificationContext.Provider>
  );
};
