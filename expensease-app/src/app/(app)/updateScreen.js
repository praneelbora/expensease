// UpdateScreen.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Platform } from "react-native";

const UpdateScreen = () => {
  const handleUpdate = () => {
    const appStoreUrl = "https://apps.apple.com/app/idXXXXXXXX"; // replace with your App Store link
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.expensease"; // replace with your Play Store link

    const url = Platform.OS === "ios" ? appStoreUrl : playStoreUrl;
    Linking.openURL(url).catch(() => {
      alert("Unable to open store. Please update manually.");
    });
  };

  return (
    <View style={styles.container}>
      {/* App Illustration / Logo */}
      {/* <Image
        source={require("@/assets/update.png")} // add a friendly illustration here
        style={styles.image}
        resizeMode="contain"
      /> */}

      {/* Heading */}
      <Text style={styles.title}>Update Required 🚀</Text>

      {/* Subheading */}
      <Text style={styles.subtitle}>
        A newer version of Expensease is available.  
        Please update to continue managing your expenses with ease!
      </Text>

      {/* Update Button */}
      <TouchableOpacity style={styles.button} onPress={handleUpdate}>
        <Text style={styles.buttonText}>Update Now</Text>
      </TouchableOpacity>

      {/* Optional Note */}
      <Text style={styles.note}>You’ll be redirected to the {Platform.OS === "ios" ? "App Store" : "Play Store"}.</Text>
    </View>
  );
};

export default UpdateScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#EBF1D5",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#EBF1D5",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  button: {
    backgroundColor: "#00C49F",
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  note: {
    marginTop: 18,
    fontSize: 13,
    color: "#999",
    textAlign: "center",
  },
});
