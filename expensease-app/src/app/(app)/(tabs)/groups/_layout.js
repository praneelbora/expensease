import { Stack } from "expo-router";

export default function GroupsLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
                name="index"
                options={{ title: "Groups", animationTypeForReplace: "pop", unmountOnBlur: true }}
            />
        </Stack>
    );
}
