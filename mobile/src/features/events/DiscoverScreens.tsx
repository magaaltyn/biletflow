import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, Empty, ErrorView, Field, Loading, RowView, Screen, T } from "@/components/ui";
import { EventCard } from "@/components/widgets";
import { useAuth } from "@/features/auth/AuthProvider";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { EventCardData } from "@/lib/types";
import { api, qs } from "@/services/api";

type ListResponse = { items: EventCardData[]; total: number; page: number; pageSize: number };
type DateFilter = "" | "week" | "month";

function dateRange(f: DateFilter) {
  if (!f) return {};
  const to = new Date(Date.now() + (f === "week" ? 7 : 31) * 86_400_000);
  return { from: new Date().toISOString(), to: to.toISOString() };
}

const openEvent = (slug: string) => router.push(`/event/${slug}`);

export function HomeScreen() {
  const c = useColors();
  const { t, locale } = useT();
  const { user } = useAuth();
  const featured = useQuery({ queryKey: ["events", "featured"], queryFn: () => api.get<ListResponse>(`/events${qs({ pageSize: 6 })}`) });
  const free = useQuery({ queryKey: ["events", "free"], queryFn: () => api.get<ListResponse>(`/events${qs({ pageSize: 6, free: "true" })}`) });
  const filters = useQuery({ queryKey: ["filters"], queryFn: () => api.get<{ cities: string[]; categories: string[] }>("/events/filters") });
  const refreshing = featured.isRefetching || free.isRefetching;
  const refresh = () => {
    void featured.refetch();
    void free.refetch();
    void filters.refetch();
  };
  const card = (e: EventCardData) => <EventCard key={e.id} e={e} compact locale={locale} freeLabel={t("free")} fromLabel={t("from")} onPress={() => openEvent(e.slug)} />;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={{ backgroundColor: "#081537", borderRadius: 24, padding: 20, gap: 4 }}>
        <T v="h2" color="#fff">{t("heroTitle1")} {t("heroTitle2")}</T>
        <T v="h2" color="#60a5fa">{t("heroTitle3")}</T>
        {user ? <T v="small" color="#cbd5e1">{user.full_name}</T> : null}
      </View>
      <Button title={`🔍  ${t("searchPlaceholder")}`} v="secondary" onPress={() => router.push("/search")} style={{ justifyContent: "flex-start" }} />
      {filters.data?.categories.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {filters.data.categories.map((cat) => (
            <Chip key={cat} label={cat} onPress={() => router.push({ pathname: "/search", params: { category: cat } })} />
          ))}
        </ScrollView>
      ) : null}
      <T v="h2">{t("featured")}</T>
      {featured.isLoading ? <Loading /> : featured.error ? <ErrorView error={featured.error} onRetry={() => featured.refetch()} retryLabel={t("retry")} /> : featured.data?.items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{featured.data.items.map(card)}</ScrollView>
      ) : (
        <Empty title={t("noEvents")} />
      )}
      {free.data?.items.length ? (
        <>
          <T v="h2">{t("freeOnly")}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{free.data.items.map(card)}</ScrollView>
        </>
      ) : null}
      <Button title={t("browseEvents")} onPress={() => router.push("/search")} />
      {!user ? <Button title={t("login")} v="secondary" onPress={() => router.push("/login")} /> : null}
      <T v="small" center color={c.muted}>Prices in KZT · payments are DEMO simulations</T>
    </Screen>
  );
}

export function SearchScreen() {
  const c = useColors();
  const { t, locale } = useT();
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<string>(params.category ?? "");
  const [date, setDate] = useState<DateFilter>("");
  const [freeOnly, setFreeOnly] = useState(false);
  const filters = useQuery({ queryKey: ["filters"], queryFn: () => api.get<{ cities: string[]; categories: string[] }>("/events/filters") });
  const key = useMemo(() => ({ search: applied, city, category, date, freeOnly }), [applied, city, category, date, freeOnly]);
  const list = useInfiniteQuery({
    queryKey: ["events", "search", key],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<ListResponse>(`/events${qs({ search: applied || undefined, city, category, free: freeOnly ? "true" : undefined, page: pageParam, pageSize: 12, ...dateRange(date) })}`),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const header = (
    <View style={{ gap: 10, paddingBottom: 8 }}>
      <RowView>
        <View style={{ flex: 1 }}>
          <Field accessibilityLabel={t("search")} placeholder={t("searchPlaceholder")} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={() => setApplied(search.trim())} />
        </View>
        <Button small title={t("search")} onPress={() => setApplied(search.trim())} />
      </RowView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t("allCities")} active={!city} onPress={() => setCity("")} />
        {filters.data?.cities.map((x) => <Chip key={x} label={x} active={city === x} onPress={() => setCity(city === x ? "" : x)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t("allCategories")} active={!category} onPress={() => setCategory("")} />
        {filters.data?.categories.map((x) => <Chip key={x} label={x} active={category === x} onPress={() => setCategory(category === x ? "" : x)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t("anyDate")} active={!date} onPress={() => setDate("")} />
        <Chip label={t("thisWeek")} active={date === "week"} onPress={() => setDate("week")} />
        <Chip label={t("thisMonth")} active={date === "month"} onPress={() => setDate("month")} />
        <Chip label={t("freeOnly")} active={freeOnly} onPress={() => setFreeOnly(!freeOnly)} />
      </ScrollView>
      {!list.isLoading && !list.error ? <T v="small">{total} · {t("events")}</T> : null}
    </View>
  );

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={items}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <EventCard e={item} locale={locale} freeLabel={t("free")} fromLabel={t("from")} onPress={() => openEvent(item.slug)} />}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={c.brand} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={list.isLoading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={() => list.refetch()} retryLabel={t("retry")} /> : <Empty title={t("noEvents")} />}
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : undefined}
      />
    </SafeAreaView>
  );
}
