// Downloads protected files (ticket PDFs, CSV exports, .ics) with the bearer token and opens the share sheet,
// so the user can save the file, print it or send it to another app.
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { api } from "@/services/api";

export async function saveAndShare(apiPath: string, filename: string, mimeType: string) {
  const url = `${api.apiUrl}${apiPath}`;
  if (Platform.OS === "web") {
    // Web preview: fetch with the token and trigger a browser download.
    const res = await fetch(url, { headers: api.authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    return;
  }
  const dir = new Directory(Paths.cache, "downloads");
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, filename.replace(/[^\w.-]/g, "_"));
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target, { headers: api.authHeaders(), idempotent: true });
  if (!(await Sharing.isAvailableAsync())) throw new Error(`Saved to ${file.uri}, but sharing is not available on this device.`);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : undefined });
}
