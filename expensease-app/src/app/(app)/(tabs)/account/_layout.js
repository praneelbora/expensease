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
    </Stack>
  );
}
