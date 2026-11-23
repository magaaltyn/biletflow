import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { webDict } from "./i18nWeb";

export type Lang = "ru" | "kk" | "en";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
  { code: "en", label: "English" },
];

// Mobile-only strings (customer-facing screens). Organizer, staff and admin screens are English, like the website.
const mobileDict = {
  home: { ru: "Главная", kk: "Басты бет", en: "Home" },
  myTickets: { ru: "Мои билеты", kk: "Билеттерім", en: "My tickets" },
  notifications: { ru: "Уведомления", kk: "Хабарламалар", en: "Notifications" },
  featured: { ru: "Рекомендуем", kk: "Ұсынамыз", en: "Featured" },
  upcomingEvents: { ru: "Ближайшие события", kk: "Жақын іс-шаралар", en: "Upcoming events" },
  thisWeek: { ru: "На этой неделе", kk: "Осы аптада", en: "This week" },
  thisMonth: { ru: "В этом месяце", kk: "Осы айда", en: "This month" },
  share: { ru: "Поделиться", kk: "Бөлісу", en: "Share" },
  orders: { ru: "Заказы", kk: "Тапсырыстар", en: "Orders" },
  refunded: { ru: "Возвращённые", kk: "Қайтарылған", en: "Refunded" },
  viewEvent: { ru: "Событие", kk: "Іс-шара", en: "View event" },
  viewOrder: { ru: "Заказ", kk: "Тапсырыс", en: "View order" },
  retry: { ru: "Повторить", kk: "Қайталау", en: "Try again" },
  loading: { ru: "Загрузка…", kk: "Жүктелуде…", en: "Loading…" },
  welcomeTitle: { ru: "Билеты на события Казахстана", kk: "Қазақстан іс-шараларына билеттер", en: "Tickets for events across Kazakhstan" },
  continueAsGuest: { ru: "Смотреть без входа", kk: "Кірмей қарау", en: "Browse without an account" },
  forgotPassword: { ru: "Забыли пароль?", kk: "Құпиясөзді ұмыттыңыз ба?", en: "Forgot password?" },
  language: { ru: "Язык", kk: "Тіл", en: "Language" },
  markAllRead: { ru: "Прочитать все", kk: "Барлығын оқу", en: "Mark all read" },
  noNotifications: { ru: "Уведомлений нет", kk: "Хабарлама жоқ", en: "No notifications yet" },
  noTickets: { ru: "Билетов пока нет", kk: "Әзірге билет жоқ", en: "No tickets yet" },
  noOrders: { ru: "Заказов пока нет", kk: "Әзірге тапсырыс жоқ", en: "No orders yet" },
  cancelOrder: { ru: "Отменить заказ", kk: "Тапсырыстан бас тарту", en: "Cancel order" },
  workspace: { ru: "Рабочее пространство", kk: "Жұмыс кеңістігі", en: "Workspace" },
  editProfile: { ru: "Редактировать профиль", kk: "Профильді өзгерту", en: "Edit profile" },
  save: { ru: "Сохранить", kk: "Сақтау", en: "Save" },
  phone: { ru: "Телефон", kk: "Телефон", en: "Phone" },
  changePassword: { ru: "Сменить пароль", kk: "Құпиясөзді өзгерту", en: "Change password" },
  verifyEmail: { ru: "Подтвердите эл. почту", kk: "Эл. поштаны растаңыз", en: "Please verify your email" },
  resend: { ru: "Отправить ещё раз", kk: "Қайта жіберу", en: "Resend" },
  ticketQr: { ru: "QR-код билета", kk: "Билеттің QR-коды", en: "Ticket QR code" },
  notValidForEntry: { ru: "Недействителен для входа", kk: "Кіруге жарамсыз", en: "Not valid for entry" },
  demoPayTitle: { ru: "ДЕМО-ОПЛАТА — СИМУЛЯЦИЯ, БЕЗ РЕАЛЬНЫХ ДЕНЕГ", kk: "ДЕМО-ТӨЛЕМ — СИМУЛЯЦИЯ, НАҚТЫ АҚШАСЫЗ", en: "DEMO PAYMENT — SIMULATION, NO REAL MONEY" },
  paySuccess: { ru: "Симулировать успешную оплату", kk: "Сәтті төлемді симуляциялау", en: "Simulate successful payment" },
  payFail: { ru: "Симулировать неудачную оплату", kk: "Сәтсіз төлемді симуляциялау", en: "Simulate failed payment" },
};

const dict = { ...webDict, ...mobileDict };
export type Key = keyof typeof dict;

const LANG_KEY = "bf_lang";
const store = {
  get: async () => (Platform.OS === "web" ? globalThis.localStorage?.getItem(LANG_KEY) ?? null : SecureStore.getItemAsync(LANG_KEY)),
  set: async (v: string) => (Platform.OS === "web" ? globalThis.localStorage?.setItem(LANG_KEY, v) : SecureStore.setItemAsync(LANG_KEY, v)),
};

function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === "kk" ? "kk" : code === "en" ? "en" : "ru";
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; locale: string }>({
  lang: "ru",
  setLang: () => undefined,
  t: (k) => dict[k].ru,
  locale: "ru-RU",
});

export const localeOf = (lang: Lang) => (lang === "en" ? "en-GB" : lang === "kk" ? "kk-KZ" : "ru-RU");

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLang);
  useEffect(() => {
    store.get().then((saved) => {
      if (saved === "ru" || saved === "kk" || saved === "en") setLangState(saved);
    }).catch(() => undefined);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    store.set(l).catch(() => undefined);
  };
  return <LangContext.Provider value={{ lang, setLang, t: (k) => dict[k][lang], locale: localeOf(lang) }}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);
