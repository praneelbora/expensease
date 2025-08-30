import { setStatusBarBackgroundColor, setStatusBarStyle, setStatusBarTranslucent, StatusBar } from "expo-status-bar";
import { SplashScreen, Stack, router } from "expo-router";

const RootLayout = () => {


    return (
        <>
            <StatusBar style={'light'} />
            <Stack
                screenOptions={{
                    headerShown: false
                }}>
                <Stack.Screen name="(tabs)" options={{ title: "Home", headerShown: false }} />
                <Stack.Screen name="index" options={{ title: "Login", headerShown: false, animationTypeForReplace: 'pop' }} />
            </Stack>
        </>
    )
}

export default RootLayout;
