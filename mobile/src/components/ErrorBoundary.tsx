import { Component, type ReactNode } from "react";
import { Text, View } from "react-native";

/** Shows a readable message instead of a blank screen if a screen crashes while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "800" }}>Something went wrong</Text>
        <Text style={{ color: "#64748b" }}>{this.state.error.message}</Text>
        <Text accessibilityRole="button" onPress={() => this.setState({ error: null })} style={{ color: "#1d4ed8", fontWeight: "700", paddingVertical: 12 }}>
          Try again
        </Text>
      </View>
    );
  }
}
