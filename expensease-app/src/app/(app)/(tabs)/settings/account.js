// app/settings/account.js
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { deleteAccount } from "services/UserService";
import Header from "components/header";

export default function AccountDataScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { logout } = useAuth() || {};
  const [loading, setLoading] = useState(false);

  const styles = createStyles(theme);

  const confirmDelete = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your Expensease account, profile data, groups, and expenses where allowed by law. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDelete },
      ]
    );
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteAccount(); // must be a real API call that deletes immediately or schedules irreversible deletion
      // local cleanup & exit
      await logout?.();
      router.replace("/");
    } catch (e) {
      Alert.alert("Delete failed", e?.message || "Unable to delete account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Account & Data" showBack onBack={() => router.back()} showCoins={false} />
      <View style={styles.container}>
        <Text style={styles.body}>
          You can permanently delete your account at any time. Deleting your account removes your profile and personal data from Expensease.
        </Text>

        {/* Optional helper links */}
        <View style={{ marginTop: 12 }}>
          {/* <TouchableOpacity onPress={() => router.push("settings/privacy")} style={styles.linkRow} activeOpacity={0.8}>
            <Text style={styles.linkText}>View Privacy Policy</Text>
          </TouchableOpacity> */}
          {/* If you offer an export screen, keep it here */}
          {/* <TouchableOpacity onPress={() => router.push("settings/export")} style={styles.linkRow} activeOpacity={0.8}>
            <Text style={styles.linkText}>Export my data (CSV)</Text>
          </TouchableOpacity> */}
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={confirmDelete}
          disabled={loading}
          activeOpacity={0.8}
          style={[styles.deleteBtn, loading && { opacity: 0.7 }]}
        >
          {loading ? <ActivityIndicator /> : <Text style={styles.deleteText}>Delete My Account</Text>}
        </TouchableOpacity>

        {/* (Optional) If you must provide a web flow too, link it below as an alternative */}
        {/* <TouchableOpacity onPress={() => Linking.openURL("https://expensease.in/delete-account")} style={{ marginTop: 12 }}>
          <Text style={[styles.altText]}>Delete via web instead</Text>
        </TouchableOpacity> */}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, marginBottom: 8 },
    body: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
    linkRow: { paddingVertical: 10 },
    linkText: { color: theme.colors.text, fontWeight: "600" },
    deleteBtn: {
      backgroundColor: theme.colors.negative,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    deleteText: { color: theme.colors.background, fontWeight: "800", fontSize: 16 },
    altText: { color: theme.colors.muted, textAlign: "center" },
  });
