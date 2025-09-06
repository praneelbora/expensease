import React, { createContext, useState, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { registerForPushNotificationsAsync } from "utils/registerForPushNotificationsAsync";
import { savePublicPushToken, saveUserPushToken, logToServer } from "services/UserService";
import { Platform } from "react-native";

export const NotificationContext = createContext();

export const NotificationProvider = ({ children, userToken }) => {
    const [expoPushToken, setExpoPushToken] = useState(null);
    const [notification, setNotification] = useState(null);
    const [error, setError] = useState(null);

    const notificationListener = useRef();
    const responseListener = useRef();

    useEffect(() => {
        logToServer({ msg: "📲 NotificationProvider mounted", userToken });

        registerForPushNotificationsAsync().then(
            async (token) => {
                setExpoPushToken(token);
                logToServer({ msg: "✅ Got Expo push token", token });

                try {
                    let result;
                    if (userToken) {
                        // logged in → save to User + Admin
                        result = await saveUserPushToken(token, Platform.OS);
                        logToServer({ msg: "✅ /push-token (auth) response", result });
                    } else {
                        // guest → save to Admin only
                        result = await savePublicPushToken(token, Platform.OS);
                        logToServer({ msg: "✅ /push-token/public response", result });
                    }
                } catch (err) {
                    logToServer({
                        msg: "❌ Failed saving push token to backend",
                        err: err.message,
                    });
                }
            },
            (err) => {
                setError(err);
                logToServer({
                    msg: "❌ Failed to register for push notifications",
                    err: err.message,
                });
            }
        );

        notificationListener.current =
            Notifications.addNotificationReceivedListener((notif) => {
                setNotification(notif);
                logToServer({ msg: "📩 Notification received", notif });
            });

        responseListener.current =
            Notifications.addNotificationResponseReceivedListener((response) => {
                logToServer({ msg: "🔔 Notification tap", response });
            });

        return () => {
            logToServer({ msg: "♻️ Cleaning up notification listeners" });
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
    }, [userToken]); // rerun when userToken changes

    return (
        <NotificationContext.Provider
            value={{ expoPushToken, notification, error }}
        >
            {children}
        </NotificationContext.Provider>
    );
};
