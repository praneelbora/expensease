import React from 'react';
import { Stack } from 'expo-router';

export default function DashboardLayout() {
  return (
    // parent stack: header hidden so nested stacks control headers
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{ title: "Home", animationTypeForReplace: "pop", unmountOnBlur: true }}
      />
      <Stack.Screen
        name="expenses"
        options={{ title: "Expenses", animationTypeForReplace: "pop", unmountOnBlur: true }}
      />
    </Stack>
  );
}
