import { Stack } from "expo-router";

export default function FriendsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: "Friends" }} />
      <Stack.Screen name="details" options={{ title: "Friend Details" }} />
      <Stack.Screen name="settings" options={{ title: "Friend Settings" }} />
    </Stack>
  );
}
