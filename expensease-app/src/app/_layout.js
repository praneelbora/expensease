import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';

import { Slot, router, SplashScreen } from 'expo-router';

const Layout = () => {
    return (
        <>
                    <AuthProvider>
                        <Slot />
                    </AuthProvider>
        </>
    );
};

export default Layout;
