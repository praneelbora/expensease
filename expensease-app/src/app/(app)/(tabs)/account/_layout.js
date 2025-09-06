import { Stack } from "expo-router";

export default function AccountLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
                name="index"
                options={{ title: "Account", animationTypeForReplace: "pop", unmountOnBlur: true }}
            />
            <Stack.Screen
                name="guide"
                options={{ title: "Guide" }}
            />
            <Stack.Screen
                name="paymentAccounts"
                options={{ title: "Payment Accounts" }}
            />
            <Stack.Screen
                name="theme"
                options={{ title: "App Theme" }}
            />
            <Stack.Screen
                name="currency"
                options={{ title: "Default Currency" }}
            />

            {/* NEW: FAQ, Privacy, Contact */}
            <Stack.Screen
                name="faq"
                options={{ title: "FAQs" }}
            />
            <Stack.Screen
                name="privacy"
                options={{ title: "Privacy & Data" }}
            />
            <Stack.Screen
                name="contact"
                options={{ title: "Contact support" }}
            />
            <Stack.Screen
                name="notifications"
                options={{ title: "Notifications" }}
            />
        </Stack>
    );
}
