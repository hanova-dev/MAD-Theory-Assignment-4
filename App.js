/**
 * 📍 GeoScope — Expo Location + React Native Maps Explorer
 * ─────────────────────────────────────────────────────────
 * Paste into https://snack.expo.dev as App.js
 * Run on  ▶  Android  or  iOS  tab  (NOT Web — maps are native-only)
 *
 * Packages needed (add in Snack's dependency panel):
 *   • expo-location
 *   • react-native-maps
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  ScrollView,
  Platform,
} from "react-native";
import * as Location from "expo-location";

// ─── Web guard — react-native-maps is native-only ────────────────────────────
// On web Snack throws "UIManager.hasViewManagerConfig is not a function"
// So we lazy-import map components only on native.
let MapView, Marker, Circle, Callout, Polyline, PROVIDER_DEFAULT;
if (Platform.OS !== "web") {
  const RNMaps = require("react-native-maps");
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  Circle = RNMaps.Circle;
  Callout = RNMaps.Callout;
  Polyline = RNMaps.Polyline;
  PROVIDER_DEFAULT = RNMaps.PROVIDER_DEFAULT;
}

// ─── Map Style Options ───────────────────────────────────────────────────────
const MAP_STYLES = {
  standard: [],
  dark: [
    { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#16213e" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f3460" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  ],
  retro: [
    { elementType: "geometry", stylers: [{ color: "#ebe3cd" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#523735" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#b9d3c2" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#f5deb3" }] },
  ],
};

const HISTORY_MAX = 6;
const MAP_TYPE_CYCLE = ["standard", "satellite", "hybrid", "terrain"];
const STYLE_CYCLE = ["standard", "dark", "retro"];

// ─── Web Fallback Screen ─────────────────────────────────────────────────────
function WebFallback() {
  return (
    <View style={styles.webFallback}>
      <Text style={styles.webIcon}>🗺️</Text>
      <Text style={styles.webTitle}>Native Only</Text>
      <Text style={styles.webMsg}>
        <Text style={{ color: "#00f5d4" }}>react-native-maps</Text> does not run
        in the Web preview.
      </Text>
      <View style={styles.webSteps}>
        <Text style={styles.webStep}>1️⃣  Open Expo Go on your phone</Text>
        <Text style={styles.webStep}>2️⃣  Scan the QR code in Snack</Text>
        <Text style={styles.webStep}>3️⃣  Or switch to the Android / iOS tab</Text>
      </View>
    </View>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  if (Platform.OS === "web") return <WebFallback />;

  return <NativeApp />;
}

function NativeApp() {
  const mapRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [mapType, setMapType] = useState("standard");
  const [styleKey, setStyleKey] = useState("standard");
  const [trail, setTrail] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [speed, setSpeed] = useState(null);
  const subscriptionRef = useRef(null);

  // ── Entrance animation ────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // ── Pulse animation when location arrives ─────────────────────────────────
  useEffect(() => {
    if (!location) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [location, pulseAnim]);

  // ── Cleanup watcher on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => { subscriptionRef.current?.remove(); };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const applyLocation = useCallback((loc) => {
    const { latitude, longitude, accuracy: acc, altitude: alt, speed: spd } = loc.coords;
    setLocation({ latitude, longitude });
    setAccuracy(acc?.toFixed(0));
    setAltitude(alt?.toFixed(1));
    setSpeed(spd != null && spd >= 0 ? (spd * 3.6).toFixed(1) : null);
    setTrail((prev) => [...prev, { latitude, longitude }].slice(-HISTORY_MAX));
  }, []);

  const animateTo = useCallback((coords) => {
    mapRef.current?.animateToRegion(
      { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      900
    );
  }, []);

  // ── Get location once ─────────────────────────────────────────────────────
  const getLocation = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setErrorMsg("Permission denied — enable location in device Settings.");
      setLoading(false);
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    applyLocation(loc);
    animateTo(loc.coords);
    setLoading(false);
  };

  // ── Toggle live tracking ──────────────────────────────────────────────────
  const toggleWatch = async () => {
    if (watching) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      setWatching(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setErrorMsg("Permission denied."); return; }
    setWatching(true);
    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      (loc) => { applyLocation(loc); animateTo(loc.coords); }
    );
  };

  const nextMapType = () => {
    setMapType((t) => MAP_TYPE_CYCLE[(MAP_TYPE_CYCLE.indexOf(t) + 1) % MAP_TYPE_CYCLE.length]);
  };
  const nextStyle = () => {
    setStyleKey((s) => STYLE_CYCLE[(STYLE_CYCLE.indexOf(s) + 1) % STYLE_CYCLE.length]);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={styles.headerTitle}>📍 GeoScope</Text>
        <Text style={styles.headerSub}>Expo Location + Maps Explorer</Text>
      </Animated.View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          mapType={mapType}
          customMapStyle={MAP_STYLES[styleKey]}
          showsCompass
          showsScale
          showsBuildings
          initialRegion={{ latitude: 33.6844, longitude: 73.0479, latitudeDelta: 0.5, longitudeDelta: 0.5 }}
        >
          {/* Trail polyline */}
          {trail.length > 1 && (
            <Polyline
              coordinates={trail}
              strokeColor="#00f5d4"
              strokeWidth={3}
              lineDashPattern={[6, 4]}
            />
          )}

          {/* Accuracy circle */}
          {location && accuracy && (
            <Circle
              center={location}
              radius={Number(accuracy)}
              strokeColor="rgba(0,245,212,0.6)"
              fillColor="rgba(0,245,212,0.08)"
              strokeWidth={1.5}
            />
          )}

          {/* Main marker + Callout */}
          {location && (
            <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.markerWrapper}>
                <Animated.View style={[styles.markerPing, { transform: [{ scale: pulseAnim }] }]} />
                <View style={styles.markerDot} />
              </View>
              <Callout tooltip>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>📍 You are here</Text>
                  <Text style={styles.calloutRow}>Lat: <Text style={styles.calloutVal}>{location.latitude.toFixed(6)}°</Text></Text>
                  <Text style={styles.calloutRow}>Lng: <Text style={styles.calloutVal}>{location.longitude.toFixed(6)}°</Text></Text>
                  {altitude != null && <Text style={styles.calloutRow}>Alt: <Text style={styles.calloutVal}>{altitude} m</Text></Text>}
                  {accuracy != null && <Text style={styles.calloutRow}>Accuracy: <Text style={styles.calloutVal}>±{accuracy} m</Text></Text>}
                </View>
              </Callout>
            </Marker>
          )}

          {/* Historical trail dots */}
          {trail.slice(0, -1).map((pt, i) => (
            <Marker key={i} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} flat>
              <View style={styles.trailDot} />
            </Marker>
          ))}
        </MapView>

        <View style={styles.layerBadge}>
          <Text style={styles.layerText}>{mapType.toUpperCase()} · {styleKey.toUpperCase()}</Text>
        </View>
      </View>

      {/* Stats card */}
      <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {errorMsg ? (
          <Text style={styles.error}>{errorMsg}</Text>
        ) : location ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            <StatChip icon="🌐" label="Latitude"  value={`${location.latitude.toFixed(5)}°`} />
            <StatChip icon="🌐" label="Longitude" value={`${location.longitude.toFixed(5)}°`} />
            {accuracy != null && <StatChip icon="🎯" label="Accuracy" value={`±${accuracy} m`} />}
            {altitude != null && <StatChip icon="⛰️" label="Altitude"  value={`${altitude} m`} />}
            {speed != null    && <StatChip icon="🚀" label="Speed"     value={`${speed} km/h`} />}
            <StatChip icon="🗺️" label="Trail pts" value={`${trail.length}`} />
          </ScrollView>
        ) : (
          <Text style={styles.placeholder}>Tap a button below to get your location</Text>
        )}
      </Animated.View>

      {/* Buttons */}
      <Animated.View style={[styles.controls, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={getLocation} disabled={loading} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#0d0d1a" /> : <Text style={styles.btnTextDark}>📍 Get Location</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, watching ? styles.btnDanger : styles.btnSecondary]} onPress={toggleWatch} activeOpacity={0.8}>
          <Text style={styles.btnText}>{watching ? "⏹ Stop" : "🔴 Live"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnMuted]} onPress={nextMapType} activeOpacity={0.8}>
          <Text style={styles.btnText}>🗺 Layer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnMuted]} onPress={nextStyle} activeOpacity={0.8}>
          <Text style={styles.btnText}>🎨 Style</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Legend */}
      <Animated.View style={[styles.legend, { opacity: fadeAnim }]}>
        <Text style={styles.legendTitle}>Components Used</Text>
        <View style={styles.legendRow}>
          {["MapView","Marker","Circle","Callout","Polyline"].map((c) => (
            <View key={c} style={styles.chip}><Text style={styles.chipText}>{c}</Text></View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function StatChip({ icon, label, value }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a" },

  // Web fallback
  webFallback: { flex: 1, backgroundColor: "#0d0d1a", alignItems: "center", justifyContent: "center", padding: 32 },
  webIcon:    { fontSize: 64, marginBottom: 16 },
  webTitle:   { fontSize: 26, fontWeight: "800", color: "#00f5d4", marginBottom: 10 },
  webMsg:     { color: "#8888aa", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  webSteps:   { backgroundColor: "#111126", borderRadius: 14, padding: 20, borderWidth: 1, borderColor: "#1e1e3a", width: "100%" },
  webStep:    { color: "#aaaacc", fontSize: 14, marginVertical: 6 },

  // Header
  header:     { paddingTop: Platform.OS === "ios" ? 52 : 40, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: "#0d0d1a" },
  headerTitle:{ fontSize: 26, fontWeight: "800", color: "#00f5d4", letterSpacing: 0.5 },
  headerSub:  { fontSize: 12, color: "#5a5a8a", marginTop: 2, letterSpacing: 1, textTransform: "uppercase" },

  // Map
  mapContainer: { flex: 1, marginHorizontal: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#1e1e3a" },
  map:          { flex: 1 },
  layerBadge:   { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(13,13,26,0.82)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#00f5d4" },
  layerText:    { color: "#00f5d4", fontSize: 9, fontWeight: "700", letterSpacing: 1 },

  // Marker
  markerWrapper: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  markerDot:     { width: 14, height: 14, borderRadius: 7, backgroundColor: "#00f5d4", borderWidth: 2, borderColor: "#fff", position: "absolute" },
  markerPing:    { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,245,212,0.2)", borderWidth: 1.5, borderColor: "rgba(0,245,212,0.5)", position: "absolute" },
  trailDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(0,245,212,0.55)", borderWidth: 1, borderColor: "#00f5d4" },

  // Callout
  callout:      { backgroundColor: "#12122a", borderRadius: 12, padding: 12, minWidth: 180, borderWidth: 1, borderColor: "#00f5d4" },
  calloutTitle: { color: "#00f5d4", fontWeight: "700", fontSize: 13, marginBottom: 6 },
  calloutRow:   { color: "#8888aa", fontSize: 12, marginVertical: 1 },
  calloutVal:   { color: "#fff", fontWeight: "600" },

  // Stats card
  card:        { marginHorizontal: 12, marginTop: 10, backgroundColor: "#111126", borderRadius: 14, borderWidth: 1, borderColor: "#1e1e3a", paddingVertical: 10, paddingHorizontal: 4, minHeight: 68, justifyContent: "center" },
  statsRow:    { paddingHorizontal: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  statChip:    { backgroundColor: "#1a1a35", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#2a2a4a", minWidth: 88 },
  statIcon:    { fontSize: 16 },
  statLabel:   { color: "#5a5a8a", fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  statValue:   { color: "#00f5d4", fontSize: 12, fontWeight: "700", marginTop: 2 },
  placeholder: { color: "#3a3a5a", textAlign: "center", fontSize: 13, fontStyle: "italic" },
  error:       { color: "#ff6b8a", textAlign: "center", fontSize: 13, paddingHorizontal: 12 },

  // Controls
  controls:     { flexDirection: "row", marginHorizontal: 12, marginTop: 10, gap: 8 },
  btn:          { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnPrimary:   { backgroundColor: "#00f5d4" },
  btnSecondary: { backgroundColor: "#1a1a35", borderWidth: 1, borderColor: "#00f5d4" },
  btnDanger:    { backgroundColor: "#2a1020", borderWidth: 1, borderColor: "#ff6b8a" },
  btnMuted:     { backgroundColor: "#1a1a35", borderWidth: 1, borderColor: "#2a2a4a" },
  btnText:      { color: "#fff", fontSize: 11, fontWeight: "700" },
  btnTextDark:  { color: "#0d0d1a", fontSize: 11, fontWeight: "800" },

  // Legend
  legend:     { marginHorizontal: 12, marginTop: 8, marginBottom: 14, alignItems: "center" },
  legendTitle:{ color: "#3a3a5a", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  legendRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  chip:       { backgroundColor: "#1a1a35", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#2a2a4a" },
  chipText:   { color: "#6a6aaa", fontSize: 10 },
});