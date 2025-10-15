// dropDown.js
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { useTheme } from "context/ThemeProvider";

const SCREEN = Dimensions.get("window");
const MENU_MIN_W = 160;
const MENU_MAX_W = 260;
const MENU_ITEM_H = 44;
const PADDING = 8;

// safer hex -> rgba
const withAlpha = (hex, alpha = 1, fallback = "#000000") => {
  // prefer provided hex; otherwise fallback
  let src = typeof hex === "string" && hex ? hex : fallback;

  // if already rgba(...) just inject alpha best-effort
  if (src.startsWith("rgb")) {
    try {
      const nums = src.replace(/[rgba() ]/g, "").split(",").map(n => parseFloat(n));
      const [r, g, b] = nums;
      return `rgba(${r||0}, ${g||0}, ${b||0}, ${alpha})`;
    } catch {
      // fall through to hex path
      src = fallback;
    }
  }

  let h = src.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  // final guard
  if (h.length !== 6 || Number.isNaN(parseInt(h, 16))) return `rgba(0,0,0,${alpha})`;

  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function Dropdown({
  value,
  options = [],        // <— default to []
  onChange,
  placeholder = "Select…",
  disabled = false,
  style,
  textStyle,
  menuWidth,
  align = "right",
}) {

    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const mode = theme?.mode || {};
    const styles = getStyles(colors, mode);
    
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(null);
  const [anim] = useState(new Animated.Value(0));

  const selected = options.find(o => o?.value === value);

  const openMenu = () => {
    if (disabled) return;
    triggerRef.current?.measureInWindow?.((x, y, w, h) => {
      setLayout({ x, y, w, h });
      setOpen(true);
      Animated.timing(anim, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  };

  const closeMenu = () => {
    Animated.timing(anim, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setOpen(false);
    });
  };

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      if (open) closeMenu();
    });
    return () => sub?.remove?.();
  }, [open]);

  const menuDims = (() => {
    const w = Math.min(Math.max(menuWidth || layout?.w || MENU_MIN_W, MENU_MIN_W), MENU_MAX_W);
    const totalH = Math.min(options.length * MENU_ITEM_H, SCREEN.height * 0.5);

    let top = (layout?.y || 0) + (layout?.h || 0) + 6;
    let left = align === "left" ? (layout?.x || 0) : (layout ? (layout.x + layout.w - w) : 0);

    left = Math.max(PADDING, Math.min(left, SCREEN.width - w - PADDING));

    const spaceBelow = SCREEN.height - top;
    if (spaceBelow < totalH + 16) {
      top = Math.max(PADDING, (layout?.y || 0) - totalH - 6);
    }

    return { w, h: totalH, top, left };
  })();

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });
  const opacity = anim;

  // choose a safe fallback color based on mode if theme is momentarily undefined
  const fallbackBase = mode === "dark" ? "#FFFFFF" : "#000000";

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={[styles.trigger, disabled && styles.triggerDisabled, style]}
        android_ripple={{ color: withAlpha(colors.text, 0.06, fallbackBase) }}
      >
        <Text
          numberOfLines={1}
          style={[styles.triggerText, textStyle, !selected && styles.placeholderText]}
        >
          {selected?.label || placeholder}
        </Text>
        <Animated.Text style={[styles.chev, { transform: [{ rotate: open ? "180deg" : "0deg" }] }]}>
          ▾
        </Animated.Text>
      </Pressable>

      <Modal transparent visible={open} animationType="none" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.menu,
            {
              width: menuDims.w,
              maxHeight: menuDims.h,
              top: menuDims.top,
              left: menuDims.left,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          {options.map((opt, idx) => {
            const active = opt?.value === value;
            return (
              <Pressable
                key={String(opt?.value ?? idx)}
                style={({ pressed }) => [
                  styles.item,
                  active && styles.itemActive,
                  pressed && styles.itemPressed,
                  idx === 0 && styles.itemFirst,
                  idx === options.length - 1 && styles.itemLast,
                ]}
                onPress={() => {
                  onChange?.(opt.value);
                  closeMenu();
                }}
                android_ripple={{ color: withAlpha(colors.text, 0.04, fallbackBase) }}
              >
                <Text numberOfLines={1} style={[styles.itemText, active && styles.itemTextActive]}>
                  {opt?.label ?? ""}
                </Text>
                <View style={[styles.tickWrap, active && styles.tickWrapActive]}>
                  {active ? <Text style={styles.tick}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      </Modal>
    </>
  );
}

const getStyles = (colors = {}, mode = "light") => {
  const baseText = colors.text || (mode === "dark" ? "#f9f9f9" : "#121212");
  const baseBorder = colors.border || (mode === "dark" ? "#2a2a2a" : "#e3e3e3");
  const baseCard = colors.background || (mode === "dark" ? "#191919" : "#FFFFFF");
  const baseMuted = colors.muted || (mode === "dark" ? "#888888" : "#555555");
  const baseCta = colors.cta || colors.primary || "#14b8a6";
  const baseCardMid = colors.cardMid || (mode === "dark" ? "#1F1F1F" : "#E0E0E1");

  return StyleSheet.create({
    trigger: {
      minHeight: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: baseBorder,
      backgroundColor: baseCard,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    triggerDisabled: { opacity: 0.5 },
    triggerText: { fontWeight: "700", color: baseText },
    placeholderText: { color: baseMuted, fontWeight: "600" },
    chev: { marginLeft: 8, opacity: 0.6, color: baseText },

    backdrop: { flex: 1, backgroundColor: withAlpha(baseText, 0.08) },

    menu: {
      position: "absolute",
      borderRadius: 12,
      backgroundColor: baseCard,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: baseBorder,
      ...Platform.select({
        ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
        android: { elevation: 10 },
      }),
    },
    item: {
      minHeight: MENU_ITEM_H,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    itemPressed: { backgroundColor: withAlpha(baseText, 0.04) },
    itemActive: { backgroundColor: baseCardMid },
    itemFirst: {},
    itemLast: {},
    itemText: { fontWeight: "600", color: baseText },
    itemTextActive: { fontWeight: "800", color: baseText },

    tickWrap: {
      width: 22, height: 22, borderRadius: 11,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: baseBorder,
      backgroundColor: "transparent",
    },
    tickWrapActive: { borderColor: baseCta, backgroundColor: withAlpha(baseCta, 0.12) },
    tick: { fontSize: 14, fontWeight: "800", color: baseCta },
  });
};
