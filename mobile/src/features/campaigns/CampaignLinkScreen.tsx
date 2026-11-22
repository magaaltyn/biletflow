import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorView, Field, Loading, Screen, T } from "@/components/ui";
import { campaignTokenFrom } from "@/lib/links";
import { api } from "@/services/api";

/**
 * Opens a Campaign QR / promo link (biletflow://c/<token>, or a pasted https://…/c/<token> link).
 * The token is resolved and validated by the server; the event page then shows the discount (SRS 4.14).
 */
export default function CampaignLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [pasted, setPasted] = useState("");
  const [active, setActive] = useState(token && token !== "paste" ? token : null);
  const q = useQuery({ queryKey: ["campaign", active], enabled: Boolean(active), queryFn: () => api.get<{ slug: string; token: string }>(`/events/campaign/${active}`) });
  if (active && q.data) return <Redirect href={{ pathname: "/event/[slug]", params: { slug: q.data.slug, c: q.data.token } }} />;
  return (
    <Screen>
      <Stack.Screen options={{ title: "Promo link" }} />
      {active && q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorView error={q.error} /> : null}
      <T v="muted">Paste a BiletFlow promo link (…/c/…) to open the event with its discount.</T>
      <Field label="Promo link" value={pasted} onChangeText={setPasted} autoCapitalize="none" />
      <Button title="Open" disabled={!campaignTokenFrom(pasted)} onPress={() => setActive(campaignTokenFrom(pasted))} />
    </Screen>
  );
}
