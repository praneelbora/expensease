// app/coins.js
import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Header from "components/header";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";

/**
 * Coins info page
 * - explains what coins are
 * - how to earn them
 * - how to spend them (e.g., avatar cost)
 * - shows current balance and simple actions
 */
export default function CoinsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, loadUserData } = useAuth() || {};

  const coins = Number(user?.coins ?? 0);
  const AVATAR_COST = 1; // keep in sync with app logic

  const handleBuy = useCallback(() => {
    // Replace with your real purchase flow. For now show a simple alert.
    Alert.alert(
      "Buy Coins",
      "Buying coins is not implemented in this demo. Integrate your payment flow here.",
      [{ text: "OK" }]
    );
  }, []);

//   const handleEarn = useCallback(() => {
//     // Example earn: invite friends -> open share sheet or external link
//     Linking.openURL("https://www.expensease.in/invite").catch(() => {
//       Alert.alert("Open invite", "Unable to open invite link.");
//     });
//   }, []);

  const handleRefresh = async () => {
    try {
      if (typeof loadUserData === "function") {
        await loadUserData();
      }
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
      <Header title="Coins" showBack onBack={() => router.back()} showCoins={false} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your balance</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coinBadge}>
              <Text style={styles.coinBadgeSymbol}>◈</Text>
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.balanceAmount}>{coins}</Text>
              <Text style={styles.balanceLabel}>Available coins</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {/* <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={handleBuy}>
              <Text style={styles.btnTextPrimary}>Buy Coins</Text>
            </TouchableOpacity> */}

            {/* <TouchableOpacity style={[styles.btn, styles.ghostBtn]} onPress={handleEarn}>
              <Text style={styles.btnTextGhost}>Earn Coins</Text>
            </TouchableOpacity> */}

            <TouchableOpacity style={[styles.btn, styles.ghostBtn]} onPress={handleRefresh}>
              <Text style={styles.btnTextGhost}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.h2}>What are coins?</Text>
          <Text style={styles.p}>
            Coins are an in-app currency you can spend on cosmetic and convenience features —
            for example, to change to certain special avatars.
            Coins are non-monetary reward units inside the app.
          </Text>

          <Text style={styles.h2}>How to get coins</Text>
          <View style={styles.list}>
            {/* <Text style={styles.li}>• Invite friends — get coins when they join.</Text> */}
            {/* <Text style={styles.li}>• Complete onboarding tasks.</Text> */}
            {/* <Text style={styles.li}>• Occasional promotions and events.</Text> */}
            <Text style={styles.li}>• Purchase coins via in-app payments (coming soon).</Text>
          </View>

          <Text style={styles.h2}>How to spend</Text>
          <Text style={styles.p}>
            Each special avatar costs <Text style={styles.bold}>{AVATAR_COST} coin{AVATAR_COST > 1 ? "s" : ""}</Text>.
            When you confirm a purchase, coins will be deducted and your avatar updated.
            If you run out of coins you won't be able to set paid avatars until you earn or buy more.
          </Text>

          <Text style={styles.h2}>Safety & refunds</Text>
          <Text style={styles.p}>
            Coins purchases and spending are final. We may offer refunds or restore coins for platform-level failures,
            but manual restore requests must be sent to support.
          </Text>

          <Text style={styles.h2}>Questions?</Text>
          <Text style={styles.p}>
            If you need help, contact support via the Contact screen or email us at email.expensease@gmail.com
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    container: {
      padding: 16,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.colors.primary,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 8,
    },
    balanceRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    coinBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: `${theme.colors.primary}33`,
      backgroundColor: `${theme.colors.primary}11`,
    },
    coinBadgeSymbol: {
      color: theme.colors.primary,
      fontSize: 18,
      fontWeight: "800",
    },
    balanceAmount: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "900",
    },
    balanceLabel: {
      color: theme.colors.muted,
      fontSize: 13,
    },
    actionsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
      justifyContent: "space-between",
    },
    btn: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
    },
    btnTextPrimary: {
      color: theme.mode === "dark" ? "#000" : "#fff",
      fontWeight: "800",
    },
    ghostBtn: {
      backgroundColor: theme.colors.cardAlt ?? theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    btnTextGhost: {
      color: theme.colors.text,
      fontWeight: "700",
    },

    infoCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    h2: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 6,
    },
    p: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 8,
    },
    list: {
      marginBottom: 8,
    },
    li: {
      color: theme.colors.muted,
      fontSize: 14,
      marginBottom: 6,
    },
    bold: {
      fontWeight: "800",
      color: theme.colors.text,
    },
  });
