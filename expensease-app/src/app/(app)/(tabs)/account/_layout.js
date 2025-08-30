import { Stack } from "expo-router";

export default function AccountLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{ title: "Account", animationTypeForReplace: "pop", unmountOnBlur: true }}
      />
    </Stack>
  );
}
