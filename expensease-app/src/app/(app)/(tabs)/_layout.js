import { Tabs } from 'expo-router';
import Dash from '@/tabIcons/dash.svg';
import Cog from '@/tabIcons/cog.svg';
import Plus from '@/tabIcons/plus.svg';
import User from '@/tabIcons/user.svg';
import Users from '@/tabIcons/users.svg';
import { View, StyleSheet, Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneContainerStyle: { backgroundColor: '#121212' },
        tabBarShowLabel: true,
        tabBarBackground: () => <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#121212', borderTopWidth: Platform.OS == 'android' ? 1 : 0.5, borderTopColor: 'rgba(255,255,255,0.15)', marginTop: -5 }]} />,
        tabBarStyle: { borderTopWidth: 0, backgroundColor: 'rgba(18,18,18,1)' },
        tabBarLabelStyle: { textAlign: 'center', fontSize: 12, fontFramily: 'SwitzerRegular' },
        tabBarInactiveTintColor: '#81827C',
        tabBarActiveTintColor: '#00C49F',
      }}
    >
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarAccessibilityLabel: 'Friends',
          tabBarIcon: ({ color, size, focused }) => (
            <User
              width={size}
              height={size}
              stroke={color}      
              fill="none"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarAccessibilityLabel: 'Groups',
          tabBarIcon: ({ color, size, focused }) => (
            <Users
              width={size}
              height={size}
              stroke={color}      
              fill="none"
            />
          ),
        }}
      />

      <Tabs.Screen
        name="newExpense"
        options={{
          title: '',
          tabBarAccessibilityLabel: 'New Expense',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{backgroundColor: focused?'#00C49F':'#81827C', width: 60, height: 35, alignContent: 'center', alignItems: 'center',justifyContent: 'center', marginTop: 10, borderRadius: 5}}>
              <Plus
              width={30}
              height={30}
              strokeWidth={3}
              />
            </View>
            // <Plus
            //   width={40}
            //   height={40}
            //   stroke={color}      
            //   fill="none"
            // />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarAccessibilityLabel: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Dash
              width={size}
              height={size}
              stroke={color}      
              fill="none"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarAccessibilityLabel: 'Account',
          tabBarIcon: ({ color, size, focused }) => (
            <Cog
              width={size}
              height={size}
              stroke={color}      
              fill="none"
            />
          ),
        }}
      />
      {/* <Tabs.Screen name="guide" options={{ href: null, title: "Guide" }} /> */}
      {/* <Tabs.Screen name="paymentAccounts" options={{ href: null, title: "Payment Accounts" }} /> */}
      <Tabs.Screen name="expenses" options={{ href: null, title: "Expenses" }} />
      {/* <Tabs.Screen name="expenses" options={{ title: "Expenses" }} /> */}
    </Tabs>
  );
}
